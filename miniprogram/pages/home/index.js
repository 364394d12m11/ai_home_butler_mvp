const { envId, tmpls, cityFallback = { name: '北京' } } = require('../../config/index')
const db = wx.cloud.database({ env: envId })
const { normalizeWeatherTheme } = require('../../utils/weather-theme')
const { getRemoteIconUrl } = require('../../utils/weather-icon')
const { formatDateYMD, weekdayCN, getCurrentHour, ganzhiOfYear } = require('../../utils/datetime')
const { getLunarInfo } = require('../../utils/lunar')
const { getWeatherByLoc, getWeatherByCity } = require('../../utils/weather')
const { collectDailyData } = require('../../utils/reflection_v4')
const { generateFamilyTone, explainMeal } = require('../../utils/perception_v4')
const { buildDailyTips } = require('../../utils/suggest')
const { isInRange } = require('../../utils/holiday')
const { KEY, get, set, applyOverride, getActiveOverrides, getUserProfileV3 } = require('../../utils/storage')
const { EVENTS, track } = require('../../utils/analytics')
const { getLocalSunTimes, isNightBySunTimes } = require('../../utils/sun')
const { decideTheme } = require('../../utils/weather-theme')
// ✅ V5.2新增：引入AI文案引擎
const { generateDishReason, TONE } = require('../../utils/diet-ai-writer')

// 在 require 部分之后，SOLAR_TERMS 之前添加
function normalizeWeather(raw = {}, extraLoc = {}) {
  const srcNow = raw.now || raw.weather || {};
  const now = {
    text: String(srcNow.text || ''),
    temp: String(srcNow.temp ?? ''),
    code: String(srcNow.code ?? ''),
    icon: String(srcNow.icon ?? '')
  };
  const daily0 = (raw.daily && raw.daily[0]) || raw.daily || { max: '--', min: '--' };
  
  const lat = Number(extraLoc?.lat || raw.location?.lat || raw.lat || 39.9042);
  const lon = Number(extraLoc?.lng || raw.location?.lon || raw.lon || 116.4074);

  const { sunrise, sunset, source } = getLocalSunTimes({ lat, lon, qwDaily: daily0, now: new Date() });
  const currentTime = new Date();
  const isNight = isNightBySunTimes(sunrise, sunset, currentTime);
  
  let finalIsNight = isNight;
  if (!sunrise || !sunset || isNaN(sunrise.getTime()) || isNaN(sunset.getTime())) {
    const hour = currentTime.getHours();
    finalIsNight = hour < 6 || hour >= 18;
  }

  const code = now.icon || now.code || 100;
  const { base, precip } = decideTheme({ code, isNight: finalIsNight });
  
  // ✅ 终极修复：检查天气文本
  const weatherText = now.text || '';
  const isFog = weatherText.includes('雾') || weatherText.includes('霾') || base === 'fog';
  const hasActualRain = weatherText.includes('雨') || weatherText.includes('雪') || weatherText.includes('雹');
  
  let finalBase = base;
  let finalPrecip = precip;
  
  if (isFog) {
    if (hasActualRain) {
      // 雾+雨：显示降水
      finalBase = 'rain';
      finalPrecip = precip;
    } else {
      // 纯雾：无降水
      finalBase = 'fog';
      finalPrecip = 'none';
    }
  }
  
  const location = {
    province: raw?.location?.province || '',
    city: raw?.location?.city || '',
    district: raw?.location?.district || '',
    lat: extraLoc?.lat,
    lng: extraLoc?.lng
  };
  
  return { 
    now, 
    daily: daily0, 
    location,
    isNight: finalIsNight,
    sun: { sunrise, sunset, source },
    theme: { base: finalBase, precip: finalPrecip }
  };
}

// V3.0 节气数据
const SOLAR_TERMS = [
  { name: '立春', date: '02-04', emoji: '🌱', greeting: '春暖花开的时候又到了' },
  { name: '雨水', date: '02-19', emoji: '🌧️', greeting: '春雨润物，万物复苏' },
  { name: '惊蛰', date: '03-05', emoji: '⚡', greeting: '春雷乍响，万物生长' },
  { name: '春分', date: '03-20', emoji: '🌸', greeting: '春暖花开，昼夜平分' },
  { name: '清明', date: '04-04', emoji: '🌿', greeting: '清明时节，踏青正好' },
  { name: '谷雨', date: '04-20', emoji: '🌾', greeting: '春雨贵如油，谷物正生长' },
  { name: '立夏', date: '05-05', emoji: '☀️', greeting: '夏天来了，注意防暑' },
  { name: '小满', date: '05-21', emoji: '🌱', greeting: '小满时节，作物渐丰' },
  { name: '芒种', date: '06-05', emoji: '🌾', greeting: '芒种时节，收获在望' },
  { name: '夏至', date: '06-21', emoji: '🔆', greeting: '夏至已至，白昼最长' },
  { name: '小暑', date: '07-07', emoji: '🌡️', greeting: '小暑时节，注意清热' },
  { name: '大暑', date: '07-23', emoji: '🔥', greeting: '大暑天气，多喝水降温' },
  { name: '立秋', date: '08-07', emoji: '🍂', greeting: '立秋了，秋高气爽' },
  { name: '处暑', date: '08-23', emoji: '🌾', greeting: '处暑时节，暑气渐消' },
  { name: '白露', date: '09-07', emoji: '💧', greeting: '白露时节，昼夜温差大' },
  { name: '秋分', date: '09-23', emoji: '🍁', greeting: '秋分到了，收获的季节' },
  { name: '寒露', date: '10-08', emoji: '🌨️', greeting: '寒露时节，注意保暖' },
  { name: '霜降', date: '10-23', emoji: '❄️', greeting: '霜降了，天气转凉' },
  { name: '立冬', date: '11-07', emoji: '🧥', greeting: '立冬了，准备过冬' },
  { name: '小雪', date: '11-22', emoji: '🌨️', greeting: '小雪时节，温差加大' },
  { name: '大雪', date: '12-07', emoji: '☃️', greeting: '大雪纷飞，注意保暖' },
  { name: '冬至', date: '12-22', emoji: '🥟', greeting: '冬至到了，记得吃饺子' },
  { name: '小寒', date: '01-05', emoji: '🧊', greeting: '小寒时节，天气最冷' },
  { name: '大寒', date: '01-20', emoji: '🌨️', greeting: '大寒将至，春天不远了' }
]

// 基于和风天气的完整主题映射
const WEATHER_THEMES = {
  'clear': {
    bg: 'linear-gradient(180deg, #4A90E2 0%, #7CB9E8 50%, #B0D9F1 100%)',
    iconCode: '100',
    tone: '轻快',
    type: 'clear',
    showSun: true
  },
  'cloudy': {
    bg: 'linear-gradient(180deg, #8FA5B8 0%, #B8C5D6 50%, #D4DBE3 100%)',
    iconCode: '104',
    tone: '平和',
    type: 'cloudy',
    showSun: true,
    sunOpacity: 0.4,
    cloudOpacity: 0.6
  },
  'rain': {
    bg: 'linear-gradient(180deg, #6B7C8C 0%, #8A9BAB 50%, #B5C3D1 100%)',
    iconCode: '306',
    tone: '温柔',
    type: 'rain',
    cloudOpacity: 0.8
  },
  'thunderstorm': {
    bg: 'linear-gradient(180deg, #4A5568 0%, #667A8E 50%, #8896A8 100%)',
    iconCode: '302',
    tone: '沉稳',
    type: 'thunderstorm',
    cloudOpacity: 1.0
  },
  'snow': {
    bg: 'linear-gradient(180deg, #D8E3F0 0%, #E8F0F8 50%, #F5F8FB 100%)',
    iconCode: '400',
    tone: '宁静',
    type: 'snow',
    cloudOpacity: 0.5,
    textColor: '#1F2A37',
    titleShadow: '0 1px 2px rgba(0,0,0,.25)'
  },
  'fog': {
    bg: 'linear-gradient(180deg, #9BA5B0 0%, #B8C0CA 50%, #D1D6DC 100%)',
    iconCode: '500',
    tone: '朦胧',
    type: 'fog',
    cloudOpacity: 0.9
  },
  'windy': {
    bg: 'linear-gradient(180deg, #5A9FD4 0%, #85B8DC 50%, #B5D4E8 100%)',
    iconCode: '2001',
    tone: '动感',
    type: 'windy',
    showSun: true,
    sunOpacity: 0.7,
    cloudOpacity: 0.6
  },
  'gale': {
    bg: 'linear-gradient(180deg, #5A9FD4 0%, #85B8DC 50%, #B5D4E8 100%)',
    iconCode: '2075',
    tone: '警惕',
    type: 'gale',
  },
  'night': {
    bg: 'linear-gradient(180deg, #1A2332 0%, #2C3E50 50%, #3A4F63 100%)',
    iconCode: '150',
    tone: '安静',
    type: 'night',
    starOpacity: 0.8,
    textColor: '#E6EEF8',
    titleShadow: '0 1px 2px rgba(0,0,0,.45)',
    baseClass: 'night'
  },
  'sandstorm': {
    bg: 'linear-gradient(180deg, #B8956A 0%, #D4B896 50%, #E8D5BB 100%)',
    iconCode: '508',
    tone: '警惕',
    type: 'sandstorm',
    cloudOpacity: 1.0
  },
  'typhoon': {
    bg: 'linear-gradient(180deg, #3D4F5C 0%, #5A6D7A 40%, #748694 80%, #8FA1AD 100%)',
    iconCode: '1001',
    tone: '严肃',
    type: 'typhoon',
    cloudOpacity: 1.0
  },
  'hail': {
    bg: 'linear-gradient(180deg, #6B7C8E 0%, #8896A6 50%, #A8B5C3 100%)',
    iconCode: '1015',
    tone: '警惕',
    type: 'hail',
    cloudOpacity: 0.9
  },
  'freezing_rain': {
    bg: 'linear-gradient(180deg, #5A6B7C 0%, #788896 50%, #96A3B0 100%)',
    iconCode: '313',
    tone: '严肃',
    type: 'freezing_rain',
    cloudOpacity: 0.9
  },
  'sleet': {
    bg: 'linear-gradient(180deg, #8A9BAB 0%, #A8B5C3 50%, #C6D1DB 100%)',
    iconCode: '404',
    tone: '温和',
    type: 'sleet',
    cloudOpacity: 0.7
  },
  'tornado': {
    bg: 'linear-gradient(180deg, #4A5A5C 0%, #677A7C 40%, #849A9C 80%, #A1BABC 100%)',
    iconCode: '1002',
    tone: '危险',
    type: 'tornado',
    cloudOpacity: 1.0
  },
  'default': {
    bg: 'linear-gradient(180deg, #87CEEB 0%, #B0E0E6 50%, #E0F6FF 100%)',
    iconCode: '100',
    tone: '温和',
    type: 'default',
    showSun: true,
    baseClass: 'day'
  }
}

// 调试天气 → 和风图标编号 & 中文文案（QWeather Icons v1.8.0）
const DEBUG_WEATHER_MAP = {
  clear: { icon: '100', text: '晴' },
  cloudy: { icon: '104', text: '多云' },
  light_rain: { icon: '305', text: '小雨' },
  moderate_rain: { icon: '306', text: '中雨' },
  heavy_rain: { icon: '307', text: '大雨' },
  storm_rain: { icon: '1003', text: '暴雨' },
  thunderstorm: { icon: '302', text: '雷阵雨' },
  light_snow: { icon: '401', text: '小雪' },
  moderate_snow: { icon: '402', text: '中雪' },
  heavy_snow: { icon: '403', text: '大雪' },
  blizzard: { icon: '1004', text: '暴雪' },
  sleet: { icon: '404', text: '雨夹雪' },
  freezing_rain: { icon: '313', text: '冻雨' },
  hail: { icon: '1015', text: '冰雹' },
  sandstorm: { icon: '508', text: '沙尘暴' },
  windy: { icon: '2001', text: '有风' },
  gale: { icon: '2075', text: '大风' },
  typhoon: { icon: '1001', text: '台风' },
  tornado: { icon: '1002', text: '龙卷风' },
  fog: { icon: '500', text: '雾' },
  haze: { icon: '501', text: '霾' },
  night: { icon: '150', text: '夜间' },
  dawn: { icon: '100', text: '日出' },
  dusk: { icon: '150', text: '日落' }
}

// 和风天气代码映射（v1.8.0 + 自定义扩展）- 完全一致版
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
  1003: 'storm_rain',   // 暴雨
  1004: 'blizzard',     // 暴雪
  1015: 'hail'          // 冰雹
}

// V3.0 升级版AI问候语生成 - 节气联动
function generateAIGreeting(weather, profile, lunar, holiday, solarTerm) {
  const hour = getCurrentHour()
  const temp = Number(weather?.now?.temp) || 20
  const weatherText = weather?.now?.text || ''
  const weatherCode = weather?.now?.code || weather?.weather?.code || ''
  const tone = profile?.ai_tone || '温柔'

  let period = 'morning'
  if (hour >= 12 && hour < 18) period = 'afternoon'
  else if (hour >= 18 && hour < 22) period = 'evening'
  else if (hour >= 22 || hour < 6) period = 'night'

  if (solarTerm?.name) {
    const solarTermGreetings = {
      '立春': {
        morning: {
          rain: '立春小雨，万物萌动，记得带伞',
          clear: '立春阳光，春意渐浓，出门走走'
        },
        evening: {
          rain: '立春夜雨，春意朦胧，早点回家',
          clear: '立春傍晚，微风和煦，散步正好'
        },
        night: {
          rain: '立春夜雨，春眠不觉晓，好好休息',
          clear: '立春夜晚，春意渐浓，早点睡'
        }
      },
      '雨水': {
        morning: {
          rain: '雨水时节，春雨绵绵，记得带伞',
          clear: '雨水晴天，难得好天气，珍惜阳光'
        },
        evening: {
          rain: '雨水夜雨，润物无声，早点回家',
          clear: '雨水傍晚，天气温和，散步舒适'
        }
      },
      '惊蛰': {
        morning: {
          rain: '惊蛰小雨，春雷乍响，带伞出门',
          clear: '惊蛰晴日，万物复苏，活力满满'
        },
        evening: {
          rain: '惊蛰夜雨，雷声滚滚，在家休息',
          clear: '惊蛰傍晚，春意盎然，出门散步'
        }
      },
      '春分': {
        morning: {
          rain: '春分小雨，昼夜均分，记得带伞',
          clear: '春分晴天，昼夜平分，阳光正好'
        },
        evening: {
          rain: '春分夜雨，春意正浓，早点回家',
          clear: '春分傍晚，微风和煦，散步愉快'
        }
      },
      '清明': {
        morning: {
          rain: '清明雨纷纷，路上行人，记得带伞',
          clear: '清明晴日，春光明媚，踏青好时节'
        },
        evening: {
          rain: '清明夜雨，思念绵绵，早点回家',
          clear: '清明傍晚，春意正浓，散步舒心'
        }
      },
      '谷雨': {
        morning: {
          rain: '谷雨时节，春雨贵如油，带伞出门',
          clear: '谷雨晴天，播种好时节，活力满满'
        },
        evening: {
          rain: '谷雨夜雨，滋润万物，在家休息',
          clear: '谷雨傍晚，春意将尽，珍惜春光'
        }
      },
      '立夏': {
        morning: {
          rain: '立夏小雨，夏意初显，记得带伞',
          clear: '立夏阳光，夏天来了，注意防晒'
        },
        evening: {
          rain: '立夏夜雨，暑气渐消，早点回家',
          clear: '立夏傍晚，微风习习，散步凉爽'
        }
      },
      '小满': {
        morning: {
          rain: '小满雨水，作物渐丰，带伞出门',
          clear: '小满晴日，万物繁茂，阳光灿烂'
        },
        evening: {
          rain: '小满夜雨，夏意正浓，在家休息',
          clear: '小满傍晚，暑气未消，散步纳凉'
        }
      },
      '芒种': {
        morning: {
          rain: '芒种雨水，收获在望，记得带伞',
          clear: '芒种晴天，忙碌时节，加油打气'
        },
        evening: {
          rain: '芒种夜雨，忙里偷闲，早点休息',
          clear: '芒种傍晚，劳作辛苦，放松一下'
        }
      },
      '夏至': {
        morning: {
          rain: '夏至小雨，白昼最长，带伞出门',
          clear: '夏至晴日，阳光充足，注意防晒'
        },
        evening: {
          rain: '夏至夜雨，暑气渐消，在家纳凉',
          clear: '夏至傍晚，日照最长，散步惬意'
        }
      },
      '小暑': {
        morning: {
          rain: '小暑雨水，暑气渐重，记得带伞',
          clear: '小暑晴日，炎热时节，多喝水'
        },
        evening: {
          rain: '小暑夜雨，暑气暂消，早点回家',
          clear: '小暑傍晚，暑气未消，散步纳凉'
        }
      },
      '大暑': {
        morning: {
          rain: '大暑雨水，暑气最重，带伞出门',
          clear: '大暑晴日，最热时节，注意防暑'
        },
        evening: {
          rain: '大暑夜雨，暑气稍解，在家纳凉',
          clear: '大暑傍晚，暑气难消，少出门'
        }
      },
      '立秋': {
        morning: {
          rain: '立秋小雨，秋意初显，记得带伞',
          clear: '立秋晴日，秋高气爽，出门舒适'
        },
        evening: {
          rain: '立秋夜雨，凉意渐浓，早点回家',
          clear: '立秋傍晚，秋意正浓，散步宜人'
        }
      },
      '处暑': {
        morning: {
          rain: '处暑雨水，暑气渐消，带伞出门',
          clear: '处暑晴日，秋意渐浓，天气转凉'
        },
        evening: {
          rain: '处暑夜雨，凉意更浓，早点休息',
          clear: '处暑傍晚，暑气已消，散步舒适'
        }
      },
      '白露': {
        morning: {
          rain: '白露小雨，秋意正浓，记得带伞',
          clear: '白露晴日，昼夜温差大，适当增衣'
        },
        evening: {
          rain: '白露夜雨，露水凝重，早点回家',
          clear: '白露傍晚，凉意渐浓，添件外套'
        }
      },
      '秋分': {
        morning: {
          rain: '秋分雨水，昼夜均分，带伞出门',
          clear: '秋分晴日，秋高气爽，好天气'
        },
        evening: {
          rain: '秋分夜雨，秋意正浓，在家休息',
          clear: '秋分傍晚，昼夜平分，散步舒心'
        }
      },
      '寒露': {
        morning: {
          rain: '寒露小雨，露水渐寒，记得带伞',
          clear: '寒露晴日，秋意深浓，注意保暖'
        },
        evening: {
          rain: '寒露夜雨，寒意渐重，早点回家',
          clear: '寒露傍晚，凉意明显，加件外套'
        },
        night: {
          rain: '寒露夜雨，寒意袭人，盖好被子',
          clear: '寒露夜晚，露水凝寒，注意保暖'
        }
      },
      '霜降': {
        morning: {
          rain: '霜降雨水，天气转凉，带伞加衣',
          clear: '霜降晴日，霜降气温低，多穿点'
        },
        evening: {
          rain: '霜降夜雨，寒意更重，早点回家',
          clear: '霜降傍晚，气温骤降，注意保暖'
        }
      },
      '立冬': {
        morning: {
          rain: '立冬雨水，冬意初显，记得带伞',
          clear: '立冬晴日，准备过冬，添衣保暖'
        },
        evening: {
          rain: '立冬夜雨，寒意袭人，早点回家',
          clear: '立冬傍晚，冬天来了，注意保暖'
        }
      },
      '小雪': {
        morning: {
          rain: '小雪雨水，天气更冷，带伞保暖',
          clear: '小雪晴日，温差加大，多穿衣服'
        },
        evening: {
          rain: '小雪夜雨，寒意更重，早点休息',
          clear: '小雪傍晚，寒冷加剧，回家保暖'
        }
      },
      '大雪': {
        morning: {
          rain: '大雪雨雪，天寒地冻，注意保暖',
          clear: '大雪晴日，寒意逼人，多穿点'
        },
        evening: {
          rain: '大雪夜雪，路滑难行，在家休息',
          clear: '大雪傍晚，严寒时节，早点回家'
        }
      },
      '冬至': {
        morning: {
          rain: '冬至雨雪，白昼最短，带伞保暖',
          clear: '冬至晴日，数九开始，注意保暖'
        },
        evening: {
          rain: '冬至夜长，寒意深重，早点休息',
          clear: '冬至傍晚，夜长日短，早点回家'
        }
      },
      '小寒': {
        morning: {
          rain: '小寒雨雪，最冷时节，保暖为上',
          clear: '小寒晴日，天气最冷，多穿衣服'
        },
        evening: {
          rain: '小寒夜冷，寒气逼人，在家休息',
          clear: '小寒傍晚，严寒刺骨，早点回家'
        }
      },
      '大寒': {
        morning: {
          rain: '大寒雨雪，严寒至极，注意保暖',
          clear: '大寒晴日，春天不远了，坚持住'
        },
        evening: {
          rain: '大寒夜寒，最后的冷，早点休息',
          clear: '大寒傍晚，春意渐近，再忍忍'
        }
      }
    }

    const termGreetings = solarTermGreetings[solarTerm.name]
    if (termGreetings) {
      const periodGreetings = termGreetings[period] || termGreetings['morning']
      let weatherType = 'clear'
      if (weatherText.includes('雨') || weatherCode === 'rain') weatherType = 'rain'
      else if (weatherText.includes('雪') || weatherCode === 'snow') weatherType = 'rain'
      const greeting = periodGreetings[weatherType] || periodGreetings['clear']
      if (greeting) return greeting
    }
  }

  const greetings = {
    温柔: {
      morning: {
        clear: ['早安🌞，阳光正好，今天也要轻松一点。', '早安☀️，新的一天，愿一切顺利。', '早安🌤️，晴空万里，心情也明朗起来。'],
        cloudy: ['早安☁️，天气温柔，适合慢慢来。', '早安🌥️，云朵轻盈，今天也温柔以待。', '早安🌤️，虽然多云，但心情可以是晴天。'],
        rain: ['早安🌧️，小雨淅沥，出门别忘带伞。', '早安☔，雨天也有雨天的美好，慢一点。', '早安🌂，雨声温柔，适合安静的一天。'],
        thunderstorm: ['早安⛈️，雷雨天气，在家安心待着。', '早安⚡，雷阵雨来了，别急着出门。', '早安🌩️，天气有点闹脾气，咱们稳着点。'],
        snow: ['早安❄️，雪花纷飞，记得保暖哦。', '早安⛄，雪天路滑，慢慢走不着急。', '早安🌨️，雪天的美好，值得慢慢欣赏。'],
        fog: ['早安🌫️，薄雾朦胧，慢一点也很美。', '早安🌁，雾气重，开车慢一点更安全。', '早安🌫️，雾里看花，也是一种朦胧美。'],
        sandstorm: ['早安🌪️，沙尘天气，尽量别出门。', '早安💨，风沙大，出门记得戴口罩。', '早安🌬️，沙尘暴来了，在家更安心。'],
        typhoon: ['早安🌀，台风天气，注意安全。', '早安🌪️，台风来袭，非必要别外出。', '早安💨，风雨交加，在家最安全。'],
        default: ['早安🌤️，新的一天，温柔以待。', '早安🌅，又是崭新的一天，加油。', '早安🌤️，今天也要好好的哦。']
      },
      afternoon: {
        clear: ['午后阳光☀️，适合小憩或散步。', '午后时光🌤️，晒晒太阳，放松一下。', '午后阳光正好☀️，做点喜欢的事。'],
        cloudy: ['午后多云🌥️，天气刚刚好，不晒不冷。', '午后☁️，云朵悠悠，时光也悠悠。', '午后时光🌤️，多云的天气也很舒适。'],
        rain: ['午后小雨🌧️，窗边听雨也是一种美好。', '午后☔，雨声滴答，适合发呆放空。', '午后🌂，雨天的午后，静谧而美好。'],
        thunderstorm: ['午后雷雨⛈️，在室内更安心。', '午后⚡，雷阵雨中，找个安静角落休息。', '午后🌩️，雷声隆隆，窝在家里最舒服。'],
        snow: ['午后飘雪❄️，看雪景也是一种享受。', '午后⛄，雪花飘飘，静静欣赏就好。', '午后🌨️，雪天的午后，格外宁静。'],
        fog: ['午后雾气🌫️，朦胧的美也很特别。', '午后🌁，雾锁楼台，别有一番意境。', '午后🌫️，雾气中，时光也慢了下来。'],
        default: ['午后时光🌤️，给自己一点温柔的陪伴。', '午后🌅，休息一下，下午更有精神。', '午后时光🌤️，慢一点，生活更美好。']
      },
      evening: {
        clear: ['傍晚金光🌅，今天辛苦了，慢慢放松。', '傍晚时分🌇，夕阳温柔，今天也很棒。', '傍晚☀️，金色的光，映照着归家的路。'],
        cloudy: ['傍晚时分🌥️，天色渐暗，早点回家。', '傍晚☁️，云朵染上了晚霞，很美。', '傍晚🌤️，虽然多云，但归途依旧温暖。'],
        rain: ['傍晚细雨🌧️，早点回家，温暖的晚餐等着。', '傍晚☔，雨夜归家，格外温馨。', '傍晚🌂，雨中归途，慢慢走不着急。'],
        thunderstorm: ['傍晚雷雨⛈️，快点回家，别淋湿了。', '傍晚⚡，雷声阵阵，赶紧找个安全地方。', '傍晚🌩️，雷雨交加，早点到家。'],
        snow: ['傍晚飘雪❄️，雪夜归家，注意保暖。', '傍晚⛄，雪花中，回家的路也浪漫。', '傍晚🌨️，雪夜，早点回到温暖的家。'],
        fog: ['傍晚雾气🌫️，能见度低，开车慢点。', '傍晚🌁，雾锁归途，小心慢行。', '傍晚🌫️，雾茫茫，慢一点更安全。'],
        default: ['傍晚时分🌤️，今天也很棒，好好休息。', '傍晚🌇，辛苦了一天，放松一下吧。', '傍晚时光🌤️，慢慢走，不着急。']
      },
      night: {
        clear: ['晚安🌙，星光温柔，早点休息。', '晚安✨，星空璀璨，愿你好梦。', '晚安🌃，夜色温柔，好好睡一觉。'],
        cloudy: ['晚安☁️，云朵遮月，也遮住了烦恼。', '晚安🌥️，多云的夜，也很安静。', '晚安🌤️，夜深了，早点休息吧。'],
        rain: ['晚安🌧️，雨声催眠，愿你好梦。', '晚安☔，雨夜最适合安心入睡。', '晚安🌂，听着雨声，慢慢进入梦乡。'],
        thunderstorm: ['晚安⛈️，雷雨夜，盖好被子睡个好觉。', '晚安⚡，雷声隆隆，别怕，安心睡。', '晚安🌩️，雷雨交加，在家最安全。'],
        snow: ['晚安❄️，雪夜静谧，愿你暖暖入眠。', '晚安⛄，雪花飘飘，做个温暖的梦。', '晚安🌨️，雪夜，盖好被子别着凉。'],
        fog: ['晚安🌫️，雾夜朦胧，安心入睡。', '晚安🌁，雾气重，窗户关好再睡。', '晚安🌫️，雾夜，早点休息。'],
        default: ['晚安🌤️，月光柔和，明天会更好。', '晚安🌙，夜深了，放下一切好好睡。', '晚安✨，愿你安然入睡，好梦连连。']
      }
    }
  }

  let weatherType = 'default'
  if (weatherText.includes('晴')) weatherType = 'clear'
  else if (weatherText.includes('云')) weatherType = 'cloudy'
  else if (weatherText.includes('雨')) weatherType = 'rain'
  else if (weatherText.includes('雷')) weatherType = 'thunderstorm'
  else if (weatherText.includes('雪')) weatherType = 'snow'
  else if (weatherText.includes('雾') || weatherText.includes('霾')) weatherType = 'fog'
  else if (weatherCode === 'sandstorm') weatherType = 'sandstorm'
  else if (weatherCode === 'typhoon') weatherType = 'typhoon'

  const toneGreetings = greetings[tone] || greetings['温柔']
  const periodGreetings = toneGreetings[period] || toneGreetings['morning']
  const weatherGreetings = periodGreetings[weatherType] || periodGreetings['default']
  return weatherGreetings[Math.floor(Math.random() * weatherGreetings.length)]
}

// V3.0 新增：获取当前节气信息
function getCurrentSolarTerm(dateYmd) {
  const today = new Date(dateYmd)
  const currentMonth = today.getMonth() + 1
  const currentDay = today.getDate()
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

  return currentTerm
}

// 日出日落计算
function calculateSunTimes(lat, lng, date) {
  const rad = Math.PI / 180
  const day = Math.floor((date - new Date(date.getFullYear(), 0, 1)) / 86400000) + 1
  const solarDeclination = 23.45 * Math.sin(rad * (360 * (284 + day) / 365))
  const hourAngle = Math.acos(-Math.tan(rad * lat) * Math.tan(rad * solarDeclination)) / rad
  const sunrise = 12 - hourAngle / 15
  const sunset = 12 + hourAngle / 15
  const timezone = 8
  return {
    sunrise: sunrise + timezone,
    sunset: sunset + timezone,
    noon: 12 + timezone
  }
}

// 天气主题检测（修复版 - 夜间强制黑背景但保留天气动画）
function detectWeatherTheme(weather, loc) {
  const wxNow = weather?.now || {}
  const code = wxNow.code || 'default'
  const weatherText = wxNow.text || ''

  // 使用新的日夜判断逻辑
  const isNight = weather?.isNight || false
  const themeBase = weather?.theme?.base || 'default'
  const themePrecip = weather?.theme?.precip || 'none'
  const baseClass = themeBase === 'night' ? 'night' : 'day'

// 夜间强制使用夜间主题，但保留天气动画类型
if (isNight) {
  const nightTheme = {
    ...WEATHER_THEMES.night,
    type: themePrecip !== 'none' ? themePrecip : 'night',
    code: code,
    moonPosition: 70,
    baseClass,
    showMoon: themePrecip === 'none'  // 有降水就不显示月亮
  }

  // ✅ 关键修复：雾天逻辑
  const isFog = themeBase === 'fog' || weatherText.includes('雾') || weatherText.includes('霾');
  const hasRain = ['rain', 'snow', 'hail', 'sleet', 'blizzard'].includes(themePrecip);
  
  if (isFog) {
    if (hasRain) {
      // 雾+雨/雪/冰雹 → 显示降水，无星星无月亮
      nightTheme.showMoon = false;
      nightTheme.showStars = false;  // ← 新增
      nightTheme.type = themePrecip;
    } else {
      // 纯雾 → 无动画，无星星无月亮
      nightTheme.showMoon = false;
      nightTheme.showStars = false;  // ← 新增
      nightTheme.type = 'fog';
    }
  }
  
  // ========== 新增：星星显示逻辑 ==========
  // 只有晴朗、少云、晴间多云的夜晚才显示星星
  const clearWeathers = ['晴', '少云', '晴间多云']
  nightTheme.showStars = clearWeathers.includes(weatherText) && themePrecip === 'none'
  
  // 如果是阴天、多云，也不显示星星
  if (weatherText.includes('阴') || weatherText.includes('多云')) {
    nightTheme.showStars = false
  }

  // 如果有降水，调整夜间背景色调但更深更暗
  if (['rain', 'thunderstorm'].includes(themePrecip)) {
    nightTheme.bg = 'linear-gradient(180deg, #1A1A2E 0%, #16213E 40%, #0F3460 80%, #533483 100%)'
  } else if (['snow', 'blizzard'].includes(themePrecip)) {
    nightTheme.bg = 'linear-gradient(180deg, #2C3E50 0%, #34495E 40%, #4A5568 80%, #566573 100%)'
  } else if (themePrecip === 'hail') {
    nightTheme.bg = 'linear-gradient(180deg, #1C1C3A 0%, #2A2A5A 40%, #3A3A7A 80%, #4A4A9A 100%)'
  }
  return nightTheme
}

  // 白天：按原有逻辑处理
  const badWeatherCodes = [
    'rain', 'thunderstorm', 'severe_thunder', 'snow', 'blizzard', 'sleet', 'freezing_rain',
    'hail', 'typhoon', 'tornado', 'fog', 'dense_fog', 'haze', 'sandstorm'
  ]

  if (badWeatherCodes.includes(code) || weatherText.includes('雨') || weatherText.includes('雪') || weatherText.includes('雾') || weatherText.includes('霾')) {
    let themeType = 'rain'
    if (code === 'snow' || code === 'blizzard' || weatherText.includes('雪')) themeType = 'snow'
    else if (code === 'fog' || code === 'dense_fog' || code === 'haze') themeType = 'fog'
    else if (code === 'typhoon') themeType = 'typhoon'
    else if (code === 'tornado') themeType = 'tornado'
    else if (code === 'sandstorm') themeType = 'sandstorm'
    else if (code === 'hail') themeType = 'hail'
    else if (code === 'sleet') themeType = 'sleet'
    else if (code === 'freezing_rain') themeType = 'freezing_rain'
    else if (code === 'severe_thunder' || code === 'thunderstorm') themeType = 'thunderstorm'

    return {
      ...WEATHER_THEMES[themeType],
      code: code,
      sunPosition: undefined,
      moonPosition: undefined,
      baseClass
    }
  }

  // 白天晴天/多云
  let themeType = 'cloudy'
  if (weatherText.includes('晴')) themeType = 'clear'
  else if (weatherText.includes('云')) themeType = 'cloudy'
  else if (weatherText.includes('风')) themeType = 'windy'

  return {
    ...WEATHER_THEMES[themeType],
    code: code,
    sunPosition: WEATHER_THEMES[themeType].sunPosition,
    baseClass
  }
}

// 强度映射（修正版）
function getBaseType(type = '') {
  if (!type) return 'default'
  if (/_rain$/.test(type) || type === 'storm_rain') return 'rain'
  if (/_snow$/.test(type) || type === 'blizzard') return 'snow'
  if (type === 'gale') return 'windy'
  return type
}

function getIntensity(type) {
  switch (type) {
    case 'light_rain':
    case 'light_snow':
      return 1
    case 'moderate_rain':
    case 'moderate_snow':
      return 2
    case 'heavy_rain':
    case 'heavy_snow':
      return 3
    case 'storm_rain':
    case 'blizzard':
      return 4
    default:
      return 0
  }
}

// 工具函数
const pad = n => String(n).padStart(2, '0')
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const GEO_KEY = 'LAST_GEO_DISPLAY'
const LOC_KEY = 'LAST_LOC'
const WIFI_KEY = 'LAST_WIFI'
const LOC_TTL = 10 * 60 * 1000
const MOVE_THRESHOLD_KM = 0.3

function haversine(a = {}, b = {}) {
  if (!a || !b || !a.lat || !a.lng || !b.lat || !b.lng) return Infinity
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

Page({
  data: {
    dateYmd: '',
    __DEV__: true,
    weekday: '',
    lunar: {},
    holiday: {},
    solarTerm: {},
    weather: { now: {}, daily: {} },
    events: [],
    tips: [],
    cityName: '定位中',
    locating: true,
    loc: null,
    poiName: null,
    poiDistance: null,
    raindrops: [],
    stars: [],
    debugMode: false,
    showDebugPanel: false,
    weatherTheme: WEATHER_THEMES.default,
    aiGreeting: '正在为你准备今天的问候...',
    profile: {},
    userDataV3: {},
    helpersV3: [],
    dietPrefV3: {},
    todayMenu: [],
    currentPeople: 2,
    activeOverrides: [],
    performanceMode: 'high',
    enableAnimations: true,
    deviceInfo: {}
  },

  onLoad() {
    this.detectPerformance()
    const userDataV3 = getUserProfileV3()
    if (userDataV3.isV3) {
      this.setData({
        profile: userDataV3.profile,
        helpersV3: userDataV3.helpers,
        dietPrefV3: userDataV3.dietPref,
        userDataV3: userDataV3
      })
    } else {
      const profile = get(KEY.PROFILE, {})
      this.setData({ profile })
    }

    this.updateCurrentPeople()
    this.loadTodayMenu()

    wx.onNetworkStatusChange?.(() => {
      this.refreshLocAndCity(false, false)
      this.checkWifiChange()
    })

    try {
      wx.startWifi?.()
    } catch (_) {}
  },

  loadTodayMenu: function() {
    try {
      const today = this.data.dateYmd || formatDateYMD(new Date())
      
      // 从菜单历史记录读取当天菜单
      const menuHistory = wx.getStorageSync('MENU_HISTORY') || []
      const todayMenuRecord = menuHistory.find(item => item.date === today)
  
      if (todayMenuRecord && todayMenuRecord.dishes) {
        // 找到今日菜单记录
        const dishes = todayMenuRecord.dishes || []
        
        // 格式化为显示格式
        const formattedMenu = this.formatMenuForHomeDisplay(dishes)
        
        // 生成菜单解释
        const mealExplain = this.generateMealExplanation(dishes)
        
        this.setData({
          todayMenu: formattedMenu,
          mealExplain: mealExplain
        })
        
        console.log('V4.3 首页加载今日菜单成功:', formattedMenu.length, '道菜')
        
      } else {
        // 没有今日菜单，显示空状态
        this.setData({
          todayMenu: [],
          mealExplain: '今天还没有生成菜单哦，点击下方按钮开始吧',
        })
        
        console.log('V4.3 今日无菜单，等待用户生成')
      }
      
    } catch (e) {
      console.error('V4.3 加载今日菜单失败:', e)
      this.generateDefaultMenu()
    }
  },

  detectPerformance() {
    try {
      const systemInfo = wx.getSystemInfoSync()
      const isLowEnd = (
        systemInfo.platform === 'android' && (
          systemInfo.model.toLowerCase().includes('redmi') ||
          systemInfo.model.toLowerCase().includes('honor') ||
          systemInfo.model.toLowerCase().includes('vivo') ||
          systemInfo.benchmarkLevel < 20
        )
      ) || systemInfo.version < '7.0.0'

      this.setData({
        performanceMode: isLowEnd ? 'low' : 'high',
        enableAnimations: !isLowEnd,
        deviceInfo: systemInfo
      })
    } catch (e) {
      console.error('性能检测失败:', e)
    }
  },

  updateCurrentPeople() {
    const profile = get(KEY.PROFILE, {})
    const basePeople = this.extractPeopleCount(profile.family_profile) || 2
    const overrides = getActiveOverrides()
    let currentPeople = basePeople
    let activeOverrides = []

    overrides.forEach(override => {
      if (override.type === 'people_delta') {
        currentPeople += override.value
        activeOverrides.push(override)
      }
    })

    this.setData({ currentPeople, activeOverrides })
  },

  extractPeopleCount(familyProfile) {
    if (!familyProfile) return 2
    if (familyProfile.includes('1成人') || familyProfile.includes('单身')) return 1
    if (familyProfile.includes('2成人') && !familyProfile.includes('儿童')) return 2
    if (familyProfile.includes('2成人+1儿童')) return 3
    if (familyProfile.includes('2成人+2儿童')) return 4
    if (familyProfile.includes('三代同堂')) return 5
    return 2
  },

  showPeopleAdjuster() {
    const { currentPeople, activeOverrides } = this.data
    let itemList = [
      '来客 +1（仅今天）',
      '来客 +2（仅今天）',
      '来客 +1（本周）',
      '有人出差 -1（今天）'
    ]

    if (activeOverrides.length > 0) {
      itemList.unshift('恢复正常人数')
    }

    wx.showActionSheet({
      itemList,
      success: (res) => {
        const index = activeOverrides.length > 0 ? res.tapIndex - 1 : res.tapIndex
        if (activeOverrides.length > 0 && res.tapIndex === 0) {
          this.clearOverrides()
        } else {
          const actions = [
            () => this.applyPeopleOverride(+1, '来客', '仅今天'),
            () => this.applyPeopleOverride(+2, '来客', '仅今天'),
            () => this.applyPeopleOverride(+1, '来客', '本周'),
            () => this.applyPeopleOverride(-1, '出差', '今天')
          ]
          actions[index]?.()
        }
      }
    })
  },

  applyPeopleOverride(delta, reason, duration) {
    const today = new Date()
    let dateTo = new Date(today)
    if (duration === '本周') {
      dateTo.setDate(today.getDate() + 7)
    } else {
      dateTo.setDate(today.getDate() + 1)
    }

    const override = applyOverride('people_delta', delta, {
      dateTo: this.formatDate(dateTo),
      reason
    })

    this.updateCurrentPeople()
    const sign = delta > 0 ? '+' : ''
    wx.showToast({
      title: `${reason} ${sign}${delta}，${duration}`,
      icon: 'success'
    })
  },

  clearOverrides() {
    set(KEY.OVERRIDES, [])
    this.updateCurrentPeople()
    wx.showToast({
      title: '已恢复正常人数',
      icon: 'success'
    })
  },

  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  async getLoc() {
    console.log('📍 开始获取定位')
    this.setData({ locating: true })

    const isSuspiciousBeijing = (lat, lng) => {
      if (typeof lat !== 'number' || typeof lng !== 'number') return false
      const dLat = lat - 39.9219
      const dLng = lng - 116.4436
      return (dLat * dLat + dLng * dLng) < (0.009 ** 2)
    }

    try {
      const setting = await wx.getSetting()
      if (!setting.authSetting['scope.userLocation']) {
        try {
          await wx.authorize({ scope: 'scope.userLocation' })
        } catch (_) {}
      }

      try {
        const { latitude, longitude } = await wx.getLocation({
          type: 'gcj02',
          isHighAccuracy: true,
          highAccuracyExpireTime: 10000,
          altitude: true
        })
        if (isSuspiciousBeijing(latitude, longitude)) throw new Error('suspicious_beijing_cbd')
        this.setData({ locating: false })
        return {
          loc: { lat: latitude, lng: longitude },
          cityName: null,
          source: 'gps'
        }
      } catch (_) {}

      if (wx.getFuzzyLocation) {
        try {
          const r = await wx.getFuzzyLocation({ type: 'wgs84' })
          if (isSuspiciousBeijing(r.latitude, r.longitude)) throw new Error('suspicious_beijing_cbd')
          this.setData({ locating: false })
          return {
            loc: { lat: r.latitude, lng: r.longitude },
            cityName: null,
            source: 'fuzzy'
          }
        } catch (_) {}
      }

      try {
        const r = await wx.chooseLocation({})
        if (r && typeof r.latitude === 'number' && typeof r.longitude === 'number') {
          this.setData({ locating: false })
          return {
            loc: { lat: r.latitude, lng: r.longitude },
            cityName: r.name || null,
            source: 'choose'
          }
        }
      } catch (_) {}
    } catch (_) {}

    const prof = get(KEY.PROFILE, {})
    const name = prof?.city?.name || cityFallback?.name || '北京'
    this.setData({ locating: false })
    console.log('📍 定位失败，使用兜底城市:', name)
    return {
      loc: null,
      cityName: name,
      source: 'fallback'
    }
  },

  fixLocation() {
    try {
      wx.removeStorageSync('LAST_GEO_DISPLAY')
      wx.removeStorageSync('LAST_LOC')
      wx.removeStorageSync('WEATHER_CACHE')
    } catch (_) {}
    this.setData({
      poiName: null,
      poiDistance: null
    })
    this.getPreciseLocation()
  },

  async checkWifiChange() {
    try {
      const info = await wx.getConnectedWifi?.()
      const now = info?.wifi || {}
      if (!now.SSID && !now.BSSID) return

      const last = get(WIFI_KEY, {})
      if (now.SSID !== last.SSID || now.BSSID !== last.BSSID) {
        set(WIFI_KEY, { SSID: now.SSID, BSSID: now.BSSID })
        this.refreshLocAndCity(false, false)
      }
    } catch (_) {}
  },

  // ✅ 核心修复：refreshLocAndCity 简化逻辑，确保位置和天气数据一致
  async refreshLocAndCity(force = false, doReverse = false, locOverride = null) {
    // 🔧 开发者工具模拟朝阳区坐标
    if (wx.getSystemInfoSync().platform === 'devtools') {
      locOverride = { lat: 39.9219, lng: 116.4436 }
      doReverse = true  // 强制反地理编码
    }
    
    // 1) 获取定位
    const hadPrecise = !!this.data.preciseShown
    let newLoc = null, cityByFallback = null, source = 'unknown'
  
    try {
      if (locOverride && locOverride.lat && locOverride.lng) {
        newLoc = locOverride
        source = 'override'
      } else {
        const r = await this.getLoc()
        newLoc = r.loc
        cityByFallback = r.cityName
        source = r?.source || 'unknown'
      }
    } catch (_) {}

    // 检查是否需要更新
    const last = get(LOC_KEY, null)
    const movedKm = last?.loc ? haversine(last.loc, newLoc || {}) : Infinity
    const stale = last ? (Date.now() - last.ts > LOC_TTL) : true
    const needUpdate = force || !last || stale || (movedKm > MOVE_THRESHOLD_KM)

    if (newLoc) this.setData({ loc: newLoc })

    // 2) 反地理编码（获取精确位置）
    const DIRECT_CITIES = ['北京', '上海', '重庆', '天津']
    const clean = s => (s || '').replace(/省|市|自治区|特别行政区|地区/g, '').trim()
    let geoDisplay = null
    let districtName = null

    console.log('🔍 检查条件', { doReverse, needUpdate, newLoc: !!newLoc })
    if (doReverse && needUpdate && newLoc) {
      console.log('🌍 开始反地理编码', { needUpdate, newLoc })
      try {
        const { result } = await wx.cloud.callFunction({
          name: 'reverseGeocode',
          data: { lat: Number(newLoc.lat), lng: Number(newLoc.lng) }
        })
        console.log('🌍 云函数返回:', JSON.stringify(result))

        if (result?.ok) {
          console.log('🔍🔍🔍 云函数返回:', JSON.stringify(result))
          const province = clean(result?.province)
          const city = clean(result?.city)
          const district = clean(result?.district)
          const town = clean(result?.town)
          districtName = district || town || ''

        
          // 构建显示名称
          const isDirectCity = DIRECT_CITIES.includes(province)
          
          if (isDirectCity) {
            geoDisplay = district ? `${province}${district}` : province
          } else {
            geoDisplay = (city && district) ? `${city}·${district}` : (city || district || '')
          }

          if (geoDisplay) set(GEO_KEY, geoDisplay)

          // POI 信息
          if (result.poi && result.poi.name) {
            this.setData({
              poiName: result.poi.name,
              poiDistance: result.poi.distance ? Number(result.poi.distance).toFixed(0) : null
            })
          } else {
            this.setData({ poiName: null, poiDistance: null })
          }
        } else {
          this.setData({ poiName: null, poiDistance: null })
        }
      } catch (e) {
        this.setData({ poiName: null, poiDistance: null })
      }
      set(LOC_KEY, { ts: Date.now(), loc: newLoc })
    }

    // 3) 计算显示名称
    const cachedGeo = get(GEO_KEY, null)
    const profCity = get(KEY.PROFILE, {})?.city?.name || null
    const weatherCityFallback = cityByFallback || profCity || (cityFallback?.name) || '北京'

    const displayName = doReverse 
      ? (geoDisplay || cachedGeo || weatherCityFallback)
      : (hadPrecise ? (cachedGeo || this.data.cityName || weatherCityFallback) : weatherCityFallback)

    // 4) 获取天气数据 - ✅ 关键修复：确保数据精度一致
    let rawWeather = {}
    const useLoc = newLoc && newLoc.lat && newLoc.lng
    
    // ✅ 缓存键策略：精确坐标 > 区县名 > 城市名
    const latTag = useLoc ? `${(+newLoc.lat).toFixed(2)},${(+newLoc.lng).toFixed(2)}` : ''
    const cacheKey = useLoc 
      ? `WEATHER_CACHE_LOC_${latTag}` 
      : `WEATHER_CACHE_CITY_${districtName || displayName || 'default'}`

    try {
      // ✅ 优先用经纬度，确保精度一致
      if (useLoc) {
        rawWeather = await getWeatherByLoc(newLoc)
      } else {
        rawWeather = await getWeatherByCity(displayName)
      }
    } catch (e) {
      console.warn('天气获取失败:', e)
      // ✅ 失败时使用缓存，但不要跨精度fallback
      try {
        const cache = wx.getStorageSync(cacheKey)
        if (cache && (Date.now() - cache.timestamp < 3600000)) {
          rawWeather = cache.data
        }
      } catch (_) {}

      // ✅ 最后兜底：但保持和位置精度一致
      if (!rawWeather || !rawWeather.now) {
        rawWeather = {
          now: { text: '多云', temp: '20', code: 'cloudy', icon: '104' },
          daily: { max: '25', min: '15' },
          cityName: displayName // ✅ 保持一致
        }
      }
    }

    // 5) 数据规范化和主题生成
    const weather = normalizeWeather(rawWeather, newLoc)
    const weatherTheme = detectWeatherTheme(weather, newLoc)
    const iconCode = weather.now.icon || weatherTheme.iconCode
    const weatherIconUrl = getRemoteIconUrl(iconCode)

    // 写入缓存
    try {
      wx.setStorageSync(cacheKey, { data: weather, timestamp: Date.now() })
    } catch (_) {}

    // 6) 一次性更新UI
    console.log('🎯 准备更新 cityName:', displayName)
    console.log('🎯 geoDisplay:', geoDisplay)
    console.log('🎯 cachedGeo:', cachedGeo)
    this.setData({
      weather,
      cityName: displayName,
      preciseShown: doReverse ? true : this.data.preciseShown,
      weatherTheme,
      weatherIconUrl
    })

    // 更新问候语和动画
    this.updateAIGreeting()
  },

  async getPreciseLocation() {
    wx.showLoading({ title: '定位中...', mask: true })
    try {
      let picked = null
      try {
        const r = await wx.chooseLocation({})
        if (r && typeof r.latitude === 'number' && typeof r.longitude === 'number') {
          picked = { lat: r.latitude, lng: r.longitude }
        }
      } catch (_) {}

      if (picked) {
        this.setData({ loc: picked })
        await this.refreshLocAndCity(true, true, picked)
      } else {
        await this.refreshLocAndCity(true, true)
      }

      wx.showToast({
        title: this.data.preciseShown ? '已更新到精确位置' : '无法获取精确位置',
        icon: this.data.preciseShown ? 'success' : 'none'
      })
    } finally {
      wx.hideLoading()
    }
  },

  createWeatherAnimations() {
    const { weatherTheme, enableAnimations } = this.data
    if (!enableAnimations) {
      this.setData({ raindrops: [], stars: [], nightClouds: [] })
      return
    }
  
    const type = weatherTheme.type;
  
    // 只保留基础动画
    if (type === 'rain' || type === 'thunderstorm' || type === 'typhoon') {
      this.createRaindrops()
    } else if (type === 'snow' || type === 'blizzard') {
      this.createSnowflakes()
    } else if (type === 'sleet') {
      this.createSleetEffect()
    } else if (type === 'hail') {
      this.createHailEffect()
    } else if (type === 'night') {
      this.createStars()
    } else {
      this.setData({ raindrops: [], stars: [], nightClouds: [] })
    }
  },

  createRaindrops() {
    const perfLow = this.data.performanceMode === 'low'
    const base = perfLow ? 25 : 50
    const k = Math.max(1, this.data.debugIntensity || 1)
    const density = Math.min(base * k, perfLow ? 60 : 120)
    const raindrops = []

    for (let i = 0; i < density; i++) {
      const w = 2
      const h = Math.min(18 + (k - 1) * 4, 30)
      raindrops.push({
        left: Math.random() * 100,
        delay: Math.random() * 800,
        duration: 300 + Math.random() * (700 / k),
        isSnow: false,
        w,
        h
      })
    }
    this.setData({ raindrops, stars: [], clouds: [], nightClouds: [] })
  },

  createSnowflakes() {
    const perfLow = this.data.performanceMode === 'low'
    const k = Math.max(1, this.data.debugIntensity || 1)
    const base = perfLow ? 14 : 24
    const density = Math.min(Math.round(base * (0.9 + k * 0.6)), perfLow ? 60 : 120)
    const snowflakes = []

    for (let i = 0; i < density; i++) {
      const size = (Math.random() * 6 + 6) * (1 + (k - 1) * 0.35)
      const opacity = Math.max(0.35, Math.min(0.85, 0.5 + (k - 1) * 0.12 + (Math.random() - 0.5) * 0.2))
      const fall = 6500 - (k - 1) * 1200 + Math.random() * 2500

      snowflakes.push({
        left: Math.random() * 100,
        delay: Math.random() * 2500,
        duration: Math.max(2200, fall),
        isSnow: true,
        size,
        opacity
      })
    }
    this.setData({ raindrops: snowflakes, stars: [], clouds: [], nightClouds: [] })
  },

  createStars() {
    // ========== 新增：检查是否应该显示星星 ==========
    if (!this.data.weatherTheme.showStars) {
      this.setData({ stars: [], nightClouds: [] })
      return
    }
    
    const perfLow = this.data.performanceMode === 'low'
    const density = perfLow ? 20 : 40
    const stars = []
    for (let i = 0; i < density; i++) {
      stars.push({
        left: Math.random() * 100,
        top: Math.random() * 50,
        delay: Math.random() * 3000,
        opacity: Math.random() * 0.8 + 0.2,
        size: Math.random() * 3 + 1
      })
    }
    let nightClouds = []
    if (this.data.weatherTheme?.showMoon) {
      const cloudCount = perfLow ? 1 : 2
      nightClouds = Array.from({ length: cloudCount }, () => ({
        left: 10 + Math.random() * 50,
        top: 8 + Math.random() * 14,
        width: 220 + Math.random() * 120,
        height: 90 + Math.random() * 40,
        duration: 18000 + Math.random() * 12000,
        delay: Math.random() * 4000,
        opacity: 0.3 + Math.random() * 0.25
      }))
    }
    this.setData({ stars, nightClouds, raindrops: [], clouds: [] })
  },

  createHailEffect() {
    const density = this.data.performanceMode === 'low' ? 12 : 25
    const hailstones = []
    for (let i = 0; i < density; i++) {
      hailstones.push({
        left: Math.random() * 100,
        delay: Math.random() * 500,
        duration: Math.random() * 400 + 300,
        size: Math.random() * 10 + 8,
        opacity: 1,
        isSnow: false,
        isHail: true
      })
    }
    this.setData({ raindrops: hailstones, clouds: [], stars: [], nightClouds: [] })
  },

  createFreezingRainEffect() {
    const raindrops = []
    for (let i = 0; i < 25; i++) {
      raindrops.push({
        left: Math.random() * 100,
        delay: Math.random() * 1000,
        duration: Math.random() * 600 + 400,
        isSnow: false
      })
    }
    this.setData({ raindrops: raindrops, stars: [], clouds: [], nightClouds: [] })
  },

  createSleetEffect() {
    const density = this.data.performanceMode === 'low' ? 20 : 35
    const mixed = []
    for (let i = 0; i < density; i++) {
      const isSnow = Math.random() > 0.7
      mixed.push({
        left: Math.random() * 100,
        delay: Math.random() * 1000,
        duration: isSnow ? 6000 + Math.random() * 3000 : 1000 + Math.random() * 500,
        isSnow: isSnow
      })
    }
    this.setData({ raindrops: mixed, clouds: [], stars: [], nightClouds: [] })
  },

  updateAIGreeting() {
    const { weather, profile, lunar, holiday, dateYmd, settings } = this.data
    
    // 检查是否开启每日语录
    const appSettings = get('APP_SETTINGS', { show_daily_quote: true })
    if (!appSettings.show_daily_quote) {
      this.setData({ aiGreeting: '' })
      return
    }
    
    let solarTermName = weather?.solar_term || ''
    if (!solarTermName) {
      const localTerm = getCurrentSolarTerm(dateYmd)
      solarTermName = localTerm?.name || ''
    }
  
    const currentHour = new Date().getHours()
    let timeSlot = 'morning'
    if (currentHour >= 12 && currentHour < 18) timeSlot = 'afternoon'
    else if (currentHour >= 18 && currentHour < 22) timeSlot = 'evening'  
    else if (currentHour >= 22 || currentHour < 6) timeSlot = 'night'
  
    try {
      const result = generateFamilyTone(weather, { name: solarTermName }, profile, timeSlot)
      this.setData({ aiGreeting: result.greeting })
    } catch (e) {
      console.error('V4.1语气生成失败:', e)
      // 降级到原有逻辑
      const greeting = generateAIGreeting(weather, profile, lunar, holiday, { name: solarTermName })
      this.setData({ aiGreeting: greeting })
    }
    
    this.createWeatherAnimations()
    // V4.2 数据收集
    collectDailyData({ type: 'ai_greeting' })
  },

  switchWeather(e) {
    const type = e.currentTarget.dataset.type
    let theme = WEATHER_THEMES[type] || WEATHER_THEMES.default
    this.setData({ weatherTheme: theme })
    this.createWeatherAnimations()
    wx.showToast({
      title: `切换到${type}`,
      icon: 'none'
    })
  },

  async onShow() {
    track(EVENTS.home_view)
    const now = new Date()
    const dateYmd = formatDateYMD(now)
    const weekday = weekdayCN(now)

    let lunar = {}; let solarTerm = {}
    try {
      lunar = await getLunarInfo(dateYmd)
      solarTerm = getCurrentSolarTerm(dateYmd)
    } catch (_) {}

    let holiday = {}
    try {
      holiday = isInRange(dateYmd) || {}
    } catch (_) {}

    await this.refreshLocAndCity(false, true) // ✅ 第一次就反查区县

    const todayDate = new Date(dateYmd)
    const seven = new Date(todayDate); seven.setDate(todayDate.getDate() + 7)
    let events = []
    try {
      const _ = db.command
      const r = await db.collection('events')
        .where({ time: _.gte(ymd(todayDate)).and(_.lte(ymd(seven))) })
        .orderBy('pin', 'desc').orderBy('time', 'asc').get()
      events = r.data || []
    } catch (e) {}

    let tips = []
    try {
      const profile = get(KEY.PROFILE, {}) || {}
      tips = buildDailyTips({ weather: this.data.weather, holiday, profile, solarTerm }) || []
    } catch (e) {
      tips = []
    }

// 在干支纪年处理之前添加：
console.log('农历数据调试:', JSON.stringify(lunar));

// 构建农历显示文案，包含干支纪年
if (lunar && lunar.lunarYear) {
  const ganzhi = ganzhiOfYear(lunar.lunarYear)
  console.log('干支纪年计算:', { lunarYear: lunar.lunarYear, ganzhi });
  
  if (lunar.lunarDate && !lunar.lunarDate.includes('年')) {
    lunar.lunarDate = `${ganzhi}年${lunar.lunarDate}`
    console.log('更新后的农历:', lunar.lunarDate);
  }
} else {
  console.log('农历数据不完整:', { lunar, hasLunarYear: !!lunar?.lunarYear });
}

// 构建农历显示文案，包含干支纪年
if (lunar && lunar.lunarYear) {
  const ganzhi = ganzhiOfYear(lunar.lunarYear)
  if (lunar.lunarDate && !lunar.lunarDate.includes('年')) {
    lunar.lunarDate = `${ganzhi}年 ${lunar.lunarDate}`
  }
}

    this.setData({
      dateYmd,
      weekday,
      lunar,
      holiday,
      solarTerm,
      events,
      tips
    })

    this.updateCurrentPeople()
    this.loadTodayMenu()
  },

  onPullDownRefresh() {
    this.refreshLocAndCity(true, false).finally(() => wx.stopPullDownRefresh())
  },

  goAddEvent() {
    wx.navigateTo({ url: '/pages/events/edit' })
  },

  openWeather() {
    track(EVENTS.weather_card_click)
  },

  goDiet() {
    collectDailyData({ type: 'menu_generation' })
    wx.navigateTo({ url: '/pages/diet/index' })
  },

  openRandom() {
    wx.navigateTo({ url: '/pages/diet/random' })
  },

  goStudy() {
    wx.navigateTo({ url: '/pages/study/index' })
  },

  goChores() {
    wx.navigateTo({ url: '/pages/chores/index' })
  },

  goReports(e) {
    collectDailyData({ type: 'reports_view' })
    const tab = e?.currentTarget?.dataset?.tab || 'day'
    wx.navigateTo({ url: `/pages/reports/index?tab=${tab}` })
  },

  askSub() {
    const id = tmpls?.event
    if (!id) return wx.showToast({ title: '模板ID未配置', icon: 'none' })

    wx.requestSubscribeMessage({ tmplIds: [id] }).then(res => {
      const st = res[id]
      if (st === 'accept') wx.showToast({ title: '已开启' })
      else if (st === 'reject') wx.showToast({ title: '已拒绝', icon: 'none' })
      else if (st === 'ban') {
        wx.showModal({
          title: '未弹出/被屏蔽',
          content: '请到右上角"···→ 设置 → 订阅消息"打开允许，或到微信：我→设置→新消息通知。',
          confirmText: '去设置',
          success(r) {
            if (r.confirm) wx.openSetting({ withSubscriptions: true })
          }
        })
      }
    })
  },

  toggleDebugPanel() {
    this.setData({ showDebugPanel: !this.data.showDebugPanel })
  },

  switchWeatherDebug(e) {
    const type = e.currentTarget.dataset.type
    const info = DEBUG_WEATHER_MAP[type]
    const baseKey = getBaseType(type)
    const intensity = getIntensity(type)
    const theme = WEATHER_THEMES[baseKey] || WEATHER_THEMES.default
    const iconId = (info?.icon) || theme.iconCode || '104'
    const text = info?.text || this.getWeatherName(type)

    this.setData({
      weatherTheme: {
        ...theme,
        sunTimes: { sunrise: 6, sunset: 18, noon: 12 },
        debugIntensity: intensity,
      },
      debugIntensity: intensity
    })

    const curr = this.data.weather || {}
    const now = curr.now || {}
    const newNow = {
      ...now,
      text,
      code: baseKey,
      icon: iconId
    }
    const weatherIconUrl = getRemoteIconUrl(iconId)

    this.setData({
      weather: { ...curr, now: newNow },
      weatherIconUrl,
      aiGreeting: this.generateDebugGreeting(baseKey),
      debugLockWeather: true
    })

    this.createWeatherAnimations()
    wx.showToast({
      title: '已切到 ' + this.getWeatherName(type),
      icon: 'none',
      duration: 1200
    })
  },

  getWeatherName(type) {
    const names = {
      clear: '晴天', cloudy: '多云', rain: '雨天', thunderstorm: '雷雨',
      snow: '雪天', hail: '冰雹', freezing_rain: '冻雨', sleet: '雨夹雪',
      fog: '雾霾', sandstorm: '沙尘暴', windy: '大风', tornado: '龙卷风',
      typhoon: '台风', night: '夜晚', dawn: '日出', dusk: '日落',
      light_rain: '小雨', moderate_rain: '中雨', heavy_rain: '大雨', storm_rain: '暴雨',
      light_snow: '小雪', moderate_snow: '中雪', heavy_snow: '大雪', blizzard: '暴雪',
      gale: '大风'
    }
    return names[type] || '未知天气'
  },

  generateDebugGreeting(type) {
    const greetings = {
      clear: '☀️ 晴空万里，心情大好！',
      cloudy: '☁️ 多云天气，适合思考。',
      rain: '🌧️ 细雨绵绵，温柔如你。',
      thunderstorm: '⛈️ 雷雨天气，注意安全！',
      snow: '❄️ 雪花飘飘，银装素裹。',
      hail: '🧊 冰雹来袭，危险！快躲避！',
      freezing_rain: '🧊 冻雨天气，路面结冰，小心慢行！',
      sleet: '🌨️ 雨夹雪天气，湿冷难耐。',
      fog: '🌫️ 雾霾弥漫，减少外出。',
      sandstorm: '🌪️ 沙尘暴天气，关好门窗！',
      windy: '💨 大风呼啸，出门小心。',
      tornado: '🌪️ 龙卷风警报！立即躲避！',
      typhoon: '🌀 台风来袭！危险等级极高！',
      night: '🌙 夜深人静，繁星点点。',
      dawn: '🌅 日出东方，新的一天开始了。',
      dusk: '🌆 日落西山，橙红满天。'
    }
    return greetings[type] || '天气变化中...'
  },

  resetLocation() {
    this.fixLocation()
  },

  refreshWeather() {
    wx.showLoading({ title: '刷新中...' })
    this.refreshLocAndCity(true, false).then(() => {
      wx.hideLoading()
      wx.showToast({ title: '刷新成功', icon: 'success' })
    }).catch(() => {
      wx.hideLoading()
      wx.showToast({ title: '刷新失败', icon: 'none' })
    })
  },

  viewShadowProfile: function() {
    const shadow = wx.getStorageSync('SHADOW_PROFILE') || {}
    const events = wx.getStorageSync('SHADOW_EVENTS') || []
    const report = `【影子层画像】
换菜率: ${(shadow.change_rate * 100).toFixed(1)}%
完成率: ${(shadow.completion_ratio * 100).toFixed(1)}%
活跃天数: ${shadow.active_days}天
总完成: ${shadow.total_completions}次
周末客人频率: ${(shadow.weekend_guest_freq * 100).toFixed(1)}%

【常用时段】
${this.formatHourHist(shadow.open_hour_hist)}

【事件总数】
最近7天: ${events.length}条

【收藏菜品】
${shadow.favorite_dishes?.length || 0}道`.trim()

    wx.showModal({
      title: '影子层画像',
      content: report,
      showCancel: true,
      cancelText: '重置画像',
      confirmText: '关闭',
      success: (res) => {
        if (res.cancel) {
          wx.showModal({
            title: '确认重置',
            content: '这将清空所有影子层数据，确定吗？',
            success: (confirmRes) => {
              if (confirmRes.confirm) {
                wx.removeStorageSync('SHADOW_PROFILE')
                wx.removeStorageSync('SHADOW_EVENTS')
                wx.showToast({ title: '画像已重置', icon: 'success' })
              }
            }
          })
        }
      }
    })
  },

  formatHourHist: function(hist) {
    if (!hist || Object.keys(hist).length === 0) return '暂无数据'
    const sorted = Object.entries(hist)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour, count]) => `${hour}点: ${count}次`)
    return sorted.join('\n')
  },

  toggleTransparent() {
    const current = this.data.transparentMode || false
    this.setData({ transparentMode: !current })
    wx.showToast({
      title: current ? '恢复正常' : '透明模式',
      icon: 'none'
    })
  },

  toggleDebug() {
    this.setData({ showDebugPanel: !this.data.showDebugPanel })
  },

// ===== V4.3新增函数 =====

formatMenuForHomeDisplay: function(dishes) {
  if (!Array.isArray(dishes) || dishes.length === 0) {
    return []  // ← 关键：空数组
  }
  
  // 如果是扁平数组，转换为分组格式
  const formatted = dishes.map((dish, index) => {
    const name = dish.name || dish.title || `菜品${index + 1}`
    const tags = dish.tags || []
    const course = dish.course || this.inferCourse(name, tags)
    
    return {
      id: dish.id || `home-dish-${index}`,
      name: name,
      course: course,
      emoji: this.getEmojiForDish(name),
      tags: tags,
      reason: dish.reason || '营养搭配均衡',
      time: dish.time || dish.minutes || 0
    }
  })
  
  // 按餐次分组（为了匹配WXML模板）
  return [{
    name: '今日菜单',
    dishes: formatted
  }]
},

inferCourse: function(name, tags = []) {
  if (tags.includes('汤') || name.includes('汤') || name.includes('羹')) {
    return '汤品'
  }
  if (tags.includes('凉菜') || tags.includes('配菜') || name.includes('凉拌')) {
    return '配菜'
  }
  return '主菜'
},

getEmojiForDish: function(name) {
  const emojiMap = {
    '西红柿': '🍅', '鸡蛋': '🥚', '白菜': '🥬', '豆腐': '🧈',
    '鸡': '🍗', '牛': '🥩', '鱼': '🐟', '虾': '🦐',
    '汤': '🍲', '粥': '🍚', '面': '🍜', '米饭': '🍚',
    '蒜': '🧄', '葱': '🧅', '萝卜': '🥕', '土豆': '🥔'
  }
  
  for (const [key, emoji] of Object.entries(emojiMap)) {
    if (name.includes(key)) {
      return emoji
    }
  }
  
  return '🍽️'
},

// V5.2升级：使用AI文案引擎生成菜单解释
// V5.2升级：使用AI文案引擎生成菜单解释
generateMealExplanation: function(dishes) {
  if (!dishes || dishes.length === 0) {
    return '今天还没有准备菜单哦'
  }
  
  const userDataV3 = this.data.userDataV3 || {}
  const profile = userDataV3.profile || {}
  const weather = this.data.weather || {}
  const solarTerm = this.data.solarTerm || {}
  
  // ✅ 为每道菜生成AI理由
  const enrichedDishes = dishes.map(dish => {
    if (dish.reason) return dish; // 已有理由，跳过
    
    // 构建上下文
    const ctx = {
      user: {
        tone: this.mapAiToneToEnum(profile.ai_tone || '温柔')
      },
      env: {
        weather: {
          temp: parseInt(weather.now?.temp) || 20,
          text: weather.now?.text || '多云',
          rain: weather.now?.text?.includes('雨'),
          snow: weather.now?.text?.includes('雪'),
          typhoon: weather.now?.text?.includes('台风')
        },
        solarTerm: solarTerm.name || '',
        hasKids: profile.has_child || false
      }
    }
    
    try {
      const { generateDishReason } = require('../../utils/diet-ai-writer')
      dish.reason = generateDishReason(ctx, dish)
    } catch (e) {
      console.error('AI理由生成失败:', e)
      dish.reason = '营养搭配不错'
    }
    
    return dish
  })
  
  // 提取菜品名称
  const dishNames = enrichedDishes.slice(0, 2).map(dish => 
    dish.name || dish.title || '菜品'
  )
  
  // 如果只有一道菜，直接返回其理由
  if (enrichedDishes.length === 1) {
    return enrichedDishes[0].reason
  }
  
  // 多道菜：分析特点 + AI语气
  const hasVeg = enrichedDishes.some(dish => 
    (dish.tags || []).includes('素菜') || 
    (dish.name || '').includes('菜')
  )
  const hasMeat = enrichedDishes.some(dish => 
    (dish.tags || []).includes('荤菜') || 
    (dish.name || '').match(/鸡|牛|猪|鱼|肉/)
  )
  const hasSoup = enrichedDishes.some(dish => 
    (dish.tags || []).includes('汤') || 
    (dish.name || '').includes('汤')
  )
  
  // 根据语气生成不同风格的解释
  const tone = this.mapAiToneToEnum(profile.ai_tone || '温柔')
  const TONE = { GENTLE: '温柔', CONCISE: '简练', HUMOROUS: '幽默' }
  
  let explanation = ''
  
  if (tone === TONE.GENTLE) {
    if (profile.has_child && dishNames.length > 0) {
      explanation = `今天准备了${dishNames.join('、')}等，孩子应该会喜欢～`
    } else if (hasVeg && hasMeat) {
      explanation = `${dishNames.join('、')}，荤素搭配很均衡，今天就选它们吧`
    } else if (hasSoup) {
      explanation = `${dishNames.join('、')}，有汤有菜很丰富，营养刚刚好`
    } else {
      explanation = `今天准备了${dishNames.join('、')}，搭配得不错`
    }
  } else if (tone === TONE.CONCISE) {
    if (hasVeg && hasMeat) {
      explanation = `${dishNames.join('、')}，荤素均衡`
    } else {
      explanation = `今日：${dishNames.join('、')}`
    }
  } else if (tone === TONE.HUMOROUS) {
    if (profile.has_child && dishNames.length > 0) {
      explanation = `${dishNames.join('、')}，孩子看了都想多吃两碗饭`
    } else if (hasVeg && hasMeat) {
      explanation = `${dishNames.join('、')}，荤素搭配，营养师看了都点赞`
    } else if (hasSoup) {
      explanation = `${dishNames.join('、')}，有汤有菜，神仙搭配`
    } else {
      explanation = `今天整点${dishNames.join('、')}，不说了，开饭！`
    }
  }
  
  return explanation || `今天准备了${dishNames.join('、')}，营养搭配不错`
},

generateDefaultMenu: function(date) {
  const profile = this.data.profile || {}
  
  // 根据用户特点生成默认菜单
  let defaultDishes = []
  
  if (profile.has_child) {
    // 有孩子的家庭
    defaultDishes = [
      {
        name: '蒸蛋羹',
        course: '主菜',
        tags: ['儿童友好', '营养'],
        emoji: '🥚',
        reason: '嫩滑营养，孩子爱吃'
      },
      {
        name: '青菜肉丝面',
        course: '主菜', 
        tags: ['营养均衡'],
        emoji: '🍜',
        reason: '有荤有素，营养全面'
      }
    ]
  } else if (profile.health_goal) {
    // 有健康目标的用户
    defaultDishes = [
      {
        name: '清蒸鲈鱼',
        course: '主菜',
        tags: ['清淡', '高蛋白'],
        emoji: '🐟',
        reason: '低脂高蛋白，健康之选'
      },
      {
        name: '蒜蓉西兰花',
        course: '配菜',
        tags: ['清淡', '维生素'],
        emoji: '🥦',
        reason: '维生素丰富，清爽解腻'
      }
    ]
  } else {
    // 普通用户
    defaultDishes = [
      {
        name: '西红柿鸡蛋',
        course: '主菜',
        tags: ['家常', '快手'],
        emoji: '🍅',
        reason: '经典家常菜，简单易做'
      },
      {
        name: '紫菜蛋花汤',
        course: '汤品',
        tags: ['清淡', '快手'],
        emoji: '🍲',
        reason: '清淡爽口，营养补充'
      }
    ]
  }
  
  const mealExplain = this.generateMealExplanation(defaultDishes)
  
  this.setData({
    todayMenu: defaultDishes,
    mealExplain: mealExplain
  })
  
  console.log('V4.3 生成默认菜单:', defaultDishes.length, '道菜')
},

// 在home/index.js末尾添加
// 在 home/index.js 中修改 goDiet 函数（大约第1420行）

goDiet: function() {
  console.log('准备跳转到饮食页面并生成菜单')
  
  // 埋点统计
  collectDailyData({ type: 'menu_generation' })
  
  // ⚠️ 设置一个标志，告诉饮食页面要自动生成菜单
  wx.setStorageSync('AUTO_GENERATE_MENU', {
    trigger: 'home_click',
    timestamp: Date.now()
  })
  
  // 跳转到饮食页面
  wx.switchTab({ 
    url: '/pages/diet/index',
    success: function() {
      console.log('✅ 跳转到饮食页面成功')
    },
    fail: function(err) {
      console.error('❌ 跳转失败:', err)
      
      // 兜底方案
      wx.navigateTo({
        url: '/pages/diet/index',
        success: function() {
          console.log('✅ 兜底跳转成功')
        },
        fail: function(err2) {
          console.error('❌ 兜底跳转也失败:', err2)
          wx.showToast({
            title: '页面跳转失败',
            icon: 'none'
          })
        }
      })
    }
  })
},

// ✅ 新增：优化菜单数据共享
// V5.2升级：优化菜单数据共享（带AI解释）
syncMenuToDietPage: function() {
  const { todayMenu, mealExplain, weather, solarTerm, userDataV3 } = this.data
  
  try {
    // 为每道菜生成AI推荐理由
    const enrichedMenu = todayMenu.map(dish => {
      const profile = userDataV3?.profile || {}
      const context = {
        weather: {
          temp: weather?.now?.temp || '20',
          text: weather?.now?.text || '多云'
        },
        solarTerm: solarTerm?.name || '',
        hasKids: profile.has_child || false,
        healthGoals: profile.health_goals || [],
        aiTone: this.mapAiToneToEnum(profile.ai_tone || '温柔')
      }
      
      // 如果没有理由，用AI生成
      if (!dish.reason) {
        dish.reason = generateDishReason(dish, context)
      }
      
      return dish
    })
    
    // 将首页菜单数据存储到全局，供diet页面使用
    wx.setStorageSync('HOME_MENU_CACHE', {
      menu: enrichedMenu,
      explain: mealExplain,
      timestamp: Date.now(),
      date: this.data.dateYmd
    })
    
    console.log('V5.2菜单已同步到diet页面，包含AI理由')
  } catch (e) {
    console.error('同步菜单数据失败:', e)
  }
},

// ✅ 修改原有的 loadTodayMenu 函数，在数据加载完成后同步
loadTodayMenu: function() {
  try {
    const today = this.data.dateYmd || formatDateYMD(new Date())
    
    // 从菜单历史记录读取当天菜单
    const menuHistory = wx.getStorageSync('MENU_HISTORY') || []
    const todayMenuRecord = menuHistory.find(item => item.date === today)

    if (todayMenuRecord && todayMenuRecord.dishes) {
      // 找到今日菜单记录
      const dishes = todayMenuRecord.dishes || []
      
      // 格式化为显示格式
      const formattedMenu = this.formatMenuForHomeDisplay(dishes)
      
      // 生成菜单解释
      const mealExplain = this.generateMealExplanation(dishes)
      
      this.setData({
        todayMenu: formattedMenu,
        mealExplain: mealExplain
      })
      
      // 同步数据到diet页面
      this.syncMenuToDietPage()
      
      console.log('V4.3 首页加载今日菜单成功:', formattedMenu.length, '道菜')
      
    } else {
      // ✅ 改这里：没有今日菜单，显示空状态
      this.setData({
        todayMenu: [],
        mealExplain: ''
      })
      
      console.log('V4.3 今日无菜单，等待用户生成')
    }
    
  } catch (e) {
    console.error('V4.3 加载今日菜单失败:', e)
    
    // ✅ 改这里：出错也显示空状态
    this.setData({
      todayMenu: [],
      mealExplain: ''
    })
  }
},

// ✅ V5.2新增：语气转换工具函数
mapAiToneToEnum: function(toneStr) {
  const toneMap = {
    '温柔': TONE.GENTLE,
    '简练': TONE.CONCISE,
    '幽默': TONE.HUMOROUS
  }
  return toneMap[toneStr] || TONE.GENTLE
}
})