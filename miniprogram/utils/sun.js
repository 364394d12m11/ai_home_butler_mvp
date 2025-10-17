// utils/sun.js - 修复版（避免对只读标识符赋值 + 更稳健的边界处理）

function toRadians(deg) { return (Math.PI / 180) * deg }
function toDegrees(rad) { return (180 / Math.PI) * rad }

// 归一化到 [0,360)
function norm360(x) {
  let v = x % 360
  if (v < 0) v += 360
  return v
}

/**
 * NOAA 日出/日落计算（本地时区默认按 UTC+8，可自行改成设备时区）
 * @param {number} lat  纬度
 * @param {number} lon  经度（东经为正，西经为负）
 * @param {Date}   date 日期（本地日期）
 * @param {'sunrise'|'sunset'} type
 * @returns {Date|null} 本地时间；极昼/极夜时返回 null
 */
function calcSunTimeByNOAA(lat, lon, date = new Date(), type = 'sunset') {
  const zenith = 90.833 // 标准天文日出日落角度
  const isRise = type === 'sunrise'

  // 年内第几天（以 Jan 1 为第 1 天）
  const start = new Date(date.getFullYear(), 0, 1)
  const n = Math.floor((date - start) / 86400000) + 1

  // 经度对应的小时偏移
  const lngHour = lon / 15

  // 近似时间
  const t = n + ((isRise ? 6 : 18) - lngHour) / 24

  // 太阳平近点角（M）
  const M = 0.9856 * t - 3.289

  // 太阳真黄经（L）
  let L = M + 1.916 * Math.sin(toRadians(M)) + 0.020 * Math.sin(toRadians(2 * M)) + 282.634
  L = norm360(L)

  // 赤经（ra），注意不要用只读标识符，且需要象限修正
  let ra = toDegrees(Math.atan(0.91764 * Math.tan(toRadians(L))))
  ra = norm360(ra)

  const LQuadrant = Math.floor(L / 90) * 90
  const raQuadrant = Math.floor(ra / 90) * 90
  ra = ra + (LQuadrant - raQuadrant) // 修正到与 L 同象限
  ra = ra / 15 // 转小时

  // 太阳赤纬
  const sinDec = 0.39782 * Math.sin(toRadians(L))
  const cosDec = Math.cos(Math.asin(sinDec))

  // 余弦时角（浮点误差夹逼到 [-1,1]）
  let cosH = (Math.cos(toRadians(zenith)) - sinDec * Math.sin(toRadians(lat))) /
             (cosDec * Math.cos(toRadians(lat)))
  if (Number.isNaN(cosH)) return null
  cosH = Math.max(-1, Math.min(1, cosH))

  // 极夜/极昼判断
  if (cosH > 1) return null // 极夜：太阳永不升
  if (cosH < -1) return null // 极昼：太阳永不落

  // 时角（H，单位：小时）
  let H = isRise ? 360 - toDegrees(Math.acos(cosH)) : toDegrees(Math.acos(cosH))
  H = H / 15

  // 地方平太阳时（T）
  const T = H + ra - 0.06571 * t - 6.622

  // 转 UTC（UT）
  let UT = T - lngHour
  UT = ((UT % 24) + 24) % 24

  // 转当地时间 —— 如果你希望用设备时区，改成：
  // const tzOffset = -date.getTimezoneOffset() / 60;
  // 这里按你项目之前逻辑，用固定 UTC+8
  const tzOffset = 8
  let localTime = UT + tzOffset
  localTime = ((localTime % 24) + 24) % 24

  const hours = Math.floor(localTime)
  const minutes = Math.floor((localTime - hours) * 60)
  const seconds = Math.floor(((localTime - hours) * 60 - minutes) * 60)

  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, seconds)
}

/**
 * 综合获取本地日出日落时间：
 * 1) 优先用和风逐日返回的 sunrise/sunset
 * 2) 失败则用 NOAA 算法
 * 3) 最终兜底 06:00/18:00
 */
function getLocalSunTimes({ lat, lon, qwDaily, now = new Date() }) {
  // A. 和风逐日
  if (qwDaily && qwDaily.fxDate && qwDaily.sunrise && qwDaily.sunset) {
    try {
      const dateStr = qwDaily.fxDate.replace(/-/g, '/')
      const sr = new Date(`${dateStr} ${qwDaily.sunrise}`)
      const ss = new Date(`${dateStr} ${qwDaily.sunset}`)
      if (!isNaN(sr.getTime()) && !isNaN(ss.getTime())) {
        return { sunrise: sr, sunset: ss, source: 'qweather-daily' }
      }
    } catch (e) {
      console.warn('和风日出日落解析失败:', e)
    }
  }

  // B. NOAA 兜底
  try {
    const sunrise = calcSunTimeByNOAA(lat, lon, now, 'sunrise')
    const sunset = calcSunTimeByNOAA(lat, lon, now, 'sunset')
    return { sunrise, sunset, source: 'noaa-local' }
  } catch (e) {
    console.warn('NOAA 算法失败:', e)
  }

  // C. 最终兜底：简单估算（06:00 / 18:00）
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return {
    sunrise: new Date(today.getTime() + 6 * 3600 * 1000),
    sunset: new Date(today.getTime() + 18 * 3600 * 1000),
    source: 'fallback-estimate'
  }
}

/**
 * 根据日出日落判断是否夜间
 */
function isNightBySunTimes(sunrise, sunset, now = new Date()) {
  const valid = d => d instanceof Date && !isNaN(d.getTime())
  if (!valid(sunrise) || !valid(sunset)) {
    const hour = now.getHours()
    return hour < 6 || hour >= 18
  }
  return now < sunrise || now >= sunset
}

module.exports = {
  calcSunTimeByNOAA,
  getLocalSunTimes,
  isNightBySunTimes
}
