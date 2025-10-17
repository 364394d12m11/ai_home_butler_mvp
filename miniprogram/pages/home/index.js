const { envId, tmpls, cityFallback = { name: '北京' } } = require('../../config/index')
const db = wx.cloud.database({ env: envId })
const { getRemoteIconUrl } = require('../../utils/weather-icon')
const { formatDateYMD, weekdayCN, getCurrentHour, ganzhiOfYear } = require('../../utils/datetime')
const { getLunarInfo } = require('../../utils/lunar')
const { getWeatherByLoc, getWeatherByCity } = require('../../utils/weather')
const { collectDailyData } = require('../../utils/reflection_v4')
const { generateFamilyTone } = require('../../utils/perception_v4')
const { isInRange } = require('../../utils/holiday')
const { KEY, get, set, applyOverride, getActiveOverrides, getUserProfileV3 } = require('../../utils/storage')
const { EVENTS, track } = require('../../utils/analytics')
const { getLocalSunTimes, isNightBySunTimes } = require('../../utils/sun')
const { decideTheme } = require('../../utils/weather-theme')
const { generateDishReason, TONE } = require('../../utils/diet-ai-writer')

// ========== 功能开关 ==========
const featureFlags = {
  solarTerm: true,
  lunarGanzhi: true,
  holiday: true,
  eventsCard: true,
  peopleAdjust: true,
  askSub: true,
  shadowProfile: false
}

// ========== 工具函数 ==========
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
  
  const weatherText = now.text || '';
  const isFog = weatherText.includes('雾') || weatherText.includes('霾') || base === 'fog';
  const hasActualRain = weatherText.includes('雨') || weatherText.includes('雪') || weatherText.includes('雹');
  
  let finalBase = base;
  let finalPrecip = precip;
  
  if (isFog) {
    if (hasActualRain) {
      finalBase = 'rain';
      finalPrecip = precip;
    } else {
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

// ========== 节气数据 ==========
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

// ========== 天气主题映射 ==========
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

// ========== 节气获取 ==========
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

// ========== 天气主题检测 ==========
function detectWeatherTheme(weather, loc) {
  const wxNow = weather?.now || {}
  const code = wxNow.code || 'default'
  const weatherText = wxNow.text || ''

  const isNight = weather?.isNight || false
  const themeBase = weather?.theme?.base || 'default'
  const themePrecip = weather?.theme?.precip || 'none'
  const baseClass = themeBase === 'night' ? 'night' : 'day'

  if (isNight) {
    const nightTheme = {
      ...WEATHER_THEMES.night,
      type: themePrecip !== 'none' ? themePrecip : 'night',
      code: code,
      moonPosition: 70,
      baseClass,
      showMoon: themePrecip === 'none'
    }

    const isFog = themeBase === 'fog' || weatherText.includes('雾') || weatherText.includes('霾');
    const hasRain = ['rain', 'snow', 'hail', 'sleet', 'blizzard'].includes(themePrecip);
    
    if (isFog) {
      if (hasRain) {
        nightTheme.showMoon = false;
        nightTheme.showStars = false;
        nightTheme.type = themePrecip;
      } else {
        nightTheme.showMoon = false;
        nightTheme.showStars = false;
        nightTheme.type = 'fog';
      }
    }
    
    const clearWeathers = ['晴', '少云', '晴间多云']
    nightTheme.showStars = clearWeathers.includes(weatherText) && themePrecip === 'none'
    
    if (weatherText.includes('阴') || weatherText.includes('多云')) {
      nightTheme.showStars = false
    }

    if (['rain', 'thunderstorm'].includes(themePrecip)) {
      nightTheme.bg = 'linear-gradient(180deg, #1A1A2E 0%, #16213E 40%, #0F3460 80%, #533483 100%)'
    } else if (['snow', 'blizzard'].includes(themePrecip)) {
      nightTheme.bg = 'linear-gradient(180deg, #2C3E50 0%, #34495E 40%, #4A5568 80%, #566573 100%)'
    } else if (themePrecip === 'hail') {
      nightTheme.bg = 'linear-gradient(180deg, #1C1C3A 0%, #2A2A5A 40%, #3A3A7A 80%, #4A4A9A 100%)'
    }
    return nightTheme
  }

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

// ========== 工具函数 ==========
const pad = n => String(n).padStart(2, '0')
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const GEO_KEY = 'LAST_GEO_DISPLAY'
const LOC_KEY = 'LAST_LOC'
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
    featureFlags,
    dateYmd: '',
    weekday: '',
    lunar: {},
    lunarText: '',
    holiday: {},
    holidayBadge: '',
    solarTerm: {},
    solarTermText: '',
    weather: { now: {}, daily: {} },
    events: [],
    cityName: '定位中',
    locating: true,
    loc: null,
    raindrops: [],
    stars: [],
    weatherTheme: WEATHER_THEMES.default,
    aiGreeting: '正在为你准备今天的问候...',
    profile: {},
    userDataV3: {},
    helpersV3: [],
    dietPrefV3: {},
    todayMenu: [],
    currentPeople: 2,
    activeOverrides: [],
    enableAnimations: true
  },

  onLoad() {
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
    })
  },

  loadTodayMenu: function() {
    try {
      const today = this.data.dateYmd || formatDateYMD(new Date())
      
      const menuHistory = wx.getStorageSync('MENU_HISTORY') || []
      const todayMenuRecord = menuHistory.find(item => item.date === today)
  
      if (todayMenuRecord && todayMenuRecord.dishes) {
        const dishes = todayMenuRecord.dishes || []
        const formattedMenu = this.formatMenuForHomeDisplay(dishes)
        const mealExplain = this.generateMealExplanation(dishes)
        
        this.setData({
          todayMenu: formattedMenu,
          mealExplain: mealExplain
        })
        
        this.syncMenuToDietPage()
        console.log('V5.3 首页加载今日菜单成功:', formattedMenu.length, '道菜')
        
      } else {
        this.setData({
          todayMenu: [],
          mealExplain: ''
        })
        console.log('V5.3 今日无菜单，等待用户生成')
      }
      
    } catch (e) {
      console.error('V5.3 加载今日菜单失败:', e)
      this.setData({
        todayMenu: [],
        mealExplain: ''
      })
    }
  },

  updateCurrentPeople() {
    if (!featureFlags.peopleAdjust) return
    
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
    if (!featureFlags.peopleAdjust) return
    
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
    this.getPreciseLocation()
  },

  async refreshLocAndCity(force = false, doReverse = false, locOverride = null) {
    if (wx.getSystemInfoSync().platform === 'devtools') {
      locOverride = { lat: 39.9219, lng: 116.4436 }
      doReverse = true
    }
    
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

    const last = get(LOC_KEY, null)
    const movedKm = last?.loc ? haversine(last.loc, newLoc || {}) : Infinity
    const stale = last ? (Date.now() - last.ts > LOC_TTL) : true
    const needUpdate = force || !last || stale || (movedKm > MOVE_THRESHOLD_KM)

    if (newLoc) this.setData({ loc: newLoc })

    const DIRECT_CITIES = ['北京', '上海', '重庆', '天津']
    const clean = s => (s || '').replace(/省|市|自治区|特别行政区|地区/g, '').trim()
    let geoDisplay = null
    let districtName = null

    if (doReverse && needUpdate && newLoc) {
      try {
        const { result } = await wx.cloud.callFunction({
          name: 'reverseGeocode',
          data: { lat: Number(newLoc.lat), lng: Number(newLoc.lng) }
        })

        if (result?.ok) {
          const province = clean(result?.province)
          const city = clean(result?.city)
          const district = clean(result?.district)
          const town = clean(result?.town)
          districtName = district || town || ''
          
          const isDirectCity = DIRECT_CITIES.includes(province)
          
          if (isDirectCity) {
            geoDisplay = district ? `${province}${district}` : province
          } else {
            geoDisplay = (city && district) ? `${city}·${district}` : (city || district || '')
          }

          if (geoDisplay) set(GEO_KEY, geoDisplay)
        }
      } catch (e) {}
      set(LOC_KEY, { ts: Date.now(), loc: newLoc })
    }

    const cachedGeo = get(GEO_KEY, null)
    const profCity = get(KEY.PROFILE, {})?.city?.name || null
    const weatherCityFallback = cityByFallback || profCity || (cityFallback?.name) || '北京'

    const displayName = doReverse 
      ? (geoDisplay || cachedGeo || weatherCityFallback)
      : (hadPrecise ? (cachedGeo || this.data.cityName || weatherCityFallback) : weatherCityFallback)

    let rawWeather = {}
    const useLoc = newLoc && newLoc.lat && newLoc.lng
    
    const latTag = useLoc ? `${(+newLoc.lat).toFixed(2)},${(+newLoc.lng).toFixed(2)}` : ''
    const cacheKey = useLoc 
      ? `WEATHER_CACHE_LOC_${latTag}` 
      : `WEATHER_CACHE_CITY_${districtName || displayName || 'default'}`

    try {
      if (useLoc) {
        rawWeather = await getWeatherByLoc(newLoc)
      } else {
        rawWeather = await getWeatherByCity(displayName)
      }
    } catch (e) {
      console.warn('天气获取失败:', e)
      try {
        const cache = wx.getStorageSync(cacheKey)
        if (cache && (Date.now() - cache.timestamp < 3600000)) {
          rawWeather = cache.data
        }
      } catch (_) {}

      if (!rawWeather || !rawWeather.now) {
        rawWeather = {
          now: { text: '多云', temp: '20', code: 'cloudy', icon: '104' },
          daily: { max: '25', min: '15' },
          cityName: displayName
        }
      }
    }

    const weather = normalizeWeather(rawWeather, newLoc)
    const weatherTheme = detectWeatherTheme(weather, newLoc)
    const iconCode = weather.now.icon || weatherTheme.iconCode
    const weatherIconUrl = getRemoteIconUrl(iconCode)

    try {
      wx.setStorageSync(cacheKey, { data: weather, timestamp: Date.now() })
    } catch (_) {}

    this.setData({
      weather,
      cityName: displayName,
      preciseShown: doReverse ? true : this.data.preciseShown,
      weatherTheme,
      weatherIconUrl
    })

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
      this.setData({ raindrops: [], stars: [] })
      return
    }
  
    const type = weatherTheme.type;
  
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
      this.setData({ raindrops: [], stars: [] })
    }
  },

  createRaindrops() {
    const base = 50
    const k = Math.max(1, this.data.debugIntensity || 1)
    const density = Math.min(base * k, 120)
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
    this.setData({ raindrops, stars: [] })
  },

  createSnowflakes() {
    const k = Math.max(1, this.data.debugIntensity || 1)
    const base = 24
    const density = Math.min(Math.round(base * (0.9 + k * 0.6)), 120)
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
    this.setData({ raindrops: snowflakes, stars: [] })
  },

  createStars() {
    if (!this.data.weatherTheme.showStars) {
      this.setData({ stars: [] })
      return
    }
    
    const density = 40
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
    this.setData({ stars, raindrops: [] })
  },

  createHailEffect() {
    const density = 25
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
    this.setData({ raindrops: hailstones, stars: [] })
  },

  createSleetEffect() {
    const density = 35
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
    this.setData({ raindrops: mixed, stars: [] })
  },

  updateAIGreeting() {
    const { weather, profile, lunar, holiday, dateYmd } = this.data
    
    const appSettings = get('APP_SETTINGS', { show_daily_quote: true })
    if (!appSettings.show_daily_quote) {
      this.setData({ aiGreeting: '' })
      return
    }
    
    let solarTermName = weather?.solar_term || ''
    if (!solarTermName && featureFlags.solarTerm) {
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
      console.error('V5.3语气生成失败:', e)
      this.setData({ aiGreeting: '今天也要元气满满哦' })
    }
    
    this.createWeatherAnimations()
    collectDailyData({ type: 'ai_greeting' })
  },

  async onShow() {
    track(EVENTS.home_view)
    const now = new Date()
    const dateYmd = formatDateYMD(now)
    const weekday = weekdayCN(now)

    let lunar = {}; let solarTerm = {}; let lunarText = ''; let solarTermText = ''
    
    if (featureFlags.lunarGanzhi) {
      try {
        lunar = await getLunarInfo(dateYmd)
        if (lunar && lunar.lunarYear) {
          const ganzhi = ganzhiOfYear(lunar.lunarYear)
          if (lunar.lunarDate && !lunar.lunarDate.includes('年')) {
            // ✅ 去掉所有空格
            const cleanLunarDate = (lunar.lunarDate || '').replace(/\s+/g, '')
            lunarText = `${ganzhi}年${cleanLunarDate}`
          }
        }
      } catch (_) {}
    }
    
    if (featureFlags.solarTerm) {
      try {
        solarTerm = getCurrentSolarTerm(dateYmd)
        if (solarTerm?.name) {
          solarTermText = `${solarTerm.emoji} ${solarTerm.name}`
        }
      } catch (_) {}
    }

    let holiday = {}; let holidayBadge = ''
    if (featureFlags.holiday) {
      try {
        holiday = isInRange(dateYmd) || {}
        if (holiday?.name) {
          holidayBadge = `🎉 ${holiday.name}`
        }
      } catch (_) {}
    }

    await this.refreshLocAndCity(false, true)

    let events = []
    if (featureFlags.eventsCard) {
      const todayDate = new Date(dateYmd)
      const seven = new Date(todayDate); seven.setDate(todayDate.getDate() + 7)
      try {
        const _ = db.command
        const r = await db.collection('events')
          .where({ time: _.gte(ymd(todayDate)).and(_.lte(ymd(seven))) })
          .orderBy('pin', 'desc').orderBy('time', 'asc').get()
        events = r.data || []
      } catch (e) {}
    }

    this.setData({
      dateYmd,
      weekday,
      lunar,
      lunarText,
      holiday,
      holidayBadge,
      solarTerm,
      solarTermText,
      events
    })

    this.updateCurrentPeople()
    this.loadTodayMenu()
  },

  onPullDownRefresh() {
    this.refreshLocAndCity(true, false).finally(() => wx.stopPullDownRefresh())
  },

  goAddEvent() {
    if (!featureFlags.eventsCard) return
    wx.navigateTo({ url: '/pages/events/edit' })
  },

  openWeather() {
    track(EVENTS.weather_card_click)
  },

  goDiet() {
    console.log('准备跳转到饮食页面并生成菜单')
    collectDailyData({ type: 'menu_generation' })
    
    wx.setStorageSync('AUTO_GENERATE_MENU', {
      trigger: 'home_click',
      timestamp: Date.now()
    })
    
    wx.switchTab({ 
      url: '/pages/diet/index',
      success: function() {
        console.log('✅ 跳转到饮食页面成功')
      },
      fail: function(err) {
        console.error('❌ 跳转失败:', err)
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
    if (!featureFlags.askSub) return
    
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

  formatMenuForHomeDisplay: function(dishes) {
    if (!Array.isArray(dishes) || dishes.length === 0) {
      return []
    }
    
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

  generateMealExplanation: function(dishes) {
    if (!dishes || dishes.length === 0) {
      return '今天还没有准备菜单哦'
    }
    
    const userDataV3 = this.data.userDataV3 || {}
    const profile = userDataV3.profile || {}
    const weather = this.data.weather || {}
    const solarTerm = this.data.solarTerm || {}
    
    const enrichedDishes = dishes.map(dish => {
      if (dish.reason) return dish;
      
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
        dish.reason = generateDishReason(ctx, dish)
      } catch (e) {
        console.error('AI理由生成失败:', e)
        dish.reason = '营养搭配不错'
      }
      
      return dish
    })
    
    const dishNames = enrichedDishes.slice(0, 2).map(dish => 
      dish.name || dish.title || '菜品'
    )
    
    if (enrichedDishes.length === 1) {
      return enrichedDishes[0].reason
    }
    
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
    
    const tone = this.mapAiToneToEnum(profile.ai_tone || '温柔')
    
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

  syncMenuToDietPage: function() {
    const { todayMenu, mealExplain, weather, solarTerm, userDataV3 } = this.data
    
    try {
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
        
        if (!dish.reason) {
          dish.reason = generateDishReason(dish, context)
        }
        
        return dish
      })
      
      wx.setStorageSync('HOME_MENU_CACHE', {
        menu: enrichedMenu,
        explain: mealExplain,
        timestamp: Date.now(),
        date: this.data.dateYmd
      })
      
      console.log('V5.3菜单已同步到diet页面，包含AI理由')
    } catch (e) {
      console.error('同步菜单数据失败:', e)
    }
  },

  mapAiToneToEnum: function(toneStr) {
    const toneMap = {
      '温柔': TONE.GENTLE,
      '简练': TONE.CONCISE,
      '幽默': TONE.HUMOROUS
    }
    return toneMap[toneStr] || TONE.GENTLE
  }
})