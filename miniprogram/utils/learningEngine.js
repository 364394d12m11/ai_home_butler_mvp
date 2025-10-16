// miniprogram/utils/learningEngine.js - 懒人冷启动学习算法
const { formatDateYMD } = require('./datetime')
const { RECIPES } = require('./recipes')

// 默认用户画像（冷启动）
const DEFAULT_PROFILE = {
  people: 2,
  style: 'balanced', // balanced/budget/quality
  exploreLevel: 'moderate', // conservative/moderate/adventurous
  preferences: {
    cuisines: {}, // {'中式': 3, '川菜': 1} 权重记录
    flavors: {}, // {'清淡': 2, '麻辣': -1}
    costs: {}, // {'L': 2, 'M': 1, 'H': 0}
    times: {}, // 偏好时间范围
    planning: 0 // 计划性：0=随性，1=计划型
  },
  learningData: {
    activeDays: 0,
    totalActions: 0,
    prompted: false,
    behaviors: [] // 行为记录
  }
}

// 生成默认菜单（冷启动）
function getDefaultMenu() {
  const defaultDishes = [
    // 午餐 - 简单易做
    { mealType: 'lunch', dishes: ['tomato-egg', 'broccoli-garlic'] },
    // 晚餐 - 稍微丰富
    { mealType: 'dinner', dishes: ['kungpao-chicken', 'potato-greenpepper'] }
  ]

  return defaultDishes.map(meal => {
    const dishDetails = meal.dishes.map(dishId => {
      const recipe = RECIPES.find(r => r.id === dishId)
      return {
        id: recipe.id,
        name: recipe.name,
        emoji: recipe.emoji,
        time: recipe.time,
        cost: mapBudgetToCost(recipe.budget),
        costLabel: getCostLabel(recipe.budget),
        tags: recipe.tags
      }
    })

    return {
      name: meal.mealType === 'lunch' ? '午餐' : '晚餐',
      people: '2位成人',
      dishes: dishDetails
    }
  })
}

// 记录用户行为
function logUserBehavior(actionType, data = {}) {
  try {
    let profile = getUserProfile()
    const behavior = {
      type: actionType,
      data: data,
      timestamp: Date.now(),
      date: formatDateYMD(new Date())
    }

    profile.learningData.behaviors.push(behavior)
    profile.learningData.totalActions++

    // 实时更新偏好权重
    updatePreferences(profile, behavior)

    // 保存更新后的画像
    saveUserProfile(profile)

    console.log('行为记录:', actionType, data)
  } catch (e) {
    console.error('行为记录失败:', e)
  }
}

// 更新偏好权重
function updatePreferences(profile, behavior) {
  const { type, data } = behavior

  switch (type) {
    case 'replaceDish':
      // 换菜行为：旧菜-1分，新菜+1分
      if (data.oldDish) {
        adjustPreference(profile, 'cuisines', data.oldDish.cuisine, -1)
        adjustPreference(profile, 'costs', data.oldDish.cost, -1)
      }
      if (data.newDish) {
        adjustPreference(profile, 'cuisines', data.newDish.cuisine, 1)
        adjustPreference(profile, 'costs', data.newDish.cost, 1)
      }
      break

    case 'regenerateMenu':
      // 重新生成：探索欲+1
      profile.exploreLevel = 'adventurous'
      break

    case 'viewShoppingList':
      // 查看清单：计划性+1
      profile.preferences.planning += 1
      break

    case 'quickGenerate':
      // 一键生成：懒人指数+1
      adjustPreference(profile, 'planning', 'lazy', 1)
      break
  }
}

// 调整偏好权重
function adjustPreference(profile, category, key, delta) {
  if (!profile.preferences[category]) {
    profile.preferences[category] = {}
  }
  
  const currentValue = profile.preferences[category][key] || 0
  profile.preferences[category][key] = Math.max(-5, Math.min(5, currentValue + delta))
}

// 生成个性化菜单
function generatePersonalizedMenu() {
  const profile = getUserProfile()
  
  // 少于3天或行为少于5次，返回默认菜单
  if (profile.learningData.activeDays < 3 || profile.learningData.totalActions < 5) {
    return getDefaultMenu()
  }

  // 基于偏好筛选菜品
  let candidates = RECIPES.map(recipe => ({
    ...recipe,
    score: calculateDishScore(recipe, profile)
  }))

  // 排序并选择
  candidates.sort((a, b) => b.score - a.score)

  // 确保营养均衡和多样性
  const lunchDishes = selectBalancedDishes(candidates, 2, 'lunch')
  const dinnerDishes = selectBalancedDishes(candidates, 3, 'dinner')

  return [
    {
      name: '午餐',
      people: `${profile.people}位成人`,
      dishes: lunchDishes.map(formatDishForDisplay)
    },
    {
      name: '晚餐', 
      people: `${profile.people}位成人`,
      dishes: dinnerDishes.map(formatDishForDisplay)
    }
  ]
}

// 计算菜品评分
function calculateDishScore(recipe, profile) {
  let score = 5 // 基础分

  // 菜系偏好
  const cuisinePrefs = profile.preferences.cuisines || {}
  recipe.tags.forEach(tag => {
    if (cuisinePrefs[tag]) {
      score += cuisinePrefs[tag] * 2
    }
  })

  // 成本偏好
  const costPrefs = profile.preferences.costs || {}
  const recipeCost = mapBudgetToCost(recipe.budget)
  if (costPrefs[recipeCost]) {
    score += costPrefs[recipeCost] * 1.5
  }

  // 时间偏好（快手菜加分）
  if (recipe.time <= 15) {
    score += 2
  }

  // 探索度影响
  if (profile.exploreLevel === 'conservative') {
    // 保守用户偏好常见菜
    if (recipe.tags.includes('家常')) score += 3
  } else if (profile.exploreLevel === 'adventurous') {
    // 冒险用户偏好新菜
    score += Math.random() * 2
  }

  return score
}

// 选择均衡菜品
function selectBalancedDishes(candidates, count, mealType) {
  const selected = []
  const usedCategories = new Set()

  for (const candidate of candidates) {
    if (selected.length >= count) break

    const category = getDishCategory(candidate)
    
    // 确保不同类型的菜品
    if (selected.length === 0 || !usedCategories.has(category) || selected.length === count - 1) {
      selected.push(candidate)
      usedCategories.add(category)
    }
  }

  return selected
}

// 获取菜品类别
function getDishCategory(recipe) {
  if (recipe.tags.includes('蔬菜')) return 'vegetable'
  if (recipe.tags.includes('肉类') || recipe.tags.includes('蛋类')) return 'protein'
  if (recipe.tags.includes('汤羹')) return 'soup'
  if (recipe.tags.includes('主食')) return 'staple'
  return 'other'
}

// 格式化菜品显示
function formatDishForDisplay(recipe) {
  return {
    id: recipe.id,
    name: recipe.name,
    emoji: recipe.emoji,
    time: recipe.time,
    cost: mapBudgetToCost(recipe.budget),
    costLabel: getCostLabel(recipe.budget),
    tags: recipe.tags
  }
}

// 检查是否该提示用户
function shouldPromptUser() {
  const profile = getUserProfile()
  return profile.learningData.activeDays >= 3 && 
         profile.learningData.totalActions >= 5 && 
         !profile.learningData.prompted
}

// 生成提示文案
function getPromptMessage() {
  const profile = getUserProfile()
  const topCuisine = getTopPreference(profile.preferences.cuisines)
  
  if (topCuisine) {
    return `发现你常选${topCuisine}，要我帮你优化推荐吗？`
  }
  return '要我根据你的习惯来定制菜单吗？'
}

// 获取最高偏好
function getTopPreference(preferences) {
  if (!preferences) return null
  
  let topKey = null
  let topValue = -Infinity
  
  for (const [key, value] of Object.entries(preferences)) {
    if (value > topValue) {
      topValue = value
      topKey = key
    }
  }
  
  return topKey
}

// 用户画像管理
function getUserProfile() {
  try {
    const stored = wx.getStorageSync('USER_LEARNING_PROFILE')
    if (stored) {
      return { ...DEFAULT_PROFILE, ...stored }
    }
  } catch (e) {
    console.error('获取用户画像失败:', e)
  }
  return { ...DEFAULT_PROFILE }
}

function saveUserProfile(profile) {
  try {
    wx.setStorageSync('USER_LEARNING_PROFILE', profile)
  } catch (e) {
    console.error('保存用户画像失败:', e)
  }
}

// 更新活跃天数
function updateActiveDays() {
  const profile = getUserProfile()
  const today = formatDateYMD(new Date())
  const lastActiveDate = profile.learningData.lastActiveDate

  if (lastActiveDate !== today) {
    profile.learningData.activeDays += 1
    profile.learningData.lastActiveDate = today
    saveUserProfile(profile)
  }
}

// 辅助函数
function mapBudgetToCost(budget) {
  const map = { low: 'L', mid: 'M', high: 'H' }
  return map[budget] || 'M'
}

function getCostLabel(budget) {
  const map = { low: '实惠', mid: '中等', high: '高档' }
  return map[budget] || '中等'
}

/**
 * V5.3 新增：记录浏览行为（只看不选也记录）
 * @param {String} dishId - 菜品ID
 * @param {String} dishName - 菜品名称
 * @param {Array} tags - 菜品标签
 * @param {Number} dwellTime - 停留时长（毫秒）
 */
function recordDwellBehavior(dishId, dishName, tags = [], dwellTime = 0) {
  try {
    let profile = getUserProfile()
    
    // 初始化行为数据结构
    if (!profile.dwellBehaviors) {
      profile.dwellBehaviors = {}
    }
    
    // 记录停留时长
    if (!profile.dwellBehaviors[dishId]) {
      profile.dwellBehaviors[dishId] = {
        name: dishName,
        tags: tags,
        totalDwell: 0,
        viewCount: 0,
        selected: false,
        lastView: Date.now()
      }
    }
    
    profile.dwellBehaviors[dishId].totalDwell += dwellTime
    profile.dwellBehaviors[dishId].viewCount += 1
    profile.dwellBehaviors[dishId].lastView = Date.now()
    
    // 保存
    saveUserProfile(profile)
    
    console.log('记录浏览行为:', dishName, `停留${dwellTime}ms`)
    
  } catch (e) {
    console.error('记录浏览行为失败:', e)
  }
}

/**
 * V5.3 新增：标记菜品被选中
 * @param {String} dishId - 菜品ID
 */
function markDishSelected(dishId) {
  try {
    let profile = getUserProfile()
    
    if (profile.dwellBehaviors && profile.dwellBehaviors[dishId]) {
      profile.dwellBehaviors[dishId].selected = true
      saveUserProfile(profile)
    }
    
  } catch (e) {
    console.error('标记选中失败:', e)
  }
}

/**
 * V5.3 新增：构建兴趣簇
 * @returns {Object} 兴趣簇 { '川菜-鸡肉': 15000, '粤菜-海鲜': 8000 }
 */
function buildInterestClusters() {
  try {
    const profile = getUserProfile()
    const dwellBehaviors = profile.dwellBehaviors || {}
    const clusters = {}
    
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000
    
    Object.keys(dwellBehaviors).forEach(dishId => {
      const behavior = dwellBehaviors[dishId]
      
      // 只统计最近3天的
      if (behavior.lastView < threeDaysAgo) return
      
      // 只看不选的（停留 > 3秒 且 未选中）
      if (behavior.totalDwell >= 3000 && !behavior.selected) {
        const tags = behavior.tags || []
        
        // 构建簇标识（取前2个标签）
        const clusterKey = tags.slice(0, 2).join('-') || '其他'
        
        if (!clusters[clusterKey]) {
          clusters[clusterKey] = 0
        }
        
        clusters[clusterKey] += behavior.totalDwell
      }
    })
    
    console.log('兴趣簇:', clusters)
    
    return clusters
    
  } catch (e) {
    console.error('构建兴趣簇失败:', e)
    return {}
  }
}

/**
 * V5.3 新增：获取潜在兴趣标签
 * @returns {Array} 标签列表 ['川菜', '鸡肉']
 */
function getLatentInterestTags() {
  const clusters = buildInterestClusters()
  const threshold = 20000  // 20秒以上算感兴趣
  
  const interestedTags = []
  
  Object.keys(clusters).forEach(clusterKey => {
    if (clusters[clusterKey] >= threshold) {
      const tags = clusterKey.split('-')
      interestedTags.push(...tags)
    }
  })
  
  // 去重
  return [...new Set(interestedTags)]
}

/**
 * V5.3 新增：清理过期行为数据（7天前的）
 */
function cleanupOldBehaviors() {
  try {
    const profile = getUserProfile()
    const dwellBehaviors = profile.dwellBehaviors || {}
    
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    
    Object.keys(dwellBehaviors).forEach(dishId => {
      if (dwellBehaviors[dishId].lastView < sevenDaysAgo) {
        delete dwellBehaviors[dishId]
      }
    })
    
    profile.dwellBehaviors = dwellBehaviors
    saveUserProfile(profile)
    
    console.log('清理过期行为数据完成')
    
  } catch (e) {
    console.error('清理过期数据失败:', e)
  }
}

module.exports = {
  getDefaultMenu,
  generatePersonalizedMenu,
  logUserBehavior,
  shouldPromptUser,
  getPromptMessage,
  updateActiveDays,
  getUserProfile,
  saveUserProfile,
  // V5.3 新增
  recordDwellBehavior,
  markDishSelected,
  buildInterestClusters,
  getLatentInterestTags,
  cleanupOldBehaviors
}