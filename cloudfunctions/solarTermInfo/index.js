// cloudfunctions/solarTermInfo/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// 24节气数据
const SOLAR_TERMS = [
  { name: '立春', date: '02-04', emoji: '🌱', greeting: '春暖花开的时候又到了' },
  { name: '雨水', date: '02-19', emoji: '🌧️', greeting: '春雨润物,万物复苏' },
  { name: '惊蛰', date: '03-05', emoji: '⚡', greeting: '春雷乍响,万物生长' },
  { name: '春分', date: '03-20', emoji: '🌸', greeting: '春暖花开,昼夜平分' },
  { name: '清明', date: '04-04', emoji: '🌿', greeting: '清明时节,踏青正好' },
  { name: '谷雨', date: '04-20', emoji: '🌾', greeting: '春雨贵如油,谷物正生长' },
  { name: '立夏', date: '05-05', emoji: '☀️', greeting: '夏天来了,注意防暑' },
  { name: '小满', date: '05-21', emoji: '🌱', greeting: '小满时节,作物渐丰' },
  { name: '芒种', date: '06-05', emoji: '🌾', greeting: '芒种时节,收获在望' },
  { name: '夏至', date: '06-21', emoji: '🔆', greeting: '夏至已至,白昼最长' },
  { name: '小暑', date: '07-07', emoji: '🌡️', greeting: '小暑时节,注意清热' },
  { name: '大暑', date: '07-23', emoji: '🔥', greeting: '大暑天气,多喝水降温' },
  { name: '立秋', date: '08-07', emoji: '🍂', greeting: '立秋了,秋高气爽' },
  { name: '处暑', date: '08-23', emoji: '🌾', greeting: '处暑时节,暑气渐消' },
  { name: '白露', date: '09-07', emoji: '💧', greeting: '白露时节,昼夜温差大' },
  { name: '秋分', date: '09-23', emoji: '🍁', greeting: '秋分到了,收获的季节' },
  { name: '寒露', date: '10-08', emoji: '🌨️', greeting: '寒露时节,注意保暖' },
  { name: '霜降', date: '10-23', emoji: '❄️', greeting: '霜降了,天气转凉' },
  { name: '立冬', date: '11-07', emoji: '🧥', greeting: '立冬了,准备过冬' },
  { name: '小雪', date: '11-22', emoji: '🌨️', greeting: '小雪时节,温差加大' },
  { name: '大雪', date: '12-07', emoji: '☃️', greeting: '大雪纷飞,注意保暖' },
  { name: '冬至', date: '12-22', emoji: '🥟', greeting: '冬至到了,记得吃饺子' },
  { name: '小寒', date: '01-05', emoji: '🧊', greeting: '小寒时节,天气最冷' },
  { name: '大寒', date: '01-20', emoji: '🌨️', greeting: '大寒将至,春天不远了' }
]

/**
 * 🌅 计算日出时间
 * @param {number} lat - 纬度
 * @param {number} lng - 经度
 * @param {Date} date - 日期
 * @returns {string} 时间字符串 "HH:MM"
 */
function calculateSunrise(lat, lng, date = new Date()) {
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000)
  
  // 基准日出时间（春分/秋分约6点）
  let baseHour = 6
  
  // 根据日期调整（夏季早，冬季晚）
  const seasonOffset = -Math.sin((dayOfYear - 80) * 2 * Math.PI / 365) * 1.5
  baseHour += seasonOffset
  
  // 根据纬度调整（北方变化更大）
  const latOffset = (lat - 30) * 0.02
  baseHour += latOffset
  
  // 根据经度调整时区偏移（东经120°为基准）
  const lngOffset = (lng - 120) / 15
  baseHour += lngOffset
  
  const hour = Math.floor(baseHour)
  const minute = Math.floor((baseHour - hour) * 60)
  
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * 🌇 计算日落时间
 * @param {number} lat - 纬度
 * @param {number} lng - 经度
 * @param {Date} date - 日期
 * @returns {string} 时间字符串 "HH:MM"
 */
function calculateSunset(lat, lng, date = new Date()) {
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000)
  
  // 基准日落时间（春分/秋分约18点）
  let baseHour = 18
  
  // 根据日期调整（夏季晚，冬季早）
  const seasonOffset = Math.sin((dayOfYear - 80) * 2 * Math.PI / 365) * 1.5
  baseHour += seasonOffset
  
  // 根据纬度调整
  const latOffset = (lat - 30) * 0.02
  baseHour += latOffset
  
  // 根据经度调整时区偏移
  const lngOffset = (lng - 120) / 15
  baseHour += lngOffset
  
  const hour = Math.floor(baseHour)
  const minute = Math.floor((baseHour - hour) * 60)
  
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * 🌙 判断当前是否是夜晚
 */
function isNightTime(sunrise, sunset, currentTime = new Date()) {
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()
  
  const [sunriseHour, sunriseMin] = sunrise.split(':').map(Number)
  const sunriseMinutes = sunriseHour * 60 + sunriseMin
  
  const [sunsetHour, sunsetMin] = sunset.split(':').map(Number)
  const sunsetMinutes = sunsetHour * 60 + sunsetMin
  
  return currentMinutes >= sunsetMinutes || currentMinutes < sunriseMinutes
}

exports.main = async (event, context) => {
  const { 
    date,
    lat = 39.9042,  // 默认北京
    lng = 116.4074  // 默认北京
  } = event

  try {
    const today = new Date(date || new Date())
    const currentMonth = today.getMonth() + 1
    const currentDay = today.getDate()

    // 🍂 查找最近的节气(前后3天内)
    let currentTerm = null
    let daysDiff = Infinity

    SOLAR_TERMS.forEach(term => {
      const [month, day] = term.date.split('-').map(Number)
      const termDate = new Date(today.getFullYear(), month - 1, day)
      const diff = Math.abs(today - termDate) / (1000 * 60 * 60 * 24)

      if (diff <= 3 && diff < daysDiff) {
        daysDiff = diff
        currentTerm = term
      }
    })

    // 🌅 计算日出日落时间
    const sunrise = calculateSunrise(lat, lng, today)
    const sunset = calculateSunset(lat, lng, today)
    const isNight = isNightTime(sunrise, sunset, today)

    // 📊 日志输出
    console.log('📍 位置:', { lat, lng })
    console.log('📅 日期:', today.toLocaleDateString('zh-CN'))
    console.log('🌅 日出:', sunrise)
    console.log('🌇 日落:', sunset)
    console.log('🌙 是否夜晚:', isNight)
    console.log('🍂 节气:', currentTerm?.name || '无')

    return {
      success: true,
      data: {
        // 节气信息（保留原有功能）
        solarTerm: currentTerm,
        daysDiff: Math.round(daysDiff),
        
        // 🆕 新增：日出日落信息
        sunrise,
        sunset,
        isNight,
        
        // 🆕 新增：分钟数（方便前端判断）
        sunriseMinutes: parseInt(sunrise.split(':')[0]) * 60 + parseInt(sunrise.split(':')[1]),
        sunsetMinutes: parseInt(sunset.split(':')[0]) * 60 + parseInt(sunset.split(':')[1]),
        currentMinutes: today.getHours() * 60 + today.getMinutes()
      }
    }
  } catch (error) {
    console.error('❌ 查询失败:', error)
    return {
      success: false,
      error: error.message,
      // 降级数据
      data: {
        sunrise: '06:00',
        sunset: '18:00',
        isNight: false,
        solarTerm: null
      }
    }
  }
}