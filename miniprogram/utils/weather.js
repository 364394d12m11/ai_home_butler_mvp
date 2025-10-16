// miniprogram/utils/weather.js

// ====== 配置 ======
const CACHE_TTL = 30 * 60 * 1000;   // 30 分钟
const DIST_THRESHOLD_KM = 5;         // 距离<5km 允许复用缓存

// ====== 和风 code 映射（与首页保持完全一致）======
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

  // 🌀 自定义扩展
  1001: 'typhoon',      // 台风
  1002: 'tornado',      // 龙卷风
  1003: 'storm_rain',   // 暴雨（语义归入 rain）
  1004: 'blizzard',     // 暴雪（语义归入 snow）
  1015: 'hail'          // 冰雹
};

// —— 数字/文案 → 语义型（clear/rain/snow/...）
function mapToSemantic(codeRaw, textRaw = '') {
  const text = String(textRaw || '');
  const num = Number(codeRaw);
  // 1) 先按你维护的表来
  if (!Number.isNaN(num) && HEWEATHER_CODE_MAP[num]) return HEWEATHER_CODE_MAP[num];

  // 2) 文字兜底
  if (/台风/.test(text)) return 'typhoon';
  if (/龙卷风/.test(text)) return 'tornado';
  if (/冰雹/.test(text)) return 'hail';
  if (/冻雨/.test(text)) return 'freezing_rain';
  if (/雨夹雪|夹雪/.test(text)) return 'sleet';
  if (/雷/.test(text)) return 'thunderstorm';
  if (/雾|霾/.test(text)) return 'fog';
  if (/沙|尘/.test(text)) return 'sandstorm';
  if (/雪/.test(text)) return 'snow';
  if (/雨/.test(text)) return 'rain';
  if (/阴/.test(text)) return 'cloudy';
  if (/云/.test(text)) return 'cloudy';
  if (/晴/.test(text)) return 'clear';

  return 'default';
}

// ====== 对外：从经纬度获取天气 ======
export async function getWeatherByLoc(loc = {}) {
  try {
    const cacheKey = buildLocCacheKey(loc);
    const cache = wx.getStorageSync(cacheKey);

    // 1) 读缓存（坐标量化+距离阈值）
    if (cache && Date.now() - cache.ts < CACHE_TTL && cache.loc) {
      const dist = distance(cache.loc, loc);
      if (dist < DIST_THRESHOLD_KM) return cache.data;
    }

    // 2) 云函数（带超时）
    const data = await callWithTimeout(
      () => wx.cloud.callFunction({ name: 'getWeather', data: { loc } }),
      8000
    );
    const result = data?.result || {};
    const weather = normalizeWeather(result, loc);

    // 3) 写缓存（按位置分桶）
    wx.setStorageSync(cacheKey, { ts: Date.now(), loc, data: weather });
    return weather;
  } catch (e) {
    console.warn('getWeatherByLoc error', e);
    return fallbackWeather('未知', loc);
  }
}

// ====== 对外：按城市名获取天气（备用） ======
export async function getWeatherByCity(city = '北京') {
  try {
    const cacheKey = buildCityCacheKey(city);
    const cache = wx.getStorageSync(cacheKey);
    if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;

    const data = await callWithTimeout(
      () => wx.cloud.callFunction({ name: 'getWeather', data: { city } }),
      8000
    );
    const result = data?.result || {};
    const weather = normalizeWeather(result, { city });

    wx.setStorageSync(cacheKey, { ts: Date.now(), data: weather });
    return weather;
  } catch (e) {
    console.warn('getWeatherByCity error', e);
    return fallbackWeather(city, { city });
  }
}

// ====== 统一数据结构（兼容新/旧云函数） ======
function normalizeWeather(res = {}, loc = {}) {
  // --- 新格式：{ weather:{text,temp,code,icon}, sunrise, sunset, solar_term, ... }
  if (res.weather) {
    const w = res.weather || {};
    const iconNumeric = String(w.icon ?? w.code ?? ''); // 数字编号（供取图）
    const text = String(w.text || '');
    const semantic = mapToSemantic(iconNumeric, text);  // 语义型（供背景/逻辑）

    return {
      cityName: res.cityName || loc?.city || '北京',
      now: {
        text,
        temp: String(w.temp ?? ''),
        code: semantic,          // 统一：语义型
        icon: iconNumeric        // 统一：数字
      },
      daily: {
        max: res.daily?.max ?? '--',
        min: res.daily?.min ?? '--'
      },
      weather: {
        ...w,
        code: semantic,          // 再次覆盖到子结构里，避免外部误用数字
        icon: iconNumeric
      },
      sunrise: res.sunrise,
      sunset: res.sunset,
      solar_term: res.solar_term
    };
  }

  // --- 旧格式兼容
  const now = res.now || res.current || {};
  const daily = res.daily || (Array.isArray(res.forecast) ? res.forecast[0] : {}) || {};
  const iconNumeric = String(now.icon ?? now.code ?? 104);
  const text = String(now.text || now.phenomenon || '--');
  const semantic = mapToSemantic(iconNumeric, text);

  // 优先使用区县名称（特殊处理直辖市）
  let cityDisplay = '';
  const district = res.location?.name || loc?.district || '';
  const city = res.location?.adm2 || res.cityName || loc?.city || '';
  const province = res.location?.adm1 || '';
  
  // 直辖市特殊处理：北京市、上海市、天津市、重庆市
  const DIRECT_CITIES = ['北京市', '上海市', '天津市', '重庆市'];
  const isDirectCity = DIRECT_CITIES.includes(city) || DIRECT_CITIES.includes(province);
  
  if (isDirectCity && district && city) {
    // 直辖市格式：北京市朝阳区（无分隔符）
    cityDisplay = `${city}${district}`;
  } else if (district && city && district !== city) {
    // 普通城市格式：广州市·天河区
    cityDisplay = `${city}·${district}`;
  } else {
    cityDisplay = city || district || '北京';
  }

  return {
    cityName: cityDisplay,
    now: {
      text,
      temp: String(now.temp ?? now.temperature ?? '--'),
      code: semantic,
      icon: iconNumeric
    },
    daily: {
      max: String(daily.max ?? daily.high ?? '--'),
      min: String(daily.min ?? daily.low ?? '--')
    },
    sunrise: res.sunrise,
    sunset: res.sunset,
    solar_term: res.solar_term
  };
}

// ====== 工具：构造缓存 key（位置分桶） ======
function buildLocCacheKey(loc = {}) {
  if (typeof loc.lat === 'number' && typeof loc.lng === 'number') {
    // 量化两位小数（~1.1km），形成稳定桶
    const latQ = loc.lat.toFixed(2);
    const lngQ = loc.lng.toFixed(2);
    return `WEATHER_CACHE_LOC_${latQ}_${lngQ}`;
  }
  return 'WEATHER_CACHE_LOC_FALLBACK';
}

function buildCityCacheKey(city = '北京') {
  return `WEATHER_CACHE_CITY_${String(city)}`;
}

// ====== 工具：兜底结构 ======
function fallbackWeather(cityName = '未知', loc = {}) {
  return {
    cityName,
    now: { text: '多云', temp: '--', code: 'cloudy', icon: '104' },
    daily: { max: '--', min: '--' },
    sunrise: undefined,
    sunset: undefined,
    solar_term: undefined,
    _loc: loc
  };
}

// ====== 工具：超时包装 ======
function callWithTimeout(fn, ms = 8000) {
  return Promise.race([
    fn(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
  ]);
}

// ====== 工具：两个坐标距离（km） ======
function distance(a = {}, b = {}) {
  try {
    if (!a.lat || !b.lat) return Infinity;
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const la1 = (a.lat * Math.PI) / 180;
    const la2 = (b.lat * Math.PI) / 180;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  } catch {
    return Infinity;
  }
}

/**
 * V5.3 新增：计算真实日落时间
 * @param {Number} latitude - 纬度
 * @param {Date} date - 日期
 * @returns {Object} { sunriseHour, sunsetHour }
 */
function calculateRealSunTimes(latitude = 39.9, date = new Date()) {
  // 简化算法：基于月份和纬度估算
  const month = date.getMonth() + 1
  
  // 北半球日落时间表（北京纬度 39.9）
  const sunsetTable = {
    1: 17.3,  // 1月 17:18
    2: 17.8,  // 2月 17:48
    3: 18.4,  // 3月 18:24
    4: 19.1,  // 4月 19:06
    5: 19.6,  // 5月 19:36
    6: 20.0,  // 6月 20:00
    7: 19.8,  // 7月 19:48
    8: 19.2,  // 8月 19:12
    9: 18.4,  // 9月 18:24
    10: 17.6, // 10月 17:36
    11: 17.0, // 11月 17:00
    12: 16.8  // 12月 16:48
  }
  
  const sunriseTable = {
    1: 7.5, 2: 7.2, 3: 6.5, 4: 5.8,
    5: 5.2, 6: 4.8, 7: 5.0, 8: 5.5,
    9: 6.2, 10: 6.8, 11: 7.3, 12: 7.6
  }
  
  let sunsetHour = sunsetTable[month] || 18.5
  let sunriseHour = sunriseTable[month] || 6.5
  
  // 纬度修正（每5度约15分钟差异）
  const latOffset = (latitude - 39.9) / 5 * 0.25
  sunsetHour += latOffset
  sunriseHour -= latOffset
  
  return {
    sunriseHour: Math.max(4.5, Math.min(8.5, sunriseHour)),
    sunsetHour: Math.max(16.0, Math.min(21.0, sunsetHour))
  }
}

/**
 * V5.3 新增：获取当前时段（基于真实日落）
 * @param {Number} latitude - 纬度
 * @returns {String} morning/noon/afternoon/evening/night
 */
function getCurrentPeriodBySunset(latitude = 39.9) {
  const now = new Date()
  const hour = now.getHours()
  const minute = now.getMinutes()
  const currentTime = hour + minute / 60
  
  const { sunriseHour, sunsetHour } = calculateRealSunTimes(latitude, now)
  
  if (currentTime >= sunriseHour && currentTime < 11) return 'morning'
  if (currentTime >= 11 && currentTime < 14) return 'noon'
  if (currentTime >= 14 && currentTime < sunsetHour) return 'afternoon'
  if (currentTime >= sunsetHour && currentTime < 22) return 'evening'
  return 'night'
}

/**
 * V5.3 新增：修复天气状态互斥（雾天不能同时有雨）
 * @param {Object} rawWeather - 原始天气数据
 * @returns {Object} 修正后的天气数据
 */
function fixWeatherStateMutex(rawWeather) {
  const weather = { ...rawWeather }
  const code = weather.code || ''
  const text = weather.text || ''
  
  // 优先级：台风 > 暴雨雪 > 雨雪 > 雾霾 > 风 > 阴晴
  
  // 1. 台风天
  if (/typhoon|台风/.test(code) || /台风/.test(text)) {
    return {
      ...weather,
      primary: 'typhoon',
      code: 'typhoon',
      // 移除其他天气状态
      fog: false,
      rain: false,
      snow: false
    }
  }
  
  // 2. 雨雪天（互斥雾霾）
  if (/rain|雨/.test(code) || /雨/.test(text)) {
    return {
      ...weather,
      primary: 'rain',
      rain: true,
      // 雨天时移除雾
      fog: false,
      haze: false
    }
  }
  
  if (/snow|雪/.test(code) || /雪/.test(text)) {
    return {
      ...weather,
      primary: 'snow',
      snow: true,
      // 雪天时移除雾
      fog: false,
      haze: false
    }
  }
  
  // 3. 雾霾天（不能有雨雪）
  if (/fog|haze|雾|霾/.test(code) || /雾|霾/.test(text)) {
    return {
      ...weather,
      primary: 'fog',
      fog: true,
      // 雾天时移除雨雪
      rain: false,
      snow: false
    }
  }
  
  // 4. 其他天气保持原样
  return {
    ...weather,
    primary: weather.code || 'clear'
  }
}

/**
 * V5.3 新增：调整夜间动画亮度
 * @param {String} weatherType - 天气类型
 * @param {String} period - 时段
 * @returns {Object} 动画配置 { brightness, opacity }
 */
function getAnimationConfig(weatherType, period) {
  const isNight = period === 'night' || period === 'evening'
  
  const configs = {
    rain: {
      day: { brightness: 1.0, opacity: 0.8 },
      night: { brightness: 0.7, opacity: 0.65 }  // 降低亮度和透明度
    },
    snow: {
      day: { brightness: 1.0, opacity: 0.9 },
      night: { brightness: 0.65, opacity: 0.7 }
    },
    hail: {
      day: { brightness: 1.0, opacity: 0.85 },
      night: { brightness: 0.7, opacity: 0.7 }
    },
    default: {
      day: { brightness: 1.0, opacity: 1.0 },
      night: { brightness: 0.8, opacity: 0.85 }
    }
  }
  
  const config = configs[weatherType] || configs.default
  return isNight ? config.night : config.day
}

// ==========================================
// 修改 module.exports，添加新函数
// ==========================================

module.exports = {
  getWeatherByLoc,
  getWeatherByCity,
  // V5.3 新增
  calculateRealSunTimes,
  getCurrentPeriodBySunset,
  fixWeatherStateMutex,
  getAnimationConfig
}