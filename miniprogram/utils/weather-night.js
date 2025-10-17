// ==================== 天气夜色真实化 ====================

// utils/weather-night.js
// V5.3-Plus 真实日落时间 + 降水/雾霾效果

/**
 * 计算真实日落时间
 * @param {number} latitude - 纬度
 * @param {number} longitude - 经度
 * @param {Date} date - 日期
 * @returns {Date} 日落时间
 */
function calculateSunset(latitude, longitude, date = new Date()) {
  // 使用SunCalc算法或第三方库
  // 这里简化为查表法
  
  const month = date.getMonth() + 1
  const sunsetHour = getSunsetHourByMonth(month, latitude)
  
  const sunsetTime = new Date(date)
  sunsetTime.setHours(sunsetHour, 0, 0, 0)
  
  return sunsetTime
}

function getSunsetHourByMonth(month, latitude) {
  // 北半球近似日落时间（小时）
  const sunsetTable = {
    1: 17, 2: 18, 3: 18, 4: 19, 5: 19, 6: 20,
    7: 20, 8: 19, 9: 18, 10: 18, 11: 17, 12: 17
  }
  return sunsetTable[month] || 18
}

/**
 * 应用天气效果
 */
function applyWeatherEffects(weather, isNight) {
  const effects = {
    brightness: 1.0,    // 亮度（0-1）
    opacity: 1.0,       // 透明度（0-1）
    filter: null        // CSS滤镜
  }
  
  // 夜间基础调整
  if (isNight) {
    effects.brightness = 0.7
    effects.opacity = 0.9
  }
  
  // 降水效果
  if (weather.precipitation > 0) {
    effects.brightness *= 0.85
    effects.opacity *= 0.95
    
    // 夜雨特殊处理（降亮20-35%，升透10-15%）
    if (isNight) {
      effects.brightness *= (1 - 0.20 - Math.random() * 0.15)
      effects.opacity += 0.10 + Math.random() * 0.05
    }
  }
  
  // 雾霾效果（与降水互斥）
  if (weather.aqi > 150 && weather.precipitation === 0) {
    effects.filter = `blur(2px) opacity(0.8)`
  }
  
  return effects
}

module.exports = {
  calculateSunset,
  applyWeatherEffects
}
