// cloudfunctions/dietRecommend/index.js
// V5.3 修复版 - 增强数据库查询容错

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ✅ 引入 AI 文案引擎（如果有的话）
// const { generateDishReason, TONE } = require('./diet-ai-writer')

function deduplicateByName(dishes = []) {
  const seen = new Set()
  const result = []
  
  for (const dish of dishes) {
    if (!dish || !dish.name) continue
    
    // 标准化菜名（去掉空格、括号内容等）
    const normalizedName = dish.name
      .replace(/\s+/g, '')           // 去空格
      .replace(/（.*?）/g, '')        // 去中文括号
      .replace(/\(.*?\)/g, '')        // 去英文括号
      .toLowerCase()
    
    if (!seen.has(normalizedName)) {
      seen.add(normalizedName)
      result.push(dish)
    }
  }
  
  return result
}

exports.main = async (event) => {
  const {
    date, 
    people = { adults: 2, kids: 0, elders: 0 }, 
    budget = '实惠',
    mode = '日常',
    dietPref = [], 
    weather = {}, 
    solarTerm = '',
    tone = '温柔', 
    recentMenus = [], 
    excludeDishes = [],
    healthGoals = [],
    allergies = [],
    regionProfile = null
  } = event || {}

  try {
    console.log('========== V5.3 dietRecommend 开始 ==========')
    console.log('请求参数:', { date, people, budget, mode, allergies })
    
    // ===== 步骤1: 从数据库加载菜谱 =====
    const recipes = await loadRecipesFromDB(allergies)
    
    if (!recipes || recipes.length === 0) {
      console.log('❌ 数据库无数据，使用兜底')
      return generateFallbackPool()
    }

    console.log(`✅ 从数据库加载了 ${recipes.length} 道菜`)

    // ===== 步骤2: 构建上下文 =====
    const ctx = { 
      date, 
      people: typeof people === 'object' ? people : { adults: people, kids: 0, elders: 0 },
      peopleCount: (typeof people === 'object' ? people.adults + people.kids * 0.6 + people.elders * 0.85 : people),
      budget, 
      mode,
      dietPref, 
      weather, 
      solarTerm, 
      aiTone: tone, 
      recentMenus, 
      excludeDishes,
      hasKids: (typeof people === 'object' ? people.kids : 0) > 0,
      healthGoals: healthGoals,
      trendyQuota: calculateTrendyQuota(budget, mode)
    }

    // ===== 步骤3: 标准化数据 =====
    const normalizedRecipes = recipes.map(recipe => normalizeRecipe(recipe))
    
    console.log('标准化后分类统计:', {
      荤菜: normalizedRecipes.filter(r => r.course_cn === '荤菜').length,
      素菜: normalizedRecipes.filter(r => r.course_cn === '素菜').length,
      汤类: normalizedRecipes.filter(r => r.course_cn === '汤类').length,
      主食: normalizedRecipes.filter(r => r.course_cn === '主食').length
    })

    // ===== 步骤4: 过滤和评分 =====
    let pool = filterByContext(normalizedRecipes, ctx)
    console.log(`过滤后剩余: ${pool.length} 道菜`)
    
    if (pool.length < 30) {
      console.log('⚠️ 池子太小，放宽条件')
      pool = normalizedRecipes // 使用全部
    }

    const ranked = pool.map(d => ({ d, s: scoreDish(d, ctx) }))
                       .sort((a, b) => b.s - a.s)

    console.log('✅ 评分前10名:')
    ranked.slice(0, 10).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.d.name} - ${Math.round(item.s)}分 [${item.d.course_cn}]`)
    })

    // ===== 步骤5: 生成候选池 =====
    const candidatePool = {
      meat: generateCategoryPool(ranked, '荤菜', 9, ctx),
      veg: generateCategoryPool(ranked, '素菜', 6, ctx),
      soup: generateCategoryPool(ranked, '汤类', 3, ctx),
      staple: generateCategoryPool(ranked, '主食', 3, ctx)
    }

    // ✅ 新增：给每个分类去重
const dedupedPool = {
  meat: deduplicateByName(candidatePool.meat),
  veg: deduplicateByName(candidatePool.veg),
  soup: deduplicateByName(candidatePool.soup),
  staple: deduplicateByName(candidatePool.staple)
}
    // ===== 步骤6: 补充不足的分类 =====
    console.log('候选池数量:', {
      荤菜: candidatePool.meat.length,
      素菜: candidatePool.veg.length,
      汤类: candidatePool.soup.length,
      主食: candidatePool.staple.length
    })

    if (candidatePool.meat.length === 0) {
      console.log('⚠️ 荤菜不足，用兜底补充')
      candidatePool.meat = getFallbackByCategory('荤菜', 10)
    }
    if (candidatePool.veg.length === 0) {
      console.log('⚠️ 素菜不足，用兜底补充')
      candidatePool.veg = getFallbackByCategory('素菜', 8)
    }
    if (candidatePool.soup.length === 0) {
      console.log('⚠️ 汤类不足，用兜底补充')
      candidatePool.soup = getFallbackByCategory('汤类', 4)
    }
    if (candidatePool.staple.length === 0) {
      console.log('⚠️ 主食不足，用兜底补充')
      candidatePool.staple = getFallbackByCategory('主食', 4)
    }

    // ===== 步骤7: 生成购物清单 =====
    const recommended = [
      ...(candidatePool.meat.slice(0, 2) || []),
      ...(candidatePool.veg.slice(0, 2) || []),
      ...(candidatePool.soup.slice(0, 1) || [])
    ]

    const shoppingList = generateLocalShoppingList(recommended, ctx.peopleCount || 2)

    console.log('========== ✅ dietRecommend 完成 ==========')

    return { 
      ok: true,
      candidatePool: dedupedPool,  // ← 改这里
      candidatePool: candidatePool,
      shoppingList: shoppingList || [],
      mealConfig: {
        budget: budget,
        mode: mode,
        totalCount: candidatePool.meat.length + candidatePool.veg.length + 
                    candidatePool.soup.length + candidatePool.staple.length
      }
    }

  } catch (e) {
    console.error('❌ dietRecommend 错误:', e)
    console.error('错误堆栈:', e.stack)
    
    return generateFallbackPool()
  }
}

// ==================== 数据库加载 ====================
async function loadRecipesFromDB(allergies = []) {
  try {
    console.log('📊 开始从数据库加载菜谱...')
    
    // ✅ 使用布尔字段查询（更准确）
    try {
      const [荤菜类, 素菜类, 汤类, 主食类] = await Promise.all([
        db.collection('recipes').where({ is_meat: true }).limit(500).get(),
        db.collection('recipes').where({ is_veg: true }).limit(500).get(),
        db.collection('recipes').where({ is_soup: true }).limit(200).get(),
        db.collection('recipes').where({ is_staple: true }).limit(200).get()
      ])
      
      const total = 荤菜类.data.length + 素菜类.data.length + 汤类.data.length + 主食类.data.length
      
      if (total > 0) {
        console.log(`✅ 按布尔字段查询成功: 荤${荤菜类.data.length} 素${素菜类.data.length} 汤${汤类.data.length} 主食${主食类.data.length}`)
        return [...荤菜类.data, ...素菜类.data, ...汤类.data, ...主食类.data]
      }
    } catch (e) {
      console.log('⚠️ 按布尔字段查询失败，尝试其他方案', e.message)
    }
    
    // ✅ 方案2: 尝试按 dish_category 查询
    try {
      const [荤菜类, 素菜类, 汤类, 主食类] = await Promise.all([
        db.collection('recipes').where({ dish_category: '荤菜' }).limit(500).get(),
        db.collection('recipes').where({ dish_category: '素菜' }).limit(500).get(),
        db.collection('recipes').where({ dish_category: '汤类' }).limit(200).get(),
        db.collection('recipes').where({ dish_category: '主食' }).limit(200).get()
      ])
      
      const total = 荤菜类.data.length + 素菜类.data.length + 汤类.data.length + 主食类.data.length
      
      if (total > 0) {
        console.log(`✅ 按dish_category查询成功: 荤${荤菜类.data.length} 素${素菜类.data.length} 汤${汤类.data.length} 主食${主食类.data.length}`)
        return [...荤菜类.data, ...素菜类.data, ...汤类.data, ...主食类.data]
      }
    } catch (e) {
      console.log('⚠️ 按dish_category查询失败，尝试全量查询', e.message)
    }
    
    // ✅ 方案3: 全量查询（前1000条）
    console.log('📊 尝试全量查询（前1000条）...')
    const allRecipes = await db.collection('recipes').limit(1000).get()
    
    if (allRecipes.data.length > 0) {
      console.log(`✅ 全量查询成功: 共${allRecipes.data.length}道菜`)
      return allRecipes.data
    }
    
    console.log('❌ 数据库完全无数据')
    return null
    
  } catch (e) {
    console.error('❌ 加载菜谱数据失败:', e)
    return null
  }
}

// ==================== 数据标准化 ====================
function normalizeRecipe(recipe) {
  // ✅ 优先使用 is_meat/is_veg/is_soup 布尔字段（最准确）
  let courseCn = null
  
  if (recipe.is_meat === true) {
    courseCn = '荤菜'
  } else if (recipe.is_veg === true) {
    courseCn = '素菜'
  } else if (recipe.is_soup === true) {
    courseCn = '汤类'
  } else if (recipe.is_staple === true) {
    courseCn = '主食'
  }
  
  // 如果没有布尔字段，才使用文本字段
  if (!courseCn) {
    courseCn = recipe.dish_category || recipe.course_cn || inferCourseCn(recipe)
  }
  
  return {
    ...recipe,
    _id: recipe._id || recipe.id,
    name: recipe.name || '未命名菜品',
    time: recipe.time_min || recipe.time || 15,
    course_cn: courseCn, // 统一字段
    budget: recipe.cost_band || '小资',
    protein: inferProtein(recipe),
    tags: recipe.tags || [],
    style_tags: recipe.style_tags || [],
    for_children: recipe.for_children || false,
    is_vegan: recipe.is_vegan || false,
    ingredients: recipe.ingredients || { main: [], aux: [], seasoning: [] }
  }
}

function inferCourseCn(recipe) {
  const type = String(recipe.type || '').trim()
  const name = recipe.name || ''
  
  // 根据 type 字段推断
  const typeMap = {
    '主菜': '荤菜', '荤菜': '荤菜', '肉菜': '荤菜', 'meat': '荤菜',
    '配菜': '素菜', '素菜': '素菜', '素': '素菜', 'vege': '素菜', '蔬菜': '素菜',
    '汤': '汤类', '汤品': '汤类', '汤类': '汤类', 'soup': '汤类',
    '主食': '主食', 'staple': '主食', 'main': '主食'
  }
  
  if (typeMap[type]) return typeMap[type]
  
  // 根据名称推断
  if (/汤|羹|粥/.test(name)) return '汤类'
  if (/饭|面|粉|饺|馄饨|馒头|包子|饼|披萨/.test(name)) return '主食'
  if (recipe.is_vegan === true) return '素菜'
  
  // 根据 is_meat/is_veg 推断
  if (recipe.is_meat === true) return '荤菜'
  if (recipe.is_veg === true) return '素菜'
  if (recipe.is_soup === true) return '汤类'
  if (recipe.is_staple === true) return '主食'
  
  // 默认荤菜
  return '荤菜'
}

function inferProtein(recipe) {
  const ingredients = recipe.ingredients || []
  const tags = recipe.tags || []
  let ingredientsText = ''
  
  if (ingredients.main || ingredients.aux || ingredients.seasoning) {
    const allIng = [
      ...(ingredients.main || []),
      ...(ingredients.aux || []),
      ...(ingredients.seasoning || [])
    ]
    ingredientsText = JSON.stringify(allIng)
  } else {
    ingredientsText = JSON.stringify(ingredients)
  }
  
  if (hasAny(tags, ['素菜', '素食'])) return '素'
  if (recipe.is_vegan === true) return '素'
  
  const meatKeywords = ['肉', '鸡', '鸭', '鱼', '虾', '蟹', '牛', '猪', '羊', '海鲜']
  const hasMeat = meatKeywords.some(keyword => ingredientsText.includes(keyword))
  
  const vegKeywords = ['菜', '豆腐', '蛋']
  const hasVeg = vegKeywords.some(keyword => ingredientsText.includes(keyword))
  
  if (hasMeat && hasVeg) return '混合'
  if (hasMeat) return '荤'
  return '素'
}

// ==================== 过滤和评分 ====================
function filterByContext(list, ctx) {
  if (!Array.isArray(list)) return []
  
  const { dietPref = [], excludeDishes = [] } = ctx || {}
  
  return list.filter(d => {
    if (!d) return false
    if (excludeDishes.includes(d.name)) return false
    if (dietPref.includes('素食') && d.protein !== '素') return false
    if (dietPref.includes('少辣') && hasSpicy(d)) return false
    return true
  })
}

function scoreDish(d, ctx) {
  let s = 50
  
  // 天气加分
  s += weatherScore(d, ctx.weather || {})
  
  // 偏好加分
  s += prefScore(d, ctx.dietPref || [])
  
  // 预算加分
  s += budgetScore(d, ctx.budget)
  
  // 健康目标加分
  s += healthGoalScore(d, ctx.healthGoals || [])
  
  // 儿童友好
  if (ctx.hasKids) {
    if (d.for_children === true) s += 15
    if (hasSpicy(d)) s -= 20
  }
  
  // 重复惩罚
  s -= repeatPenalty(d, ctx.recentMenus || [])
  
  // 随机扰动
  s += Math.random() * 10 - 5

  return s
}

function weatherScore(d, w) {
  if (!w || !w.temp) return 0
  const t = Number(w.temp) || 20
  const tags = d.tags || []
  
  if (t >= 30 && hasAny(tags, ['清爽', '低油', '凉拌'])) return 10
  if (t <= 10 && hasAny(tags, ['温补', '炖', '热量'])) return 8
  
  return 0
}

function prefScore(d, prefs = []) {
  const tags = d.tags || []
  let sc = 0
  
  if (prefs.includes('清淡') && hasAny(tags, ['清淡', '低油'])) sc += 8
  if (prefs.includes('高蛋白') && hasAny(tags, ['高蛋白'])) sc += 8
  
  return Math.min(sc, 15)
}

function healthGoalScore(d, goals = []) {
  let score = 0
  const tags = d.tags || []
  
  goals.forEach(goal => {
    if (goal === '减脂' && tags.includes('清淡')) score += 20
    if (goal === '高蛋白' && tags.includes('高蛋白')) score += 25
  })
  
  return Math.min(score, 30)
}

function budgetScore(d, budget) {
  if (!budget || !d.budget) return 0
  return d.budget === budget ? 8 : 0
}

function repeatPenalty(d, recent = []) {
  const names = new Set(recent.flatMap(x => (x?.items || x?.dishes || [])?.map?.(i => i.name) || []))
  return names.has(d.name) ? 20 : 0
}

function hasAny(arr = [], keys = []) { 
  return keys.some(k => arr.includes(k)) 
}

function hasSpicy(d) { 
  return hasAny(d.tags || [], ['麻辣', '香辣', '重辣', '川菜', '湘菜']) 
}

// ==================== 候选池生成 ====================
function calculateTrendyQuota(budget, mode) {
  if (mode === '日常') {
    return 1 // 家常模式：10道只给1个洋气
  }
  return mode === '灵感' ? 3 : 1
}

function generateCategoryPool(ranked, category, count, ctx) {
  console.log(`  🔍 生成${category}候选池，目标${count}道`)
  
  const maxTrendy = category === '荤菜' ? (ctx.trendyQuota || 0) : 0
  let trendyCount = 0
  
  const filtered = ranked
    .filter(r => r.d.course_cn === category)
    .filter(r => {
      const isTrendy = r.d.style_tags?.includes('洋气')
      if (!isTrendy) return true
      if (trendyCount < maxTrendy) {
        trendyCount++
        return true
      }
      return false
    })
    .slice(0, count)
    .map(r => ({
      id: r.d._id || r.d.id,
      name: r.d.name,
      course: r.d.course_cn,
      ingredients: r.d.ingredients,
      reason: generateReason(r.d, ctx),
      time: r.d.time || 15,
      tags: r.d.tags || [],
      style_tags: r.d.style_tags || []
    }))
    
  console.log(`  ✅ ${category}: ${filtered.length}/${count}`)
  
  return filtered
}

function generateReason(dish, ctx) {
  // 简化版理由生成
  const reasons = [
    '营养搭配不错',
    '家常经典菜品',
    '简单快手',
    '口感丰富',
    '老少咸宜'
  ]
  return reasons[Math.floor(Math.random() * reasons.length)]
}

// ==================== 购物清单 ====================
function generateLocalShoppingList(menu, people) {
  const k = Math.max(1, people / 2)
  const bag = {}
  
  if (!Array.isArray(menu) || menu.length === 0) {
    return []
  }
  
  menu.forEach(m => {
    if (!m || !m.ingredients) return
    
    const ingredients = m.ingredients
    let allIngredients = []
    
    if (Array.isArray(ingredients)) {
      allIngredients = ingredients
    } else if (ingredients.main || ingredients.aux || ingredients.seasoning) {
      allIngredients = [
        ...(ingredients.main || []),
        ...(ingredients.aux || []),
        ...(ingredients.seasoning || [])
      ]
    }
    
    allIngredients.forEach(item => {
      if (!item) return
      
      const name = typeof item === 'object' ? (item.name || '未知') : String(item).split(/\s+/)[0]
      const qty = typeof item === 'object' ? parseQty(item.qty) : 1
      
      bag[name] = (bag[name] || 0) + qty * k
    })
  })
  
  return Object.keys(bag).map(name => ({ 
    name, 
    qty: Math.round(bag[name] * 10) / 10,
    checked: false
  }))
}

function parseQty(qtyStr) {
  if (!qtyStr) return 1
  const numMatch = String(qtyStr).match(/(\d+\.?\d*)/)
  return numMatch ? parseFloat(numMatch[1]) : 1
}

// ==================== 兜底数据 ====================
function generateFallbackPool() {
  console.log('🔧 使用兜底候选池')
  return {
    ok: true,
    candidatePool: {
      meat: getFallbackByCategory('荤菜', 10),
      veg: getFallbackByCategory('素菜', 8),
      soup: getFallbackByCategory('汤类', 4),
      staple: getFallbackByCategory('主食', 4)
    },
    shoppingList: [],
    mealConfig: {
      budget: '实惠',
      mode: '日常',
      totalCount: 26
    }
  }
}

function getFallbackByCategory(category, count) {
  const fallbackRecipes = {
    '荤菜': [
      { id: 'fb_1', name: '西红柿炒鸡蛋', course: '荤菜', time: 10, tags: ['家常'], 
        ingredients: { main: ['西红柿 3个', '鸡蛋 4个'] }, reason: '经典家常菜', style_tags: [] },
      { id: 'fb_2', name: '青椒肉丝', course: '荤菜', time: 15, tags: ['家常'],
        ingredients: { main: ['猪肉 200g', '青椒 2个'] }, reason: '下饭佳品', style_tags: [] },
      { id: 'fb_3', name: '红烧鸡翅', course: '荤菜', time: 25, tags: ['家常'],
        ingredients: { main: ['鸡翅 8个'] }, reason: '孩子喜欢', style_tags: [] },
      { id: 'fb_4', name: '糖醋里脊', course: '荤菜', time: 20, tags: ['家常'],
        ingredients: { main: ['里脊肉 300g'] }, reason: '酸甜可口', style_tags: [] },
      { id: 'fb_5', name: '宫保鸡丁', course: '荤菜', time: 15, tags: ['川菜'],
        ingredients: { main: ['鸡胸肉 300g', '花生 100g'] }, reason: '经典川菜', style_tags: [] }
    ],
    '素菜': [
      { id: 'fb_v1', name: '清炒小白菜', course: '素菜', time: 5, tags: ['清淡'],
        ingredients: { main: ['小白菜 500g'] }, reason: '清淡爽口', style_tags: [] },
      { id: 'fb_v2', name: '蒜蓉西兰花', course: '素菜', time: 8, tags: ['清淡'],
        ingredients: { main: ['西兰花 1个'] }, reason: '营养丰富', style_tags: [] },
      { id: 'fb_v3', name: '凉拌黄瓜', course: '素菜', time: 5, tags: ['凉菜'],
        ingredients: { main: ['黄瓜 2根'] }, reason: '清爽开胃', style_tags: [] },
      { id: 'fb_v4', name: '麻婆豆腐', course: '素菜', time: 15, tags: ['川菜'],
        ingredients: { main: ['豆腐 1盒'] }, reason: '经典川菜', style_tags: [] }
    ],
    '汤类': [
      { id: 'fb_s1', name: '紫菜蛋花汤', course: '汤类', time: 5, tags: ['快手'],
        ingredients: { main: ['紫菜 10g', '鸡蛋 2个'] }, reason: '简单快手', style_tags: [] },
      { id: 'fb_s2', name: '西红柿蛋汤', course: '汤类', time: 10, tags: ['家常'],
        ingredients: { main: ['西红柿 2个', '鸡蛋 2个'] }, reason: '酸甜开胃', style_tags: [] },
      { id: 'fb_s3', name: '冬瓜排骨汤', course: '汤类', time: 40, tags: ['炖汤'],
        ingredients: { main: ['冬瓜 500g', '排骨 300g'] }, reason: '清热去火', style_tags: [] }
    ],
    '主食': [
      { id: 'fb_m1', name: '白米饭', course: '主食', time: 30, tags: ['主食'],
        ingredients: { main: ['大米 300g'] }, reason: '基础主食', style_tags: [] },
      { id: 'fb_m2', name: '馒头', course: '主食', time: 5, tags: ['主食'],
        ingredients: { main: ['馒头 4个'] }, reason: '北方主食', style_tags: [] },
      { id: 'fb_m3', name: '炒饭', course: '主食', time: 10, tags: ['快手'],
        ingredients: { main: ['米饭 2碗', '鸡蛋 2个'] }, reason: '简单快手', style_tags: [] }
    ]
  }
  
  const recipes = fallbackRecipes[category] || []
  
  // 补足数量
  while (recipes.length < count) {
    recipes.push({
      id: `fb_${category}_${recipes.length + 1}`,
      name: `${category}${recipes.length + 1}`,
      course: category,
      time: 15,
      tags: ['家常'],
      ingredients: { main: ['食材 适量'] },
      reason: '家常菜品',
      style_tags: []
    })
  }
  
  return recipes.slice(0, count)
}