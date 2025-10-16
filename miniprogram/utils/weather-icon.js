// miniprogram/utils/weather-icon.js
// 和风天气 SVG 图标加载工具（远程+本地兜底）

const REMOTE_BASE = 'https://cdn.jsdelivr.net/npm/qweather-icons@1.8.0/icons/'
const LOCAL_BASE = '/assets/icons/'

// 图标代码映射（和风 code → SVG 文件名）
const ICON_MAP = {
  // 极端天气
  sandstorm: '508',
  typhoon: '901',
  blizzard: '401',
  hail: '304',
  severe_thunder: '302',
  gale: '2075',
  heatwave: '100',
  coldwave: '401',
  dense_fog: '501',
  haze: '502',
  
  // 常规天气
  rain: '306',
  snow: '400',
  cloudy: '104',
  sunny: '100',
  thunderstorm: '302',
  fog: '500',
  windy: '2001',
  
  // 特殊
  sleet: '404',
  freezing_rain: '313',
  tornado: '999',
  clear: '100',
  night: '150',
  dawn: '100',
  dusk: '150'
}

/**
 * 获取天气图标 URL（优先远程，失败降级到本地）
 * @param {string|number} code - 和风天气代码或自定义 key
 * @returns {string} SVG 图标 URL
 */
export function getWeatherIconUrl(code) {
  // 1. 如果传入的是自定义 key（如 'rain'），先映射成和风 code
  const iconCode = ICON_MAP[code] || code
  
  // 2. 优先返回远程 URL
  const remoteUrl = `${REMOTE_BASE}${iconCode}.svg`
  
  // 3. 返回对象，包含远程和本地路径
  return {
    remote: remoteUrl,
    local: `${LOCAL_BASE}${iconCode}.svg`
  }
}

/**
 * 直接返回远程 URL（用于 image 组件的 src）
 * @param {string|number} code 
 * @returns {string}
 */
export function getRemoteIconUrl(code) {
  const iconCode = ICON_MAP[code] || code
  return `${REMOTE_BASE}${iconCode}.svg`
}

/**
 * 直接返回本地 URL
 * @param {string|number} code 
 * @returns {string}
 */
export function getLocalIconUrl(code) {
  const iconCode = ICON_MAP[code] || code
  return `${LOCAL_BASE}${iconCode}.svg`
}