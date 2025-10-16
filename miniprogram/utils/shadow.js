// miniprogram/utils/shadow.js
// V3.3 影子层学习引擎 - 隐性维度采集与分析

/**
 * 影子层核心原则：
 * 1. 对用户不可见（不展示任何维度字段）
 * 2. 被动采集（不打扰用户正常使用）
 * 3. 增量学习（每次行为都更新画像）
 */

// 事件类型枚举
const EVENT_TYPES = {
  // 菜单相关
  MENU_OPEN: 'menu_open',              // 打开菜单页
  MENU_GENERATE: 'menu_generate',      // 生成菜单
  MENU_REPLACE_ONE: 'menu_replace_one', // 换单道菜
  MENU_REPLACE_MEAL: 'menu_replace_meal', // 换整餐
  MENU_COMPLETE: 'menu_complete',      // 标记完成
  MENU_COLLECT: 'menu_collect',        // 收藏菜品
  
  // 家庭相关
  PEOPLE_ADJUST: 'people_adjust',      // 调整人数
  GUEST_ADD: 'guest_add',              // 添加客人
  ROLE_ACTION: 'role_action',          // ← 添加这行
  // 时间相关
  PAGE_VISIT: 'page_visit',            // 页面访问（记录时段）
  
  // 购物相关
  SHOPPING_LIST: 'shopping_list'       // 查看购物清单
}

/**
 * 打点函数（核心入口）
 * @param {String} eventType - 事件类型（EVENT_TYPES 中的值）
 * @param {Object} payload - 事件数据
 * @param {Object} context - 上下文（页面路径、时间等）
 */
function track(eventType, payload = {}, context = {}) {
  const event = {
    type: eventType,
    payload: payload,
    timestamp: Date.now(),
    date: formatDate(new Date()),
    hour: new Date().getHours(),
    page: context.page || 'unknown',
    ...context
  }
  
  // 本地存储事件流
  saveEventToLocal(event)
  
  // 实时更新影子层画像
  updateShadowProfile(event)
  
  console.log('[影子层] 事件采集:', eventType, payload)
}

/**
 * 保存事件到本地存储
 * @param {Object} event
 */
function saveEventToLocal(event) {
  try {
    const logs = wx.getStorageSync('SHADOW_EVENTS') || []
    logs.push(event)
    
    // 只保留最近 7 天的数据
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const filtered = logs.filter(e => e.timestamp > sevenDaysAgo)
    
    wx.setStorageSync('SHADOW_EVENTS', filtered.slice(-200)) // 最多保留 200 条
  } catch (e) {
    console.error('[影子层] 保存事件失败:', e)
  }
}

/**
 * 实时更新影子层画像
 * @param {Object} event
 */
function updateShadowProfile(event) {
  try {
    let shadow = wx.getStorageSync('SHADOW_PROFILE') || initShadowProfile()
    
    // 根据事件类型更新不同维度
    switch (event.type) {
      case EVENT_TYPES.MENU_REPLACE_ONE:
      case EVENT_TYPES.MENU_REPLACE_MEAL:
        shadow.change_rate = calculateChangeRate()
        shadow.last_change_time = event.timestamp
        break
        
      case EVENT_TYPES.MENU_OPEN:
      case EVENT_TYPES.PAGE_VISIT:
        shadow.open_hour_hist[event.hour] = (shadow.open_hour_hist[event.hour] || 0) + 1
        shadow.active_days = calculateActiveDays()
        break
        
      case EVENT_TYPES.MENU_COMPLETE:
        shadow.completion_ratio = calculateCompletionRatio()
        shadow.total_completions += 1
        break
        
      case EVENT_TYPES.GUEST_ADD:
        shadow.weekend_guest_freq = calculateGuestFreq()
        break
        
      case EVENT_TYPES.MENU_COLLECT:
        if (!shadow.favorite_dishes) shadow.favorite_dishes = []
        if (!shadow.favorite_dishes.includes(event.payload.dish_id)) {
          shadow.favorite_dishes.push(event.payload.dish_id)
        }
        break
    }
    
    shadow.updated_at = Date.now()
    wx.setStorageSync('SHADOW_PROFILE', shadow)
    
  } catch (e) {
    console.error('[影子层] 更新画像失败:', e)
  }
}

/**
 * 初始化影子层画像
 */
function initShadowProfile() {
  return {
    change_rate: 0,              // 换菜率（0-1）
    open_hour_hist: {},          // 打开时段分布 {6: 3, 12: 5, 18: 10}
    weekend_guest_freq: 0,       // 周末客人频率（0-1）
    completion_ratio: 0,         // 完成率（0-1）
    total_completions: 0,        // 总完成次数
    favorite_dishes: [],         // 收藏的菜品ID列表
    active_days: 0,              // 活跃天数
    last_change_time: null,      // 最后换菜时间
    created_at: Date.now(),
    updated_at: Date.now()
  }
}

/**
 * 计算换菜率（最近7天）
 */
function calculateChangeRate() {
  try {
    const events = wx.getStorageSync('SHADOW_EVENTS') || []
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    
    const recentEvents = events.filter(e => e.timestamp > sevenDaysAgo)
    const generateCount = recentEvents.filter(e => e.type === EVENT_TYPES.MENU_GENERATE).length
    const changeCount = recentEvents.filter(e => 
      e.type === EVENT_TYPES.MENU_REPLACE_ONE || 
      e.type === EVENT_TYPES.MENU_REPLACE_MEAL
    ).length
    
    if (generateCount === 0) return 0
    return Math.min(changeCount / generateCount, 1)
  } catch (e) {
    return 0
  }
}

/**
 * 计算完成率（最近7天）
 */
function calculateCompletionRatio() {
  try {
    const events = wx.getStorageSync('SHADOW_EVENTS') || []
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    
    const recentEvents = events.filter(e => e.timestamp > sevenDaysAgo)
    const generateCount = recentEvents.filter(e => e.type === EVENT_TYPES.MENU_GENERATE).length
    const completeCount = recentEvents.filter(e => e.type === EVENT_TYPES.MENU_COMPLETE).length
    
    if (generateCount === 0) return 0
    return Math.min(completeCount / generateCount, 1)
  } catch (e) {
    return 0
  }
}

/**
 * 计算活跃天数（去重日期）
 */
function calculateActiveDays() {
  try {
    const events = wx.getStorageSync('SHADOW_EVENTS') || []
    const dates = new Set()
    
    events.forEach(e => {
      if (e.date) dates.add(e.date)
    })
    
    return dates.size
  } catch (e) {
    return 0
  }
}

/**
 * 计算周末客人频率
 */
function calculateGuestFreq() {
  try {
    const events = wx.getStorageSync('SHADOW_EVENTS') || []
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    
    const recentEvents = events.filter(e => e.timestamp > sevenDaysAgo)
    const weekendEvents = recentEvents.filter(e => {
      const date = new Date(e.timestamp)
      const day = date.getDay()
      return day === 0 || day === 6 // 周六周日
    })
    
    const guestCount = weekendEvents.filter(e => e.type === EVENT_TYPES.GUEST_ADD).length
    const weekendCount = Math.ceil(weekendEvents.length / 10) // 粗略估算周末次数
    
    if (weekendCount === 0) return 0
    return Math.min(guestCount / weekendCount, 1)
  } catch (e) {
    return 0
  }
}

/**
 * 获取影子层画像（供推荐算法使用）
 */
function getShadowProfile() {
  try {
    return wx.getStorageSync('SHADOW_PROFILE') || initShadowProfile()
  } catch (e) {
    return initShadowProfile()
  }
}

/**
 * 获取用户偏好时段（打开频率最高的时段）
 */
function getPreferredHour() {
  const shadow = getShadowProfile()
  const hist = shadow.open_hour_hist || {}
  
  let maxHour = 12
  let maxCount = 0
  
  for (let hour in hist) {
    if (hist[hour] > maxCount) {
      maxCount = hist[hour]
      maxHour = parseInt(hour)
    }
  }
  
  return maxHour
}

/**
 * 判断是否为"挑剔用户"（换菜率 > 0.5）
 */
function isPickyUser() {
  const shadow = getShadowProfile()
  return shadow.change_rate > 0.5
}

/**
 * 判断是否为"忠实用户"（完成率 > 0.7 且活跃天数 > 7）
 */
function isLoyalUser() {
  const shadow = getShadowProfile()
  return shadow.completion_ratio > 0.7 && shadow.active_days > 7
}

/**
 * 获取推荐调整系数（供菜单推荐使用）
 * @returns {Object} { diversity: 0.8, complexity: 0.5 }
 */
function getRecommendAdjustment() {
  const shadow = getShadowProfile()
  
  return {
    // 换菜率高 → 增加多样性
    diversity: Math.max(0.5, shadow.change_rate * 1.5),
    
    // 完成率低 → 降低复杂度
    complexity: shadow.completion_ratio < 0.5 ? 0.3 : 0.7,
    
    // 周末客人频繁 → 增加分享菜
    shareable: shadow.weekend_guest_freq > 0.3
  }
}

/**
 * 生成每日复盘数据（供云函数使用）
 */
function generateDailyReport() {
  const shadow = getShadowProfile()
  const events = wx.getStorageSync('SHADOW_EVENTS') || []
  
  const today = formatDate(new Date())
  const todayEvents = events.filter(e => e.date === today)
  
  return {
    date: today,
    shadow_profile: shadow,
    today_events: {
      total: todayEvents.length,
      menu_generated: todayEvents.filter(e => e.type === EVENT_TYPES.MENU_GENERATE).length,
      dishes_changed: todayEvents.filter(e => e.type === EVENT_TYPES.MENU_REPLACE_ONE).length,
      completed: todayEvents.filter(e => e.type === EVENT_TYPES.MENU_COMPLETE).length
    },
    insights: {
      is_picky: isPickyUser(),
      is_loyal: isLoyalUser(),
      preferred_hour: getPreferredHour(),
      adjustment: getRecommendAdjustment()
    }
  }
}

/**
 * 重置影子层画像（用户主动操作）
 */
function resetShadowProfile() {
  try {
    wx.setStorageSync('SHADOW_PROFILE', initShadowProfile())
    wx.setStorageSync('SHADOW_EVENTS', [])
    return true
  } catch (e) {
    return false
  }
}

// 工具函数：日期格式化
function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

module.exports = {
  EVENT_TYPES,
  track,
  getShadowProfile,
  getPreferredHour,
  isPickyUser,
  isLoyalUser,
  getRecommendAdjustment,
  generateDailyReport,
  resetShadowProfile
}