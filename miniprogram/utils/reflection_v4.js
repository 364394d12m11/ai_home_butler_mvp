// utils/reflection_v4.js - V4.2 每日复盘系统核心模块

const { get, set, getUserProfileV3 } = require('./storage')
const { generateReflectionTone } = require('./perception_v4')

/**
 * 收集今日数据用于复盘
 * @param {Object} context - 上下文数据
 */
function collectDailyData(context = {}) {
  const today = new Date()
  const dateYmd = formatDate(today)
  
  // 获取已有的复盘数据
  let reflectionData = get('REFLECTION_DATA_V4', {})
  if (!reflectionData.days) reflectionData.days = {}
  
  // 今日数据结构
  const todayData = reflectionData.days[dateYmd] || {
    date: dateYmd,
    weather: null,
    menu_generated: false,
    menu_explained: false,
    tone_switched: false,
    settings_accessed: false,
    reports_viewed: false,
    interactions: 0,
    ai_greetings_count: 0,
    active_minutes: 0,
    created_at: new Date().toISOString()
  }
  
  // 更新数据
  if (context.type === 'weather_update') {
    todayData.weather = {
      text: context.weather?.now?.text || '',
      temp: context.weather?.now?.temp || '',
      theme: context.weatherTheme?.type || ''
    }
  }
  
  if (context.type === 'menu_generation') {
    todayData.menu_generated = true
    todayData.interactions++
  }
  
  if (context.type === 'meal_explanation') {
    todayData.menu_explained = true
    todayData.interactions++
  }
  
  if (context.type === 'tone_switch') {
    todayData.tone_switched = true
    todayData.interactions++
  }
  
  if (context.type === 'settings_access') {
    todayData.settings_accessed = true
    todayData.interactions++
  }
  
  if (context.type === 'reports_view') {
    todayData.reports_viewed = true
    todayData.interactions++
  }
  
  if (context.type === 'ai_greeting') {
    todayData.ai_greetings_count++
  }
  
  if (context.type === 'page_activity') {
    todayData.active_minutes += context.minutes || 1
  }
  
  // 保存数据
  todayData.updated_at = new Date().toISOString()
  reflectionData.days[dateYmd] = todayData
  
  // 清理超过30天的数据
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const cutoffDate = formatDate(thirtyDaysAgo)
  
  Object.keys(reflectionData.days).forEach(date => {
    if (date < cutoffDate) {
      delete reflectionData.days[date]
    }
  })
  
  set('REFLECTION_DATA_V4', reflectionData)
  return todayData
}

/**
 * 生成每日复盘报告
 * @param {String} targetDate - 目标日期 YYYY-MM-DD
 * @returns {Object} 复盘报告
 */
function generateDailyReflection(targetDate = null) {
  if (!targetDate) {
    const today = new Date()
    targetDate = formatDate(today)
  }
  
  const reflectionData = get('REFLECTION_DATA_V4', {})
  const dayData = reflectionData.days?.[targetDate]
  
  if (!dayData) {
    return null
  }
  
  const userDataV3 = getUserProfileV3()
  const profile = userDataV3.isV3 ? userDataV3.profile : get('USER_PROFILE', {})
  
  // 计算活跃度得分
  const activityScore = calculateActivityScore(dayData)
  
  // 生成洞察
  const insights = generateDailyInsights(dayData, activityScore)
  
  // 生成建议
  const suggestions = generateDailySuggestions(dayData, profile, activityScore)
  
  // 使用AI语气生成总结
  const aiTone = profile.ai_tone || '温柔'
  const summary = generateReflectionTone({
    date: targetDate,
    activityScore,
    totalInteractions: dayData.interactions,
    menuGenerated: dayData.menu_generated,
    weather: dayData.weather
  }, aiTone)
  
  return {
    date: targetDate,
    activityScore,
    summary,
    insights,
    suggestions,
    rawData: dayData,
    generatedAt: new Date().toISOString()
  }
}

/**
 * 生成每周复盘报告
 * @param {String} weekStartDate - 周开始日期
 * @returns {Object} 周复盘报告
 */
function generateWeeklyReflection(weekStartDate = null) {
  if (!weekStartDate) {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const monday = new Date(today)
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    weekStartDate = formatDate(monday)
  }
  
  const reflectionData = get('REFLECTION_DATA_V4', {})
  const weekDays = []
  
  // 收集一周的数据
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStartDate)
    date.setDate(date.getDate() + i)
    const dateStr = formatDate(date)
    const dayData = reflectionData.days?.[dateStr]
    
    if (dayData) {
      weekDays.push({
        ...dayData,
        dayName: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][i]
      })
    }
  }
  
  if (weekDays.length === 0) {
    return null
  }
  
  // 计算周统计
  const weekStats = calculateWeekStats(weekDays)
  
  // 生成周洞察
  const weekInsights = generateWeekInsights(weekDays, weekStats)
  
  // 生成周建议
  const weekSuggestions = generateWeekSuggestions(weekStats)
  
  const userDataV3 = getUserProfileV3()
  const profile = userDataV3.isV3 ? userDataV3.profile : get('USER_PROFILE', {})
  const aiTone = profile.ai_tone || '温柔'
  
  // 生成周总结
  const weekSummary = generateWeekSummary(weekStats, aiTone)
  
  const endDate = new Date(weekStartDate)
  endDate.setDate(endDate.getDate() + 6)
  
  return {
    weekStart: weekStartDate,
    weekEnd: formatDate(endDate),
    stats: weekStats,
    summary: weekSummary,
    insights: weekInsights,
    suggestions: weekSuggestions,
    dailyData: weekDays,
    generatedAt: new Date().toISOString()
  }
}

/**
 * 计算每日活跃度得分
 */
function calculateActivityScore(dayData) {
  let score = 0
  
  // 基础互动
  if (dayData.menu_generated) score += 25
  if (dayData.menu_explained) score += 15
  if (dayData.tone_switched) score += 10
  if (dayData.settings_accessed) score += 10
  if (dayData.reports_viewed) score += 15
  
  // 互动频次加分
  if (dayData.interactions >= 5) score += 15
  else if (dayData.interactions >= 3) score += 10
  else if (dayData.interactions >= 1) score += 5
  
  // 活跃时长加分
  if (dayData.active_minutes >= 10) score += 10
  else if (dayData.active_minutes >= 5) score += 5
  
  return Math.min(score, 100)
}

/**
 * 生成每日洞察
 */
function generateDailyInsights(dayData, activityScore) {
  const insights = []
  
  if (activityScore >= 80) {
    insights.push('今天对小橙子的使用很充分，各项功能都有涉及')
  } else if (activityScore >= 60) {
    insights.push('今天有一定的互动，但还有提升空间')
  } else if (activityScore >= 40) {
    insights.push('今天的使用比较基础，可以尝试更多功能')
  } else {
    insights.push('今天与小橙子的互动较少，可能比较忙碌')
  }
  
  if (dayData.menu_generated && dayData.menu_explained) {
    insights.push('很棒！不仅生成了菜单，还查看了详细说明')
  }
  
  if (dayData.tone_switched) {
    insights.push('尝试了不同的AI语气，说明在探索个性化体验')
  }
  
  if (dayData.weather && dayData.weather.theme) {
    insights.push(`今天的天气是${dayData.weather.text}，界面也相应调整了氛围`)
  }
  
  return insights
}

/**
 * 生成每日建议
 */
function generateDailySuggestions(dayData, profile, activityScore) {
  const suggestions = []
  
  if (!dayData.menu_generated) {
    suggestions.push('可以尝试生成今日菜单，获得个性化推荐')
  }
  
  if (!dayData.reports_viewed && activityScore < 60) {
    suggestions.push('查看报告页面，了解家庭数据分析')
  }
  
  if (!dayData.settings_accessed) {
    suggestions.push('访问设置页面，个性化配置小橙子')
  }
  
  if (dayData.interactions < 3) {
    suggestions.push('多尝试不同功能，让小橙子更了解你的需求')
  }
  
  if (profile.ai_tone === '温柔' && !dayData.tone_switched) {
    suggestions.push('可以尝试切换AI语气，体验不同的交互风格')
  }
  
  return suggestions
}

/**
 * 计算周统计
 */
function calculateWeekStats(weekDays) {
  const stats = {
    activeDays: weekDays.length,
    totalInteractions: 0,
    avgActivityScore: 0,
    menuGeneratedDays: 0,
    toneSwatchedDays: 0,
    reportsViewedDays: 0,
    peakActivityDay: null,
    weatherThemes: {},
    consistencyScore: 0
  }
  
  let totalScore = 0
  let maxScore = 0
  let maxScoreDay = null
  
  weekDays.forEach(day => {
    const score = calculateActivityScore(day)
    totalScore += score
    stats.totalInteractions += day.interactions
    
    if (day.menu_generated) stats.menuGeneratedDays++
    if (day.tone_switched) stats.toneSwatchedDays++
    if (day.reports_viewed) stats.reportsViewedDays++
    
    if (score > maxScore) {
      maxScore = score
      maxScoreDay = day
    }
    
    if (day.weather?.theme) {
      stats.weatherThemes[day.weather.theme] = (stats.weatherThemes[day.weather.theme] || 0) + 1
    }
  })
  
  stats.avgActivityScore = Math.round(totalScore / weekDays.length)
  stats.peakActivityDay = maxScoreDay
  
  // 计算一致性得分（基于每日得分的方差）
  const variance = weekDays.reduce((acc, day) => {
    const score = calculateActivityScore(day)
    return acc + Math.pow(score - stats.avgActivityScore, 2)
  }, 0) / weekDays.length
  
  stats.consistencyScore = Math.max(0, 100 - Math.sqrt(variance))
  
  return stats
}

/**
 * 生成周洞察
 */
function generateWeekInsights(weekDays, weekStats) {
  const insights = []
  
  if (weekStats.activeDays >= 6) {
    insights.push('这周几乎每天都在使用小橙子，习惯养成得很好')
  } else if (weekStats.activeDays >= 4) {
    insights.push('这周有较好的使用频率，保持规律很重要')
  } else {
    insights.push('这周使用频率相对较低，可能工作生活比较忙碌')
  }
  
  if (weekStats.consistencyScore >= 80) {
    insights.push('每日使用很稳定，形成了良好的使用习惯')
  } else if (weekStats.consistencyScore >= 60) {
    insights.push('使用习惯基本稳定，个别日子有波动')
  } else {
    insights.push('使用频率波动较大，可以尝试建立更规律的使用习惯')
  }
  
  if (weekStats.menuGeneratedDays >= 5) {
    insights.push('经常使用菜单功能，对饮食规划很重视')
  }
  
  if (weekStats.peakActivityDay) {
    insights.push(`${weekStats.peakActivityDay.dayName}是本周最活跃的一天`)
  }
  
  return insights
}

/**
 * 生成周建议
 */
function generateWeekSuggestions(weekStats) {
  const suggestions = []
  
  if (weekStats.activeDays < 5) {
    suggestions.push('尝试每天至少打开一次小橙子，建立使用习惯')
  }
  
  if (weekStats.avgActivityScore < 60) {
    suggestions.push('可以更深入地探索各项功能，提升使用体验')
  }
  
  if (weekStats.menuGeneratedDays < 3) {
    suggestions.push('多使用菜单生成功能，让小橙子更好地服务您的饮食需求')
  }
  
  if (weekStats.reportsViewedDays < 2) {
    suggestions.push('定期查看报告，了解自己的使用趋势和改进方向')
  }
  
  if (weekStats.consistencyScore < 70) {
    suggestions.push('尝试在固定时间使用小橙子，建立稳定的使用节奏')
  }
  
  return suggestions
}

/**
 * 生成周总结（使用AI语气）
 */
function generateWeekSummary(weekStats, aiTone) {
  const { activeDays, avgActivityScore, totalInteractions } = weekStats
  
  // 构造报告数据供 generateReflectionTone 使用
  const reportData = {
    totalDays: activeDays,
    completionRate: avgActivityScore / 100,
    favoriteCategory: '菜单功能' // 可以根据实际数据调整
  }
  
  return generateReflectionTone(reportData, aiTone)
}

/**
 * 获取复盘历史
 */
function getReflectionHistory(days = 7) {
  const reflectionData = get('REFLECTION_DATA_V4', {})
  const today = new Date()
  const history = []
  
  for (let i = 0; i < days; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() - i)
    const dateStr = formatDate(date)
    const dayData = reflectionData.days?.[dateStr]
    
    if (dayData) {
      history.push({
        date: dateStr,
        score: calculateActivityScore(dayData),
        interactions: dayData.interactions,
        menuGenerated: dayData.menu_generated
      })
    }
  }
  
  return history.reverse() // 按时间正序返回
}

/**
 * 清理过期数据
 */
function cleanupReflectionData() {
  const reflectionData = get('REFLECTION_DATA_V4', {})
  if (!reflectionData.days) return
  
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const cutoffDate = formatDate(thirtyDaysAgo)
  
  let cleaned = 0
  Object.keys(reflectionData.days).forEach(date => {
    if (date < cutoffDate) {
      delete reflectionData.days[date]
      cleaned++
    }
  })
  
  if (cleaned > 0) {
    set('REFLECTION_DATA_V4', reflectionData)
    console.log(`清理了 ${cleaned} 条过期复盘数据`)
  }
}

// 工具函数
function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

module.exports = {
  collectDailyData,
  generateDailyReflection,
  generateWeeklyReflection,
  getReflectionHistory,
  cleanupReflectionData,
  calculateActivityScore
}