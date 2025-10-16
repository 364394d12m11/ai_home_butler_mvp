// cloudfunctions/dietRecommend/index.js
// V5.3 修复版

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// ✅ 引入 AI 文案引擎
const { generateDishReason, TONE } = require('./diet-ai-writer')

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
    console.log('V5.3 开始生成候选池')
    
    const dbFilters = {}
    
    if (allergies.length > 0) {
      dbFilters.allergen = db.command.nin(allergies)
    }
    
    const recipes = await loadRecipesFromDB(dbFilters)
    
    if (!recipes || recipes.length === 0) {
      console.log('❌ 数据库无数据，使用兜底')
      return generateFallbackPool()
    }

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

    const normalizedRecipes = recipes.map(recipe => normalizeRecipe(recipe))

    let pool = filterByContext(normalizedRecipes, ctx)
    pool = expandPoolIfNeeded(pool, ctx, 'all')
    
    if (pool.length === 0) {
      console.log('❌ 过滤后无可用菜品，使用兜底')
      return generateFallbackPool()
    }

    const ranked = pool.map(d => ({ d, s: scoreDish(d, ctx) }))
                       .sort((a, b) => b.s - a.s)

    console.log('评分前10名:')
    ranked.slice(0, 10).forEach((item, index) => {
      console.log(`${index + 1}. ${item.d.name} - ${Math.round(item.s)}分 [${item.d.course_cn}]`)
    })

    if (!ranked || ranked.length === 0) {
      console.log('❌ ranked 为空，使用兜底')
      return generateFallbackPool()
    }

    console.log(`✅ ranked 有 ${ranked.length} 道菜，开始生成候选池`)
    
    const candidatePool = {
      meat: generateCategoryPool(ranked, '荤菜', 10, ctx),
      veg: generateCategoryPool(ranked, '素菜', 8, ctx),
      soup: generateCategoryPool(ranked, '汤类', 4, ctx),
      staple: generateCategoryPool(ranked, '主食', 4, ctx)
    }

    // ✅ 检查并补充不足的分类
    if (candidatePool.meat.length === 0 || 
        candidatePool.veg.length === 0 || 
        candidatePool.soup.length === 0 || 
        candidatePool.staple.length === 0) {
      
      console.log('⚠️ 候选池不足，用兜底数据补充')
      
      if (candidatePool.meat.length === 0) {
        candidatePool.meat = getFallbackByCategory('荤菜', 10)
      }
      if (candidatePool.veg.length === 0) {
        candidatePool.veg = getFallbackByCategory('素菜', 8)
      }
      if (candidatePool.soup.length === 0) {
        candidatePool.soup = getFallbackByCategory('汤类', 4)
      }
      if (candidatePool.staple.length === 0) {
        candidatePool.staple = getFallbackByCategory('主食', 4)
      }
    }

    console.log('✅ 最终候选池数量:', {
      荤菜: candidatePool.meat.length,
      素菜: candidatePool.veg.length,
      汤类: candidatePool.soup.length,
      主食: candidatePool.staple.length
    })

    const recommended = [
      ...(candidatePool.meat.slice(0, 1) || []),
      ...(candidatePool.veg.slice(0, 1) || []),
      ...(candidatePool.soup.slice(0, 1) || []),
      ...(candidatePool.staple.slice(0, 1) || [])
    ]

    const shoppingList = generateLocalShoppingList(recommended, ctx.peopleCount || 2)

    return { 
      ok: true,
      candidatePool: candidatePool,
      shoppingList: shoppingList || [],
      mealConfig: {
        budget: budget,
        mode: mode,
        totalCount: candidatePool.meat.length + candidatePool.veg.length + candidatePool.soup.length + candidatePool.staple.length
      }
    }

  } catch (e) {
    console.error('dietRecommend error:', e)
    console.error('错误堆栈:', e.stack)
    
    // 出错时返回兜底候选池
    return generateFallbackPool()
  }
}

// ===== 兜底候选池生成 =====
function generateFallbackPool() {
  console.log('🔧 生成兜底候选池')
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
      { id: 'fb_meat_1', name: '西红柿炒鸡蛋', course: '荤菜', time: 10, tags: ['家常', '快手'], 
        ingredients: { main: [{ name: '西红柿', qty: '3个' }, { name: '鸡蛋', qty: '4个' }] },
        reason: '经典家常菜，简单易做', style_tags: [] },
      { id: 'fb_meat_2', name: '青椒肉丝', course: '荤菜', time: 15, tags: ['家常'],
        ingredients: { main: [{ name: '猪肉', qty: '200g' }, { name: '青椒', qty: '2个' }] },
        reason: '下饭佳品', style_tags: [] },
      { id: 'fb_meat_3', name: '红烧鸡翅', course: '荤菜', time: 25, tags: ['家常'],
        ingredients: { main: [{ name: '鸡翅', qty: '8个' }] },
        reason: '孩子喜欢', style_tags: [] },
      { id: 'fb_meat_4', name: '糖醋里脊', course: '荤菜', time: 20, tags: ['家常'],
        ingredients: { main: [{ name: '里脊肉', qty: '300g' }] },
        reason: '酸甜可口', style_tags: [] },
      { id: 'fb_meat_5', name: '宫保鸡丁', course: '荤菜', time: 15, tags: ['川菜'],
        ingredients: { main: [{ name: '鸡胸肉', qty: '300g' }, { name: '花生', qty: '100g' }] },
        reason: '经典川菜', style_tags: [] }
    ],
    '素菜': [
      { id: 'fb_veg_1', name: '清炒小白菜', course: '素菜', time: 5, tags: ['清淡', '快手'],
        ingredients: { main: [{ name: '小白菜', qty: '500g' }] },
        reason: '清淡爽口', style_tags: [] },
      { id: 'fb_veg_2', name: '蒜蓉西兰花', course: '素菜', time: 8, tags: ['清淡'],
        ingredients: { main: [{ name: '西兰花', qty: '1个' }] },
        reason: '营养丰富', style_tags: [] },
      { id: 'fb_veg_3', name: '凉拌黄瓜', course: '素菜', time: 5, tags: ['凉菜', '清淡'],
        ingredients: { main: [{ name: '黄瓜', qty: '2根' }] },
        reason: '清爽开胃', style_tags: [] },
      { id: 'fb_veg_4', name: '麻婆豆腐', course: '素菜', time: 15, tags: ['川菜'],
        ingredients: { main: [{ name: '豆腐', qty: '1盒' }] },
        reason: '经典川菜', style_tags: [] }
    ],
    '汤类': [
      { id: 'fb_soup_1', name: '紫菜蛋花汤', course: '汤类', time: 5, tags: ['快手', '清淡'],
        ingredients: { main: [{ name: '紫菜', qty: '10g' }, { name: '鸡蛋', qty: '2个' }] },
        reason: '简单快手', style_tags: [] },
      { id: 'fb_soup_2', name: '西红柿蛋汤', course: '汤类', time: 10, tags: ['家常'],
        ingredients: { main: [{ name: '西红柿', qty: '2个' }, { name: '鸡蛋', qty: '2个' }] },
        reason: '酸甜开胃', style_tags: [] },
      { id: 'fb_soup_3', name: '冬瓜排骨汤', course: '汤类', time: 40, tags: ['清淡', '炖汤'],
        ingredients: { main: [{ name: '冬瓜', qty: '500g' }, { name: '排骨', qty: '300g' }] },
        reason: '清热去火', style_tags: [] }
    ],
    '主食': [
      { id: 'fb_staple_1', name: '白米饭', course: '主食', time: 30, tags: ['主食'],
        ingredients: { main: [{ name: '大米', qty: '300g' }] },
        reason: '基础主食', style_tags: [] },
      { id: 'fb_staple_2', name: '馒头', course: '主食', time: 5, tags: ['主食', '快手'],
        ingredients: { main: [{ name: '馒头', qty: '4个' }] },
        reason: '北方主食', style_tags: [] },
      { id: 'fb_staple_3', name: '炒饭', course: '主食', time: 10, tags: ['主食', '快手'],
        ingredients: { main: [{ name: '米饭', qty: '2碗' }, { name: '鸡蛋', qty: '2个' }] },
        reason: '简单快手', style_tags: [] }
    ]
  }
  
  const recipes = fallbackRecipes[category] || []
  
  // 补足数量
  while (recipes.length < count) {
    const index = recipes.length % 5 + 1
    recipes.push({
      id: `fb_${category}_${recipes.length + 1}`,
      name: `${category}${index}`,
      course: category,
      time: 15,
      tags: ['家常'],
      ingredients: { main: [{ name: '食材', qty: '适量' }] },
      reason: '家常菜品',
      style_tags: []
    })
  }
  
  return recipes.slice(0, count)
}

// ===== 数据加载 =====
async function loadRecipesFromDB(filterConditions = {}) {
  try {
    console.log('查询数据库，条件:', filterConditions)
    
    const query = Object.keys(filterConditions).length > 0 ? filterConditions : {}

    const [荤菜类, 素菜类, 汤类, 主食类] = await Promise.all([
      db.collection('recipes').where({ ...query, course_cn: '荤菜' }).limit(500).get(),
      db.collection('recipes').where({ ...query, course_cn: '素菜' }).limit(500).get(),
      db.collection('recipes').where({ ...query, course_cn: '汤类' }).limit(200).get(),
      db.collection('recipes').where({ ...query, course_cn: '主食' }).limit(200).get()
    ])
    
    console.log(`✅ 查询结果: 荤菜${荤菜类.data.length}道, 素菜${素菜类.data.length}道, 汤类${汤类.data.length}道, 主食${主食类.data.length}道`)

    const result = [...荤菜类.data, ...素菜类.data, ...汤类.data, ...主食类.data]
    
    if (result.length === 0) {
      console.log('数据库无数据')
      return null
    }
    
    return result
    
  } catch (e) {
    console.error('加载菜谱数据失败:', e)
    return null
  }
}

// ===== 数据标准化 =====
function normalizeRecipe(recipe) {
  let courseCn = recipe.course_cn
  
  if (!courseCn) {
    courseCn = inferCourseCn(recipe)
  }
  
  return {
    ...recipe,
    _id: recipe._id || recipe.id,
    name: recipe.name,
    time: recipe.time_min || recipe.time || 15,
    course_cn: courseCn,
    budget: recipe.cost_band || '小资',
    protein: inferProtein(recipe),
    tags: recipe.tags || [],
    for_children: recipe.for_children || false,
    is_vegan: recipe.is_vegan || false
  }
}

function inferCourseCn(recipe) {
  const type = String(recipe.type || '').trim()
  const name = recipe.name || ''
  
  const typeMap = {
    '主菜': '荤菜', '荤菜': '荤菜', '肉菜': '荤菜', 'meat': '荤菜',
    '配菜': '素菜', '素菜': '素菜', '素': '素菜', 'vege': '素菜', '蔬菜': '素菜',
    '汤': '汤类', '汤品': '汤类', '汤类': '汤类', 'soup': '汤类',
    '主食': '主食', 'staple': '主食', 'main': '主食'
  }
  
  if (typeMap[type]) return typeMap[type]
  
  if (/汤|羹|粥/.test(name)) return '汤类'
  if (/饭|面|粉|饺|馄饨|馒头|包子|饼|披萨/.test(name)) return '主食'
  if (recipe.is_vegan === true) return '素菜'
  
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

// ===== 过滤和评分 =====
function filterByContext(list, ctx) {
  if (!Array.isArray(list)) return []
  
  const { dietPref = [], budget, excludeDishes = [] } = ctx || {}
  
  return list.filter(d => {
    if (!d) return false
    if (excludeDishes.includes(d.name || d.title)) return false
    if (dietPref.includes('素食') && d.protein !== '素') return false
    if (dietPref.includes('少辣') && hasSpicy(d)) return false
    return true
  })
}

function scoreDish(d, ctx) {
  let s = 50
  s += weatherScore(d, ctx.weather || {})
  s += solarScore(d, ctx.solarTerm || '')
  s += prefScore(d, ctx.dietPref || [])
  s += budgetScore(d, ctx.budget)
  s += healthGoalScore(d, ctx.healthGoals || [])
  
  const peopleCount = typeof ctx.people === 'object' 
    ? ctx.people.adults + ctx.people.kids + ctx.people.elders 
    : ctx.people
  s += peopleScore(d, peopleCount)
  
  if (ctx.hasKids) {
    const kidsAges = ctx.people.kids_ages || [];
    const hasYoungKids = kidsAges.some(age => age < 4); // 只有<4岁才特殊处理
    
    if (hasYoungKids) {
      if (d.for_children === true) s += 20;
      if (d.tags?.includes('软糯') || d.tags?.includes('易消化')) s += 15;
      if (d.tags?.includes('重辣') || d.tags?.includes('很辣')) s -= 30;
    } else {
      // ≥4岁：同桌同菜，只适度控辣
      if (d.tags?.includes('很辣') || d.tags?.includes('变态辣')) s -= 15;
    }
  }

  if (conflict(d, ctx.dietPref || [])) return -1e9
  s -= repeatPenalty(d, ctx.recentMenus || [])
  s += Math.random() * 10 - 5

  return s
}

function weatherScore(d, w) {
  if (!w) return 0
  const t = Number(w.temp) || 20
  let sc = 0
  const tags = d.tags || []
  
  if (t >= 32 && hasAny(tags, ['清爽', '低油', '凉拌'])) sc += 10
  if (t <= 8 && hasAny(tags, ['温补', '炖', '热量'])) sc += 8
  
  return Math.min(sc, 15)
}

function solarScore(d, term = '') {
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

function peopleScore(d, n = 2) {
  return 0
}

function conflict(d, prefs = []) {
  if (prefs.includes('素食') && d.protein === '荤') return true
  if (prefs.includes('少辣') && hasSpicy(d)) return true
  return false
}

function repeatPenalty(d, recent = []) {
  const names = new Set(recent.flatMap(x => (x?.items || x?.dishes || [])?.map?.(i => i.name) || []))
  return names.has(d.name) ? 8 : 0
}

// ===== 辅助函数 =====
function hasAny(arr = [], keys = []) { 
  return keys.some(k => arr.includes(k)) 
}

function hasSpicy(d) { 
  return hasAny(d.tags || [], ['麻辣', '香辣', '重辣', '川菜', '湘菜']) 
}

function expandPoolIfNeeded(basePool, ctx, targetSlot) {
  const MIN_POOL = 30
  let currentPool = [...basePool]
  let relaxLevel = 0
  
  while (currentPool.length < MIN_POOL && relaxLevel < 3) {
    currentPool = applyRelaxLevel(basePool, ctx, relaxLevel)
    relaxLevel++
  }
  
  return currentPool
}

function applyRelaxLevel(basePool, ctx, level) {
  return basePool.filter(d => {
    if (!d) return false
    if (ctx.hasKids && d.for_children === false) return false
    return true
  })
}

function calculateTrendyQuota(budget, mode) {
  // ✅ 家常模式：1/10洋气
  if (mode === '日常') {
    return { meat: 1, veg: 0, soup: 0 }; // 10道荤菜只给1个洋气名额
  }
  
  const quotaTable = {
    '实惠': { '目标': 0, '灵感': 1 },
    '小资': { '目标': 1, '灵感': 2 },
    '精致': { '目标': 1, '灵感': 3 }
  };
  
  return quotaTable[budget]?.[mode] || 0;
}

function generateCategoryPool(ranked, category, count, ctx) {
  console.log(`🔍 generateCategoryPool: 要找 ${category}, 总共有 ${ranked.length} 道菜`)
  
  const maxTrendy = ctx.trendyQuota || 0
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
    .map(r => {
      // ✅ 构建文案上下文
      const writerCtx = {
        user: { tone: mapToneToEnum(ctx.aiTone) },
        env: {
          weather: {
            temp: parseInt(ctx.weather?.temp) || 20,
            text: ctx.weather?.text || '多云',
            rain: ctx.weather?.text?.includes('雨'),
            snow: ctx.weather?.text?.includes('雪'),
            typhoon: ctx.weather?.text?.includes('台风')
          },
          solarTerm: ctx.solarTerm || '',
          hasKids: ctx.hasKids
        }
      }
      
      // ✅ 调用 AI 生成理由
      let reason = '营养搭配不错'
      try {
        reason = generateDishReason(writerCtx, r.d)
      } catch (e) {
        console.error('AI理由生成失败:', r.d.name, e)
      }
      
      return {
        id: r.d._id || r.d.id,
        name: r.d.name,
        course: r.d.course_cn,
        ingredients: r.d.ingredients,
        reason: reason,
        time: r.d.time || 15,
        tags: r.d.tags || [],
        style_tags: r.d.style_tags || []
      }
    })
    
  console.log(`✅ ${category} 筛选结果: ${filtered.length}/${count}`)
  
  if (filtered.length === 0) {
    console.log(`⚠️ ${category} 没有找到菜品`)
  }
  
  return filtered
}

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
    qty: Math.round(bag[name] * 10) / 10 
  }))
}

function parseQty(qtyStr) {
  if (!qtyStr) return 1
  const numMatch = String(qtyStr).match(/(\d+\.?\d*)/)
  return numMatch ? parseFloat(numMatch[1]) : 1
}