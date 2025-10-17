// utils/storage.js - V3.0 升级版
const KEY = {
  PROFILE: 'USER_PROFILE',
  PROFILE_V3: 'USER_PROFILE_V3',  // V3.0 新增
  HELPERS_V3: 'HELPERS_V3',       // V3.0 新增
  DIET_PREF_V3: 'DIET_PREF_V3',   // V3.0 新增
  SIX_DIMENSIONS: 'SIX_DIMENSIONS_V3', // V3.0 六维画像
  OVERRIDES: 'TEMP_OVERRIDES',
  WEATHER_CACHE: 'WEATHER_CACHE',
  LAST_GEO: 'LAST_GEO_DISPLAY',
  LAST_LOC: 'LAST_LOC',
  SETTINGS: 'APP_SETTINGS',
  MENU_HISTORY: 'MENU_HISTORY',
  FEEDBACK_LOGS: 'FEEDBACK_LOGS_V3'
}

function get(key, defaultValue = null) {
  try {
    return wx.getStorageSync(key) || defaultValue
  } catch (e) {
    console.error('Storage get error:', e)
    return defaultValue
  }
}

function set(key, value) {
  try {
    wx.setStorageSync(key, value)
    return true
  } catch (e) {
    console.error('Storage set error:', e)
    return false
  }
}

function remove(key) {
  try {
    wx.removeStorageSync(key)
    return true
  } catch (e) {
    console.error('Storage remove error:', e)
    return false
  }
}

// V3.0 新增：生成六维画像数据
function generateSixDimensions(formData) {
  const { familyType, childCount, helpers, dietGoals, budgetLevel, lifeStyle } = formData
  
  // 1. 结构维 (家庭结构复杂度)
  let structureScore = 50
  if (familyType === 'single') structureScore = 30
  else if (familyType === 'couple') structureScore = 40
  else if (familyType === 'hasChild') structureScore = 60 + (childCount * 10)
  
  const hasHelpers = helpers.nanny.enabled || helpers.cleaner.enabled || helpers.driver.enabled
  if (hasHelpers) structureScore += 20
  
  // 2. 生活方式维 (消费层级 + 审美)
  let lifestyleScore = 50
  const budgetScores = { '实惠': 30, '小资': 60, '精致': 90 }
  const styleScores = { '实用派': 40, '小资生活': 70, '精致控': 90 }
  lifestyleScore = (budgetScores[budgetLevel] + styleScores[lifeStyle]) / 2
  
  // 3. 健康维 (基于饮食目标)
  let healthScore = 50
  const healthGoals = ['antiInflammatory', 'bloodSugar', 'weightLoss', 'sleep']
  const matchedHealthGoals = dietGoals.filter(goal => healthGoals.includes(goal))
  healthScore = 40 + (matchedHealthGoals.length * 15)
  
  // 4. 行为维 (规律性)
  let behaviorScore = 60 // 建档本身说明有规划意识
  if (hasHelpers) behaviorScore += 15 // 有帮手说明善于委托
  if (dietGoals.includes('seasonal')) behaviorScore += 10 // 节气养生说明有节奏感
  
  // 5. 情绪人格维 (基于AI语气选择)
  let emotionScore = 50
  const toneScores = { '温柔陪伴': 80, '干练高效': 60, '幽默轻松': 70 }
  emotionScore = toneScores[formData.aiTone] || 50
  
  // 6. 兴趣成长维 (基于多样化程度)
  let growthScore = 40
  if (familyType === 'hasChild') growthScore += 20 // 有孩子说明关注成长
  if (formData.hasPet) growthScore += 15 // 有宠物说明有爱心
  if (dietGoals.length >= 3) growthScore += 15 // 多目标说明追求全面
  
  return {
    structure: {
      score: Math.min(structureScore, 100),
      desc: hasHelpers ? '家庭结构丰富，善于借助外力' : '紧密型家庭结构'
    },
    lifestyle: {
      score: Math.min(lifestyleScore, 100),
      desc: budgetLevel === '精致' ? '追求生活品质' : budgetLevel === '小资' ? '品质与实用并重' : '务实的生活方式'
    },
    health: {
      score: Math.min(healthScore, 100),
      desc: matchedHealthGoals.length >= 2 ? '高度关注健康管理' : '基础健康意识'
    },
    behavior: {
      score: Math.min(behaviorScore, 100),
      desc: hasHelpers ? '善于规划和委托' : '亲力亲为的执行者'
    },
    emotion: {
      score: Math.min(emotionScore, 100),
      desc: formData.aiTone === '温柔陪伴' ? '温和包容的性格' : 
            formData.aiTone === '干练高效' ? '果断高效的性格' : '乐观开朗的性格'
    },
    growth: {
      score: Math.min(growthScore, 100),
      desc: familyType === 'hasChild' ? '关注家庭成长' : '注重个人提升'
    }
  }
}

// V3.0 新增：保存用户画像
function saveUserProfileV3(formData) {
  const sixDimensions = generateSixDimensions(formData)
  
  // 主画像
  const profileV3 = {
    version: '3.0',
    city: formData.city,
    family_profile: buildFamilyProfile(formData),
    total_members: calculateTotalMembers(formData),
  // ✅ 新增：提取儿童年龄数组
  has_child: formData.familyType === 'hasChild',
  kids_ages: extractKidsAges(formData),
  six_dimensions: sixDimensions,
  ai_tone: mapAiTone(formData.aiTone),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
  }
  
  // 家庭帮手配置
  const helpersV3 = Object.entries(formData.helpers)
    .filter(([type, config]) => config.enabled)
    .map(([type, config]) => ({
      type: mapHelperType(type),
      count: config.count,
      frequency: config.frequency || '每日',
      duties: getHelperDuties(type)
    }))
  
  // 饮食偏好配置
  const dietPrefV3 = {
    goals: formData.dietGoals,
    taste: formData.tastePreferences,
    taboos: formData.dietTaboos,
    rhythm: {
      shopping_freq: formData.shoppingFreq,
      breakfast_time: formData.breakfastTime,
      dinner_time: formData.dinnerTime,
      dining_out_freq: formData.diningOutFreq
    },
    budget: formData.budgetLevel
  }
  
  // 保存到存储
  set(KEY.PROFILE_V3, profileV3)
  set(KEY.HELPERS_V3, helpersV3)
  set(KEY.DIET_PREF_V3, dietPrefV3)
  set(KEY.SIX_DIMENSIONS, sixDimensions)
  
  // 兼容性：也更新旧格式
  const legacyProfile = {
    ...formData,
    onboarding_done: true,
    setup_completed: true,
    version: '3.0',
    six_dimensions: sixDimensions
  }
  set(KEY.PROFILE, legacyProfile)
  
  return { profileV3, helpersV3, dietPrefV3, sixDimensions }
}

// V3.0 新增：获取完整用户画像
function getUserProfileV3() {
  const profile = get(KEY.PROFILE_V3, {})
  const helpers = get(KEY.HELPERS_V3, [])
  const dietPref = get(KEY.DIET_PREF_V3, {})
  const sixDimensions = get(KEY.SIX_DIMENSIONS, {})
  
  // ========== 如果数据为空，返回默认值 ==========
  if (!profile || Object.keys(profile).length === 0) {
    console.log('⚠️ 用户数据为空，返回默认值')
    return {
      isV3: false,
      profile: {
        ai_tone: '温柔',
        has_child: false,
        health_goal: ''
      },
      family: { 
        adults: 2, 
        kids: 0, 
        elders: 0 
      },
      dietPref: { 
        budget: '实惠', 
        preferences: [] 
      },
      helpers: [],
      health_goals: [],
      allergies: []
    }
  }
  
  return {
    profile,
    helpers,
    dietPref,
    sixDimensions,
    isV3: !!profile.version
  }
}

// 辅助函数
function buildFamilyProfile(formData) {
  const { familyType, childCount, childrenInfo } = formData
  
  if (familyType === 'single') {
    return `1成人(${formData.gender})`
  } else if (familyType === 'couple') {
    return '2成人'
  } else if (familyType === 'hasChild') {
    const childDesc = childrenInfo.map(child => {
      const ageDesc = child.years <= 2 ? `${child.years}岁${child.months}个月` : `${child.years}岁`
      const genderDesc = child.gender === 'skip' ? '' : (child.gender === 'boy' ? '男孩' : '女孩')
      return `${ageDesc}${genderDesc}`
    }).join('、')
    return `2成人+${childCount}儿童(${childDesc})`
  }
  return '未知结构'
}

function calculateTotalMembers(formData) {
  let total = 0
  if (formData.familyType === 'single') total = 1
  else if (formData.familyType === 'couple') total = 2
  else if (formData.familyType === 'hasChild') total = 2 + formData.childCount
  return total
}

function mapHelperType(type) {
  const map = {
    'nanny': '保姆',
    'cleaner': '钟点工', 
    'driver': '司机'
  }
  return map[type] || type
}

function mapAiTone(tone) {
  const map = {
    '温柔陪伴': '温柔',
    '干练高效': '干练',
    '幽默轻松': '幽默'
  }
  return map[tone] || '温柔'
}

function getHelperDuties(type) {
  const duties = {
    'nanny': ['做饭', '保洁', '照顾孩子'],
    'cleaner': ['保洁'],
    'driver': ['接送', '采买']
  }
  return duties[type] || []
}

// 覆盖机制工具函数 (保持原有逻辑)
function applyOverride(type, value, options = {}) {
  const overrides = get(KEY.OVERRIDES, [])
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  
  const newOverride = {
    id: generateId(),
    type,
    value,
    date_from: options.dateFrom || formatDateYMD(today),
    date_to: options.dateTo || formatDateYMD(tomorrow),
    meals: options.meals || ['lunch', 'dinner'],
    reason: options.reason || '临时调整',
    created_at: new Date().toISOString()
  }
  
  const filteredOverrides = overrides.filter(o => o.type !== type)
  filteredOverrides.push(newOverride)
  
  set(KEY.OVERRIDES, filteredOverrides)
  return newOverride
}

function getActiveOverrides(date = null) {
  const overrides = get(KEY.OVERRIDES, [])
  const targetDate = date || formatDateYMD(new Date())
  
  return overrides.filter(override => {
    return override.date_from <= targetDate && override.date_to >= targetDate
  })
}

function clearOverridesByType(type) {
  const overrides = get(KEY.OVERRIDES, [])
  const filtered = overrides.filter(o => o.type !== type)
  set(KEY.OVERRIDES, filtered)
  return filtered
}

function clearExpiredOverrides() {
  const overrides = get(KEY.OVERRIDES, [])
  const today = formatDateYMD(new Date())
  const active = overrides.filter(o => o.date_to >= today)
  set(KEY.OVERRIDES, active)
  return active
}

// 工具函数
function formatDateYMD(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
}
// ✅ 新增：提取儿童年龄数组
function extractKidsAges(formData) {
  if (formData.familyType !== 'hasChild' || !formData.childrenInfo) {
    return []
  }
  
  return formData.childrenInfo.map(child => {
    const years = child.years || 0
    const months = child.months || 0
    return parseFloat((years + months / 12).toFixed(1))
  })
}
function saveDietPreferences(preferences) {
 const {
   goals,           // 饮食目标数组
   allergies,       // 过敏/禁忌数组
   budget,          // 预算档次
   cuisine_prefs    // 菜系偏好（可选，≤3）
 } = preferences
 
 const dietPref = get(KEY.DIET_PREF_V3, {})
 
 // 合并更新
 const updated = {
   ...dietPref,
   goals: goals || [],
   allergies: allergies || [],
   budget: budget || '实惠',
   cuisine_prefs: cuisine_prefs || [],
   setup_completed: true,
   updated_at: new Date().toISOString()
 }
 
 set(KEY.DIET_PREF_V3, updated)
 
 // 同步更新旧格式
 const legacyProfile = get(KEY.PROFILE, {})
 legacyProfile.setup_completed = true
 set(KEY.PROFILE, legacyProfile)
 
 return updated
}

// 在文件最后添加（删除所有单独的 export）
// ========== 统一导出 ==========
module.exports = {
  KEY,
  get,
  set,
  remove,
  generateSixDimensions,
  saveUserProfileV3,
  getUserProfileV3,
  applyOverride,
  getActiveOverrides,
  clearOverridesByType,
  clearExpiredOverrides,
  saveDietPreferences
}