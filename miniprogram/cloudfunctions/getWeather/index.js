const cloud = require('wx-server-sdk')
const https = require('https')
const http = require('http')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const RETRY_LIMIT = 3
const BASE_DELAY_MS = 200
const TIMEOUT_MS = 6000
const DEFAULT_CITY = '当前位置'
const DEFAULT_SUNRISE = '06:00'
const DEFAULT_SUNSET = '18:00'
const QWEATHER_LANG = 'zh-hans'

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function formatDate(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function buildLocationParam(loc = {}, city = '') {
  if (typeof loc.lng === 'number' && typeof loc.lat === 'number') {
    // QWeather 需要 "经度,纬度" 顺序
    const lng = Number(loc.lng).toFixed(4)
    const lat = Number(loc.lat).toFixed(4)
    return `${lng},${lat}`
  }
  if (city) return city
  return 'auto_ip'
}

function buildCityName(eventCity, loc = {}, refer = {}) {
  if (eventCity) return eventCity
  if (loc.name) return loc.name
  if (loc.city) return loc.city
  if (loc.district) return loc.district
  const referList = refer && refer.locations
  const referLoc = Array.isArray(referList) ? referList[0] : undefined
  if (referLoc && referLoc.name) return referLoc.name
  return DEFAULT_CITY
}

function buildSafeDefault(cityName, loc = {}) {
  const today = formatDate()
  // TODO: 可接入最近一次成功的天气结果作为兜底，当前返回静态模板避免白屏
  return {
    cityName: cityName || DEFAULT_CITY,
    weather: {
      text: '多云',
      temp: '--',
      icon: '104',
      code: '104'
    },
    daily: {
      max: '--',
      min: '--',
      fxDate: today,
      sunrise: DEFAULT_SUNRISE,
      sunset: DEFAULT_SUNSET
    },
    sunrise: DEFAULT_SUNRISE,
    sunset: DEFAULT_SUNSET,
    location: {
      lat: typeof loc.lat === 'number' ? loc.lat : undefined,
      lon: typeof loc.lng === 'number' ? loc.lng : undefined,
      city: cityName || DEFAULT_CITY
    },
    source: 'fallback'
  }
}

function fetchJsonWithTimeout(url, timeout = TIMEOUT_MS) {
  const target = new URL(url)
  const client = target.protocol === 'https:' ? https : http

  return new Promise((resolve, reject) => {
    const req = client.request(target, res => {
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { raw += chunk })
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = raw ? JSON.parse(raw) : {}
            resolve(parsed)
          } catch (err) {
            reject(new Error(`Invalid JSON response: ${err.message}`))
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 120)}`))
        }
      })
    })

    req.on('error', err => reject(err))
    req.setTimeout(timeout, () => {
      req.destroy(new Error('Request timeout'))
    })
    req.end()
  })
}

async function retryRequest(task, { label, logger, requestId, location }) {
  let attempt = 0
  let delay = BASE_DELAY_MS
  while (attempt < RETRY_LIMIT) {
    attempt += 1
    try {
      logger.info({ event: 'getWeather:attempt', label, attempt, location, requestId })
      const result = await task()
      logger.info({ event: 'getWeather:stage-success', label, attempt, location, requestId })
      return result
    } catch (err) {
      logger.warn({
        event: 'getWeather:stage-error',
        label,
        attempt,
        location,
        requestId,
        message: err.message
      })
      if (attempt >= RETRY_LIMIT) {
        throw err
      }
      await sleep(delay)
      delay *= 2
    }
  }
  throw new Error(`retry overflow for ${label}`)
}

exports.main = async (event = {}, context = {}) => {
  const logger = cloud.logger()
  const requestId = context.requestId || ''
  const { loc = {}, city = '' } = event

  const qweatherKey = process.env.QWEATHER_KEY || process.env.QWEATHER_TOKEN
  const locationParam = buildLocationParam(loc, city)
  const encodedLocation = encodeURIComponent(locationParam)

  logger.info({
    event: 'getWeather:start',
    requestId,
    location: locationParam
  })

  if (!qweatherKey) {
    logger.error({
      event: 'getWeather:error',
      requestId,
      location: locationParam,
      message: 'Missing QWeather key'
    })
    return {
      ...buildSafeDefault(buildCityName(city, loc), loc),
      fallback: true,
      reason: 'missing-key'
    }
  }

  try {
    const nowUrl = `https://devapi.qweather.com/v7/weather/now?location=${encodedLocation}&key=${qweatherKey}&lang=${QWEATHER_LANG}`
    const nowData = await retryRequest(
      () => fetchJsonWithTimeout(nowUrl),
      { label: 'weather-now', logger, requestId, location: locationParam }
    )

    const nowCode = nowData && nowData.code
    if (!nowData || nowCode !== '200') {
      throw new Error(`Unexpected now response code: ${nowCode || 'NA'}`)
    }

    const dailyUrl = `https://devapi.qweather.com/v7/weather/3d?location=${encodedLocation}&key=${qweatherKey}&lang=${QWEATHER_LANG}`
    const dailyData = await retryRequest(
      () => fetchJsonWithTimeout(dailyUrl),
      { label: 'weather-3d', logger, requestId, location: locationParam }
    )

    const dailyCode = dailyData && dailyData.code
    if (!dailyData || dailyCode !== '200') {
      throw new Error(`Unexpected daily response code: ${dailyCode || 'NA'}`)
    }

    const now = nowData.now || {}
    const daily = Array.isArray(dailyData.daily) ? dailyData.daily[0] || {} : dailyData.daily || {}
    const cityName = buildCityName(city, loc, dailyData.refer)

    logger.info({
      event: 'getWeather:success',
      requestId,
      location: locationParam,
      cityName
    })

    return {
      cityName,
      weather: {
        text: now.text || '多云',
        temp: now.temp ?? '--',
        icon: now.icon ?? now.code ?? '104',
        code: now.icon ?? now.code ?? '104'
      },
      daily: {
        max: daily.tempMax ?? daily.tempmax ?? '--',
        min: daily.tempMin ?? daily.tempmin ?? '--',
        fxDate: daily.fxDate,
        sunrise: daily.sunrise,
        sunset: daily.sunset
      },
      sunrise: daily.sunrise,
      sunset: daily.sunset,
      location: {
        lat: typeof loc.lat === 'number' ? Number(loc.lat) : undefined,
        lon: typeof loc.lng === 'number' ? Number(loc.lng) : undefined,
        city: cityName
      },
      source: 'qweather'
    }
  } catch (err) {
    logger.error({
      event: 'getWeather:failed',
      requestId,
      location: locationParam,
      message: err.message
    })
    return {
      ...buildSafeDefault(buildCityName(city, loc), loc),
      fallback: true,
      reason: 'request-failed'
    }
  }
}
