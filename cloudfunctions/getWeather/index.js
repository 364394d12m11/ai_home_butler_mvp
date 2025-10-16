// 二十四节气数据（2025年）
const SOLAR_TERMS_2025 = {
  '立春': '02-03', '雨水': '02-18', '惊蛰': '03-05', '春分': '03-20',
  '清明': '04-04', '谷雨': '04-19', '立夏': '05-05', '小满': '05-20',
  '芒种': '06-05', '夏至': '06-21', '小暑': '07-06', '大暑': '07-22',
  '立秋': '08-07', '处暑': '08-22', '白露': '09-07', '秋分': '09-22',
  '寒露': '10-08', '霜降': '10-23', '立冬': '11-07', '小雪': '11-22',
  '大雪': '12-06', '冬至': '12-21', '小寒': '01-05', '大寒': '01-20'
}

function getCurrentSolarTerm() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  
  for (const [name, date] of Object.entries(SOLAR_TERMS_2025)) {
    const [m, d] = date.split('-').map(Number)
    const termDate = new Date(now.getFullYear(), m - 1, d)
    const diff = Math.abs(now - termDate) / (1000 * 60 * 60 * 24)
    
    if (diff <= 3) return name
  }
  
  return ''
}

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const axios = require('axios')

//获取真实日落时间和夜晚判断
async function getSolarInfo(lat, lng) {
 try {
   const result = await cloud.callFunction({
     name: 'solarTermInfo',
     data: { lat, lng, date: new Date().toISOString() }
   })
   
   if (result.result.success) {
     console.log('🌅 日落信息:', result.result.data)
     return result.result.data
   }
 } catch (error) {
   console.error('❌ 获取日落失败:', error)
 }
 
 // 降级：返回默认值
 return {
   sunrise: '06:00',
   sunset: '18:00',
   isNight: false,
   solarTerm: null
 }
}

// 和风天气代码 → 标准化代码（与首页保持完全一致）
const HEWEATHER_CODE_MAP = {
  // ☀️ 晴/多云
  100: 'clear', 150: 'clear',
  101: 'cloudy', 102: 'cloudy', 103: 'cloudy', 104: 'cloudy',

  // 🌬️ 风（新版 2001+）
  2001: 'windy', 2002: 'windy', 2003: 'windy', 2004: 'windy',
  2005: 'windy', 2006: 'windy', 2007: 'windy', 2008: 'windy',
  2009: 'windy', 2010: 'windy', 2011: 'windy', 2012: 'windy',
  2075: 'gale', 2076: 'gale',

  // 🌧️ 降雨 & 雷雨
  300: 'rain', 301: 'rain',
  302: 'thunderstorm', 303: 'thunderstorm',
  305: 'rain', 306: 'rain', 307: 'rain', 308: 'rain', 309: 'rain',
  310: 'rain', 311: 'rain', 312: 'rain',
  313: 'freezing_rain',
  314: 'rain', 315: 'rain', 316: 'rain', 317: 'rain', 318: 'rain', 399: 'rain',

  // ❄️ 降雪 & 夹雪
  400: 'snow', 401: 'snow', 402: 'snow', 403: 'snow',
  404: 'sleet', 405: 'sleet', 406: 'sleet',
  407: 'snow', 408: 'snow', 409: 'snow', 410: 'snow', 499: 'snow',

  // 🌫️ 能见度
  500: 'fog', 501: 'fog', 502: 'fog',
  503: 'sandstorm', 504: 'sandstorm', 507: 'sandstorm', 508: 'sandstorm',
  509: 'fog', 510: 'fog', 511: 'fog', 512: 'fog', 513: 'fog', 514: 'fog', 515: 'fog',

  // 🌀 自定义扩展（与首页保持一致）
  1001: 'typhoon',      // 台风
  1002: 'tornado',      // 龙卷风
  1003: 'storm_rain',   // 暴雨（语义归入 rain）
  1004: 'blizzard',     // 暴雪（语义归入 snow）
  1015: 'hail'          // 冰雹
}

// 根据阈值判断极端天气
function detectExtremeWeather(data) {
  const temp = Number(data.temp) || 20
  const windScale = Number(data.windScale) || 0
  const vis = Number(data.vis) || 10000
  const precip = Number(data.precip) || 0
  
  if (temp >= 35) return 'heatwave'
  if (temp <= -10) return 'coldwave'
  if (windScale >= 7) return 'gale'
  if (vis < 200) return 'dense_fog'
  if (vis < 1000 && data.text?.includes('沙尘')) return 'sandstorm'
  
  return null
}

exports.main = async (event) => {
  console.log('📍 收到请求:', JSON.stringify(event))
  
  const key = process.env.QWEATHER_KEY || ''
  const lat = Number(event?.loc?.lat ?? 39.9042)
  const lng = Number(event?.loc?.lng ?? 116.4074)
  
  console.log('🔑 Key:', key ? '已配置' : '未配置')
  console.log('📍 坐标:', lat, lng)
    // 🆕 添加这一行
    const solarInfo = await getSolarInfo(lat, lng)
  
  // ===== 优先：和风天气 =====
  if (key) {
    try {
      const loc = `${lng},${lat}`
      const base = 'https://n478kydk2u.re.qweatherapi.com/'  // 开发版
      
      const [nowRes, dailyRes] = await Promise.all([
        axios.get(`${base}/v7/weather/now`, { params: { key, location: loc } }),
        axios.get(`${base}/v7/weather/3d`, { params: { key, location: loc } })
      ])
      
      const now = nowRes.data.now
      const daily = dailyRes.data.daily[0]

      // 反向地理（区、市、省）
      const geoRes = await axios.get(`${base}/v2/city/lookup`, { params: { key, location: loc } })
      const geoInfo = geoRes.data.location?.[0] || {}
      
      console.log('🌤️ 和风天气原始数据:', JSON.stringify(now))
      console.log('🌤️ 和风天气daily数据:', JSON.stringify(daily))
      
      // 映射天气代码
      let code = HEWEATHER_CODE_MAP[Number(now.icon)] || 'cloudy'
      
      // 极端天气检测
      const extreme = detectExtremeWeather({
        temp: now.temp,
        windScale: now.windScale,
        vis: now.vis,
        precip: now.precip1h,
        text: now.text
      })
      
      if (extreme) code = extreme
      
      const result = {
        location: {
          name: geoInfo.name || '',     // 区名，例如 "朝阳区"
          adm2: geoInfo.adm2 || '',     // 市，例如 "北京市"
          adm1: geoInfo.adm1 || ''      // 省，例如 "北京市"
        },
        weather: {  // 改为 weather 字段，与前端保持一致
          code: code,
          text: now.text,
          temp: Number(now.temp),
          wind_scale: Number(now.windScale) || 0,
          precip_mm: Number(now.precip1h) || 0,
          uv_index: Number(now.uvIndex) || 0,
          icon: Number(now.icon)
        },
        daily: {
          max: String(daily.tempMax || daily.maxTemp || daily.temp_max || daily.high || daily.max || '--'),
          min: String(daily.tempMin || daily.minTemp || daily.temp_min || daily.low || daily.min || '--')
        },
        sunrise: solarInfo.sunrise,
        sunset: solarInfo.sunset,
        isNight: solarInfo.isNight,
        solar_term: solarInfo.solarTerm?.name || getCurrentSolarTerm()
      }
      
      console.log('✅ 和风天气返回:', JSON.stringify(result))
      return result
      
    } catch (e) {
      console.error('❌ 和风天气失败:', e.message)
    }
  }
  
  // ===== 兜底1：腾讯天气 =====
  try {
    const txRes = await axios.get('https://wis.qq.com/weather/common', {
      params: {
        source: 'xw',
        weather_type: 'observe|forecast_24h',
        province: '北京市',
        city: '北京市',
        county: '朝阳区'
      }
    })
    
    const observe = txRes.data.data.observe
    
    console.log('🌤️ 腾讯天气返回:', JSON.stringify(observe))
    
    let code = 'cloudy'
    const weather = observe.weather
    if (weather.includes('晴')) code = 'clear'
    else if (weather.includes('云')) code = 'cloudy'
    else if (weather.includes('雨') && !weather.includes('雷')) code = 'rain'
    else if (weather.includes('雷')) code = 'thunderstorm'
    else if (weather.includes('雪')) code = 'snow'
    else if (weather.includes('雾') || weather.includes('霾')) code = 'fog'
    
    const forecast = txRes.data.data.forecast_24h
    const currentTemp = Number(observe.degree)
    
    // 优先使用预报数据，否则用当前温度估算
    let maxTemp = '--'
    let minTemp = '--'
    
    if (forecast?.max_degree) {
      maxTemp = String(forecast.max_degree)
      minTemp = String(forecast.min_degree)
    } else if (!isNaN(currentTemp)) {
      maxTemp = String(currentTemp + 5)
      minTemp = String(currentTemp - 5)
    }
    
    const result = {
      weather: {
        code: code,
        text: observe.weather,
        temp: Number(observe.degree),
        wind_scale: Number(observe.wind_power) || 0,
        precip_mm: 0,
        uv_index: 0,
        icon: 0
      },
      daily: {
        max: maxTemp,
        min: minTemp
      },
      sunrise: solarInfo.sunrise,
      sunset: solarInfo.sunset,
      isNight: solarInfo.isNight,
      solar_term: solarInfo.solarTerm?.name || getCurrentSolarTerm()
    }
    
    console.log('✅ 腾讯天气返回:', JSON.stringify(result))
    return result
    
  } catch (txErr) {
    console.error('❌ 腾讯天气失败:', txErr.message)
  }
  
  // ===== 兜底2：Open-Meteo =====
  try {
    const r = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: { 
        latitude: lat, 
        longitude: lng, 
        current_weather: true, 
        daily: 'temperature_2m_max,temperature_2m_min', 
        timezone: 'auto' 
      }
    })
    
    const cw = r.data.current_weather
    
    console.log('🌤️ Open-Meteo返回:', JSON.stringify(cw))
    
    let code = 'cloudy'
    if (cw.weathercode === 0) code = 'clear'
    else if ([1,2,3].includes(cw.weathercode)) code = 'cloudy'
    else if ([45,48].includes(cw.weathercode)) code = 'fog'
    else if ([51,53,55,61,63,65,80,81,82].includes(cw.weathercode)) code = 'rain'
    else if ([71,73,75,77,85,86].includes(cw.weathercode)) code = 'snow'
    else if ([95,96,99].includes(cw.weathercode)) code = 'thunderstorm'
    
    const dailyData = r.data.daily || {}
    const result = {
      weather: {
        code: code,
        text: code === 'clear' ? '晴' : code === 'rain' ? '雨' : code === 'cloudy' ? '多云' : '阴',
        temp: Number(cw.temperature),
        wind_scale: Math.round(cw.windspeed / 5),
        precip_mm: 0,
        uv_index: 0,
        icon: cw.weathercode
      },
      daily: {
        max: dailyData.temperature_2m_max?.[0] || '--',
        min: dailyData.temperature_2m_min?.[0] || '--'
      },
      sunrise: solarInfo.sunrise,
      sunset: solarInfo.sunset,
      isNight: solarInfo.isNight,
      solar_term: solarInfo.solarTerm?.name || getCurrentSolarTerm()
    }
    
    console.log('✅ Open-Meteo返回:', JSON.stringify(result))
    return result
    
  } catch (omErr) {
    console.error('❌ Open-Meteo失败:', omErr.message)
    
    // 最终兜底：返回默认数据
    return {
      weather: {
        code: 'cloudy',
        text: '多云',
        temp: 20,
        wind_scale: 0,
        precip_mm: 0,
        uv_index: 0,
        icon: 104
      },
      daily: {
        max: '25',
        min: '15'
      },
      sunrise: solarInfo.sunrise,
      sunset: solarInfo.sunset,
      isNight: solarInfo.isNight,
      solar_term: ''
    }
  }
}