// ==========================================
// 文件1: miniprogram/utils/menu-engine.js
// V4.3 本地兜底引擎 - 适配云数据库recipes格式
// ==========================================
// ✅ V5.2新增：引入AI文案引擎
const { generateDishReason, TONE } = require('./diet-ai-writer')
// ===== 对外接口 =====

/**
 * 构建今日菜单（主/配/汤）
 * @param {Object} ctx - 上下文 {weather, solarTerm, dietPref, people, budget, aiTone, recentMenus}
 * @param {Array} recipes - 可选，传入菜谱数据，否则使用兜底数据
 * @returns {Array} 菜单数组
 */
export function buildTodayMenu(ctx = {}, recipes = null) {
  // 使用传入的recipes或兜底数据
  const pool = recipes || getFallbackRecipes()
  
  // 数据格式标准化（适配云数据库格式）
  const normalizedPool = pool.map(recipe => normalizeRecipe(recipe))
  
  // 按上下文过滤
  const filtered = filterByContext(normalizedPool, ctx)
  
  // 评分排序
  const ranked = filtered.map(d => ({ d, s: scoreDish(d, ctx) }))
                         .sort((a, b) => b.s - a.s)
  
  // 平衡选择（主/配/汤）
  const chosen = pickBalanced(ranked)
  
  // 返回标准格式
  return chosen.map(x => ({
    name: x.d.name || x.d.title,
    course: x.d.course,
    reason: explainLocal(x.d, ctx),
    ingredients: formatIngredients(x.d.ingredients || []),
    time: x.d.time || x.d.minutes || 0,
    tags: x.d.tags || []
  }))
}

/**
 * 合并购物清单
 * @param {Array} menu - 菜单数组
 * @param {Number} people - 人数
 * @returns {Array} 购物清单
 */
export function makeShoppingList(menu = [], people = 2) {
  if (!Array.isArray(menu)) return []
  
  const k = Math.max(1, people / 2)
  const bag = {}
  
  menu.forEach(m => {
    if (!m || !Array.isArray(m.ingredients)) return
    
    m.ingredients.forEach(item => {
      if (!item) return
      
      const name = typeof item === 'string' ? extractIngredientName(item) : (item.name || '未知食材')
      const qty = typeof item === 'string' ? extractIngredientQty(item) : (item.qty || '1')
      const baseQty = parseFloat(String(qty).replace(/[^\d.]/g, '')) || 1
      
      bag[name] = (bag[name] || 0) + baseQty * k
    })
  })
  
  return Object.keys(bag).map(name => ({ 
    name, 
    qty: Math.round(bag[name] * 10) / 10
  }))
}

// ===== 核心算法 =====

/**
 * 数据标准化（云数据库 -> 推荐引擎格式）
 */
function normalizeRecipe(recipe) {
  return {
    ...recipe,
    name: recipe.name || recipe.title, // 统一用name
    time: recipe.time || recipe.minutes || 0, // 统一用time
    course: inferCourse(recipe), // 推断菜品类型
    budget: inferBudget(recipe), // 推断预算档次
    protein: inferProtein(recipe), // 推断蛋白质类型
    tags: recipe.tags || []
  }
}

/**
 * 按上下文过滤菜品
 */
function filterByContext(list, ctx) {
  if (!Array.isArray(list)) return []
  
  const { dietPref = [], budget, weather = {} } = ctx || {}
  
  return list.filter(d => {
    if (!d) return false
    
    // 预算过滤
    if (budget && d.budget && d.budget !== budget) return false
    
    // 饮食偏好过滤
    if (dietPref.includes('素食') && d.protein !== '素') return false
    if (dietPref.includes('少辣') && hasSpicy(d)) return false
    
    // 时间过滤（紧急情况下只要快手菜）
    if (ctx.timeLimit && d.time > 20) return false
    
    return true
  })
}

/**
 * 菜品评分算法（总分100分）
 */
export function scoreDish(d, ctx) {
  let score = 50 // 基础分
  
  // 天气匹配 (0~15分)
  score += weatherScore(d, ctx.weather || {})
  
  // 节气匹配 (0~10分)  
  score += solarScore(d, ctx.solarTerm || '')
  
  // 偏好匹配 (0~15分)
  score += prefScore(d, ctx.dietPref || [])
  
  // 预算匹配 (0~10分)
  score += budgetScore(d, ctx.budget)
  
  // 人数适配 (0~5分)
  score += peopleScore(d, ctx.people)
  
  // 冲突惩罚
  if (conflict(d, ctx.dietPref)) return -1e9
  
  // 重复惩罚 (0~10分)
  score -= repeatPenalty(d, ctx.recentMenus || [])
  
  return score
}

/**
 * 平衡选择（确保主/配/汤搭配）
 */
function pickBalanced(ranked) {
  if (!ranked || ranked.length === 0) return []
  
  const result = []
  const categories = { '主菜': [], '配菜': [], '汤品': [] }
  
  // 按类型分组
  ranked.forEach(item => {
    if (item && item.d) {
      const course = item.d.course || '主菜'
      if (categories[course]) {
        categories[course].push(item)
      }
    }
  })
  
  // 选择策略：1主菜 + 1配菜 + 1汤品，不够则用主菜补
  if (categories['主菜'].length > 0) {
    result.push(categories['主菜'][0])
  } else if (ranked.length > 0) {
    result.push(ranked[0])
  }
  
  if (categories['配菜'].length > 0) {
    result.push(categories['配菜'][0])
  } else if (ranked.length > 1) {
    result.push(ranked[1])
  }
  
  if (categories['汤品'].length > 0) {
    result.push(categories['汤品'][0])
  } else if (ranked.length > 2) {
    result.push(ranked[2])
  }
  
  return result.filter(Boolean)
}

// ===== 评分子算法 =====

function weatherScore(d, weather) {
  if (!weather) return 0
  
  const temp = Number(weather.temp) || 20
  const text = weather.text || ''
  const code = weather.code || ''
  const tags = d.tags || []
  
  let score = 0
  
  // 雨天匹配
  if (/rain|雨/.test(text) || /rain|thunder/.test(code)) {
    if (hasAny(tags, ['汤', '炖', '去湿', '暖胃'])) score += 10
  }
  
  // 高温匹配  
  if (temp >= 30) {
    if (hasAny(tags, ['清爽', '凉拌', '低油'])) score += 10
  }
  
  // 低温匹配
  if (temp <= 10) {
    if (hasAny(tags, ['温补', '炖', '热量', '暖胃'])) score += 8
  }
  
  // 雾霾匹配
  if (/haze|fog|霾|雾/.test(text) || /haze|fog/.test(code)) {
    if (hasAny(tags, ['润肺', '护嗓', '清淡'])) score += 6
  }
  
  return Math.min(score, 15)
}

function solarScore(d, term = '') {
  const tags = d.tags || []
  
  const termMap = [
    { regex: /谷雨/, tags: ['去湿', '清淡'], score: 8 },
    { regex: /(小暑|大暑)/, tags: ['防暑', '清爽', '凉拌'], score: 8 },
    { regex: /(立冬|大雪)/, tags: ['温补', '炖', '热量'], score: 8 },
    { regex: /(小寒|大寒)/, tags: ['温补', '高热量'], score: 10 }
  ]
  
  for (const item of termMap) {
    if (item.regex.test(term) && hasAny(tags, item.tags)) {
      return item.score
    }
  }
  
  return 0
}

function prefScore(d, prefs = []) {
  const tags = d.tags || []
  let score = 0
  
  if (prefs.includes('清淡') && hasAny(tags, ['清淡', '低油', '蒸', '煮'])) score += 8
  if (prefs.includes('高蛋白') && hasAny(tags, ['高蛋白', '肉菜', '蛋类'])) score += 8
  if (prefs.includes('少辣') && !hasSpicy(d)) score += 4
  if (prefs.includes('儿童友好') && hasAny(tags, ['儿童', '温和', '不辣'])) score += 6
  if (prefs.includes('养胃') && hasAny(tags, ['暖胃', '温和', '易消化'])) score += 6
  
  return Math.min(score, 15)
}

function budgetScore(d, budget) {
  if (!budget || !d.budget) return 0
  return d.budget === budget ? 8 : 0
}

function peopleScore(d, people = 2) {
  const tags = d.tags || []
  if (people >= 4 && hasAny(tags, ['多人份', '大份', '下饭'])) return 3
  if (people <= 2 && hasAny(tags, ['快手', '简单', '一人食'])) return 2
  return 0
}

function conflict(d, prefs = []) {
  if (prefs.includes('素食') && d.protein === '荤') return true
  if (prefs.includes('少辣') && hasSpicy(d)) return true
  return false
}

function repeatPenalty(d, recentMenus = []) {
  const recentNames = recentMenus.flatMap(menu => 
    (menu.items || menu.dishes || []).map(item => item.name)
  )
  return recentNames.includes(d.name) ? 8 : 0
}

// ===== 推断算法 =====

function inferCourse(recipe) {
  const title = recipe.title || recipe.name || ''
  const tags = recipe.tags || []
  
  if (hasAny(tags, ['汤', '羹']) || /汤|羹/.test(title)) return '汤品'
  if (hasAny(tags, ['凉菜', '小菜', '配菜']) || /凉拌|腌/.test(title)) return '配菜'
  if (hasAny(tags, ['素菜']) && recipe.minutes <= 10) return '配菜'
  
  return '主菜'
}

function inferBudget(recipe) {
  const ingredients = recipe.ingredients || []
  const tags = recipe.tags || []
  
  // 高档食材判断
  const luxuryIngredients = ['牛肉', '羊肉', '海鲜', '鲍鱼', '海参', '花胶', '燕窝']
  if (ingredients.some(ing => luxuryIngredients.some(lux => ing.includes(lux)))) {
    return '精致'
  }
  
  // 简单食材判断
  const basicIngredients = ['土豆', '白菜', '萝卜', '豆腐', '鸡蛋']
  if (ingredients.some(ing => basicIngredients.some(basic => ing.includes(basic)))) {
    return '实惠'
  }
  
  return '小资'
}

function inferProtein(recipe) {
  const ingredients = recipe.ingredients || []
  const tags = recipe.tags || []
  
  if (hasAny(tags, ['素菜', '素食'])) return '素'
  
  const meatKeywords = ['肉', '鸡', '鸭', '鱼', '虾', '蟹', '牛', '猪', '羊']
  const hasMeat = ingredients.some(ing => meatKeywords.some(meat => ing.includes(meat)))
  
  const vegKeywords = ['菜', '豆腐', '蛋']
  const hasVeg = ingredients.some(ing => vegKeywords.some(veg => ing.includes(veg)))
  
  if (hasMeat && hasVeg) return '混合'
  if (hasMeat) return '荤'
  return '素'
}

// ===== 本地解释生成（V5.2升级版 - 使用AI文案引擎）=====
// ===== 本地解释生成（V5.2升级版 - 使用AI文案引擎）=====

function explainLocal(d, ctx) {
  // 构建完整的WriterContext
  const writerContext = {
    user: {
      tone: ctx.aiTone || '温柔',
      family: {
        adults: ctx.people?.adults || 2,
        kids: ctx.people?.kids || 0,
        elders: ctx.people?.elders || 0
      },
      healthGoals: ctx.healthGoals || [],
      allergies: ctx.allergies || []
    },
    menu: {
      dishes: [d],  // 当前菜品
      mode: ctx.mode || '日常',
      budget: ctx.budget || '实惠'
    },
    env: {
      weather: ctx.weather || { temp: 20, text: '多云' },
      solarTerm: ctx.solarTerm || '',
      hasKids: ctx.hasKids || false
    }
  }
  
  // 调用AI文案引擎（注意参数顺序：ctx在前，dish在后）
  try {
    const reason = generateDishReason(writerContext, d)
    return reason
  } catch (e) {
    console.error('AI文案生成失败，使用兜底逻辑:', e)
    return generateFallbackReason(d, ctx)
  }
}

// ===== 兜底推荐理由（当AI引擎失败时使用）=====

function generateFallbackReason(d, ctx) {
  const tone = ctx.aiTone || '温柔'
  const temp = Number(ctx.weather?.temp) || 20
  const weatherText = ctx.weather?.text || ''
  
  let base = ''
  if (temp >= 30 && hasAny(d.tags, ['清爽', '凉拌'])) {
    base = '天热来点清爽的，舒服'
  } else if (temp <= 10 && hasAny(d.tags, ['炖', '暖胃'])) {
    base = '天冷了，热乎乎的暖胃又暖心'
  } else if (weatherText.includes('雨') && hasAny(d.tags, ['汤'])) {
    base = '下雨天喝点热汤，很舒服'
  } else {
    base = '营养搭配不错，适合今天'
  }
  
  // 根据语调调整
  const toneMap = {
    '温柔': `${base}，今天就选它吧。`,
    '简练': `${base}。`,
    '幽默': `${base}，对味蕾很友好～`
  }
  
  return toneMap[tone] || toneMap['温柔']
}

// ===== 语气转换工具函数 =====

function mapToneStringToEnum(toneStr) {
  const toneMap = {
    '温柔': TONE.GENTLE,
    '简练': TONE.CONCISE,
    '幽默': TONE.HUMOROUS
  }
  return toneMap[toneStr] || TONE.GENTLE
}

// ===== 工具函数 =====

function hasAny(arr = [], keys = []) {
  return keys.some(k => arr.includes(k))
}

function hasSpicy(d) {
  return hasAny(d.tags || [], ['辣', '麻辣', '香辣', '重辣', '川菜', '湘菜'])
}

function formatIngredients(ingredients) {
  return ingredients.map(ing => {
    if (typeof ing === 'string') {
      return {
        name: extractIngredientName(ing),
        qty: extractIngredientQty(ing)
      }
    }
    return ing
  })
}

function extractIngredientName(str) {
  // "鸡蛋 2个" -> "鸡蛋"
  return str.split(/\s+/)[0] || str
}

function extractIngredientQty(str) {
  // "鸡蛋 2个" -> "2个"
  const parts = str.split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : '适量'
}

// ===== 兜底数据 =====

function getFallbackRecipes() {
  return [
    {
      title: '西红柿鸡蛋',
      minutes: 8,
      tags: ['家常', '快手', '下饭'],
      ingredients: ['西红柿 3个', '鸡蛋 4个', '盐 适量']
    },
    {
      title: '清炒小白菜', 
      minutes: 5,
      tags: ['素菜', '清淡', '快手'],
      ingredients: ['小白菜 500g', '蒜 2瓣']
    },
    {
      title: '紫菜蛋花汤',
      minutes: 8, 
      tags: ['汤', '清淡', '快手'],
      ingredients: ['紫菜 10g', '鸡蛋 2个']
    }
  ]
}
// ==========================================
// V5.3 新增：构建 WriterContext
// ==========================================

/**
 * 构建 WriterContext（供 writer 使用）
 * @param {Object} params - {userProfile, menu, weather, solarTerm, recentMenus}
 * @returns {Object} WriterContext
 */
function buildWriterContext(params) {
  const {
    userProfile = {},
    menu = [],
    weather = {},
    solarTerm = '',
    recentMenus = []
  } = params
  
  // 解构用户画像
  const profile = userProfile.profile || {}
  const family = userProfile.family || {}
  const dietPref = userProfile.dietPref || {}
  
  // 计算家庭成员
  const adults = family.adults || 1
  const kids = family.kids || 0
  const elders = family.elders || 0
  
  // 计算菜单摘要
  const summary = {
    calories: menu.reduce((sum, d) => sum + estimateCalories(d), 0),
    protein: menu.reduce((sum, d) => sum + estimateProtein(d), 0),
    vegPortion: menu.filter(d => 
      d.tags?.includes('蔬菜') || d.tags?.includes('素菜')
    ).length
  }
  
  // 计算洋气菜配额
  const budget = dietPref.budget || '实惠'
  const mode = profile.mode || '日常'
  const quotaTable = {
    '实惠': { '日常': 0, '目标': 0, '灵感': 1 },
    '小资': { '日常': 0, '目标': 1, '灵感': 1 },
    '精致': { '日常': 1, '目标': 1, '灵感': 2 }
  }
  
  const trendyQuota = quotaTable[budget]?.[mode] || 0
  const trendyCurrent = menu.filter(d => 
    d.tags?.some(t => ['洋气', '日料', '西餐', '异域'].includes(t))
  ).length
  
  // 提取区域画像（简化版）
  const regionProfile = {
    native: 'north',
    current: 'unknown',
    mix: { native: 0.6, current: 0.4 },
    cityTier: 'nonT1'
  }
  
  // 提取行为信号（简化版）
  const signals = {
    dwellMsByCluster: {},
    recentDuplicates: recentMenus.flatMap(m => 
      (m.dishes || []).map(d => d.name)
    ).slice(0, 10),
    nutritionFlags: []
  }
  
  // 语气自动推断
  let tone = '温柔'
  if (profile.has_child) tone = '温柔'
  else if (profile.health_goals?.includes('增肌')) tone = '简练'
  else if (profile.age && profile.age < 30) tone = '幽默'
  
  // 构建上下文
  return {
    user: {
      tone: tone,
      family: { adults, kids, elders },
      healthGoals: profile.health_goals || [],
      allergies: profile.allergies || []
    },
    
    menu: {
      dishes: menu,
      summary: summary,
      mode: mode,
      budget: budget
    },
    
    regionProfile: regionProfile,
    
    constraints: {
      trendyQuota: trendyQuota,
      trendyCurrent: trendyCurrent,
      homelyMinRatio: mode === '日常' ? 0.6 : 0.4,
      exploreEnabled: mode === '灵感',
      exploreCooldownActive: false
    },
    
    signals: signals,
    
    env: {
      weather: {
        temp: Number(weather.temp) || 20,
        rain: weather.text?.includes('雨') || false,
        snow: weather.text?.includes('雪') || false,
        typhoon: weather.text?.includes('台风') || false,
        wind: 'calm'
      },
      solarTerm: solarTerm || null,
      date: new Date().toISOString().split('T')[0],
      hasKids: kids > 0
    }
  }
}

function estimateCalories(dish) {
  let base = 250
  if (dish.course === '主菜') base = 350
  if (dish.course === '配菜') base = 150
  if (dish.course === '汤品') base = 100
  if (dish.tags?.includes('重油')) base *= 1.4
  if (dish.tags?.includes('清淡')) base *= 0.8
  return Math.round(base)
}

function estimateProtein(dish) {
  if (dish.tags?.includes('高蛋白')) return 25
  if (dish.tags?.includes('荤菜')) return 20
  if (dish.tags?.includes('豆制品')) return 15
  if (dish.tags?.includes('素菜')) return 5
  return 8
}

/**
 * V5.3 新增：构建候选池（10荤+8素+4汤）
 * 这是新接口，原来的 buildTodayMenu 保持不变
 */
function buildCandidatePoolV53(ctx = {}, recipes = null) {
  const pool = recipes || getFallbackRecipes()
  
  // 标准化（复用你原来的函数）
  const normalized = pool.map(r => normalizeRecipe(r))
  
  // 过滤（复用你原来的函数）
  const filtered = filterByContext(normalized, ctx)
  
  // V5.3 新增：分类评分
  const categorized = categorizeAndScoreV53(filtered, ctx)
  
  // V5.3 新增：洋气配额守门
  const gated = applyTrendyQuotaV53(categorized, ctx)
  
  // V5.3 新增：根据预算选择推荐
  const recommended = selectByBudgetV53(gated, ctx)
  
  return {
    recommended: recommended.map(d => formatDishForDisplay(d, ctx)),
    candidates: {
      meat: gated.meat.slice(0, 10).map(d => formatDishForDisplay(d, ctx)),
      veg: gated.veg.slice(0, 8).map(d => formatDishForDisplay(d, ctx)),
      soup: gated.soup.slice(0, 4).map(d => formatDishForDisplay(d, ctx))
    }
  }
}

/**
 * V5.3 新增：分类并评分
 */
function categorizeAndScoreV53(pool, ctx) {
  const byType = { meat: [], veg: [], soup: [] }
  
  pool.forEach(dish => {
    const type = dish.type || dish.course || '主菜'
    const isVegan = dish.is_vegan === true
    const protein = dish.protein || inferProtein(dish)
    
    if (type === '汤品' || type === '汤') {
      byType.soup.push(dish)
    } else if (isVegan || protein === '素') {
      byType.veg.push(dish)
    } else {
      byType.meat.push(dish)
    }
  })
  
  // 评分排序（复用你原来的 scoreDish 函数）
  const scored = {
    meat: byType.meat.map(d => ({ d, s: scoreDish(d, ctx) }))
                      .sort((a, b) => b.s - a.s),
    veg: byType.veg.map(d => ({ d, s: scoreDish(d, ctx) }))
                    .sort((a, b) => b.s - a.s),
    soup: byType.soup.map(d => ({ d, s: scoreDish(d, ctx) }))
                      .sort((a, b) => b.s - a.s)
  }
  
  return scored
}

/**
 * V5.3 新增：洋气配额守门
 */
function applyTrendyQuotaV53(categorized, ctx) {
  const { mode = '日常', budget = '实惠' } = ctx
  
  // Do-Not-Change 配额表
  const quotaTable = {
    '实惠': { '日常': 0, '目标': 0, '灵感': 1 },
    '小资': { '日常': 0, '目标': 1, '灵感': 1 },
    '精致': { '日常': 1, '目标': 1, '灵感': 2 }
  }
  
  const maxTrendy = quotaTable[budget]?.[mode] || 0
  
  const gateByType = (scoredList, limit) => {
    const result = []
    let trendyCount = 0
    
    for (const item of scoredList) {
      if (result.length >= limit) break
      
      const isTrendy = item.d.style_tags?.includes('洋气')
      
      // 洋气菜守门
      if (isTrendy && trendyCount >= maxTrendy) {
        continue  // 跳过
      }
      
      result.push(item)
      if (isTrendy) trendyCount++
    }
    
    return result
  }
  
  return {
    meat: gateByType(categorized.meat, 10).map(x => x.d),
    veg: gateByType(categorized.veg, 8).map(x => x.d),
    soup: gateByType(categorized.soup, 4).map(x => x.d)
  }
}

/**
 * V5.3 新增：根据预算选择推荐
 */
function selectByBudgetV53(gated, ctx) {
  const { budget = '实惠' } = ctx
  
  // Do-Not-Change 菜量表
  const counts = {
    '实惠': { meat: 1, veg: 1, soup: 1 },  // 2菜1汤
    '小资': { meat: 1, veg: 2, soup: 1 },  // 3菜1汤
    '精致': { meat: 2, veg: 2, soup: 1 }   // 4菜1汤
  }
  
  const c = counts[budget] || counts['实惠']
  
  return [
    ...gated.meat.slice(0, c.meat),
    ...gated.veg.slice(0, c.veg),
    ...gated.soup.slice(0, c.soup)
  ]
}

/**
 * V5.3 新增：格式化菜品显示
 * 如果你原来有类似函数，可以复用
 */
function formatDishForDisplay(d, ctx) {
  // 构建WriterContext
  const writerContext = {
    user: {
      tone: ctx.aiTone || ctx.tone || '温柔',
      family: {
        adults: ctx.people?.adults || 2,
        kids: ctx.people?.kids || 0,
        elders: ctx.people?.elders || 0
      },
      healthGoals: ctx.healthGoals || [],
      allergies: ctx.allergies || []
    },
    menu: {
      dishes: [d],
      mode: ctx.mode || '日常',
      budget: ctx.budget || '实惠'
    },
    env: {
      weather: ctx.weather || { temp: 20 },
      solarTerm: ctx.solarTerm || '',
      hasKids: ctx.hasKids || false
    }
  }
  
  return {
    id: d._id || d.id || `dish-${d.name}`,
    name: d.name,
    course: d.course || d.type,
    ingredients: formatIngredients(d.ingredients || []),
    reason: generateDishReason(writerContext, d),  // 使用AI引擎
    time: d.time || d.time_min || 15,
    tags: d.tags || [],
    style_tags: d.style_tags || []
  }
}


module.exports = {
  buildTodayMenu,           // 保留原来的
  makeShoppingList,         // 保留原来的
  buildWriterContext,       // 保留原来的（如果有）
  buildCandidatePoolV53,    // ← 新增
  scoreDish                 // ← 如果原来没导出，加上
}