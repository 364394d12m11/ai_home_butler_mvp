// miniprogram/utils/datetime.js
function formatDateYMD(d = new Date()) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function weekdayCN(d = new Date()) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
}

function addDays(d, n) {
  const t = new Date(d)
  t.setDate(t.getDate() + n)
  return t
}

function within7Days(date) {
  const now = new Date()
  const target = new Date(date)
  const diff = (target - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000
  return diff >= 0 && diff <= 7
}

function getCurrentHour() {
  return new Date().getHours()
}

function isCustomizeTime() {
  const hour = getCurrentHour()
  return hour >= 20 && hour <= 23
}

// 判断当前是哪一餐时段
function getMealPeriod() {
  const hour = getCurrentHour()
  const day = new Date().getDay() // 0=周日, 6=周六
  const isWeekend = day === 0 || day === 6
  
  // Brunch时段判断
  if (hour >= 9.5 && hour < 11) return 'brunch'
  if (isWeekend && hour >= 9.5 && hour < 12) return 'brunch'
  
  // 常规时段
  if (hour >= 6 && hour < 9.5) return 'breakfast'
  if (hour >= 11 && hour < 14) return 'lunch'
  if (hour >= 14 && hour < 18) return 'afternoon' 
  if (hour >= 18 && hour < 21) return 'dinner'
  return 'night' // 21点后推荐次日三餐
}

// 获取推荐意图（用户想定制哪一餐）
function getRecommendIntent() {
  const period = getMealPeriod()
  const intentMap = {
    'breakfast': 'breakfast',
    'brunch': 'brunch',
    'lunch': 'lunch', 
    'afternoon': 'dinner',
    'dinner': 'dinner',
    'night': 'tomorrow' // 次日三餐
  }
  return intentMap[period]
}

// 判断是否周末/假期
function isWeekendOrHoliday() {
  const day = new Date().getDay()
  return day === 0 || day === 6
  // TODO: 后续接入 holiday.js 判断法定节假日
}

// 获取时段文案
function getPeriodText() {
  const period = getMealPeriod()
  const textMap = {
    'breakfast': '早餐',
    'brunch': '早午餐',
    'lunch': '午餐',
    'afternoon': '晚餐',
    'dinner': '晚餐',
    'night': '明日三餐'
  }
  return textMap[period]
}
  // 在文件末尾添加：
  const TIAN_GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const DI_ZHI   = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  
  /**
   * 传入农历年(数字)，返回干支纪年，如 "乙巳"
   * 说明：公历1984年甲子，故 (year - 1984) % 60 对齐到 0=甲子
   */
  function ganzhiOfYear(lunarYear) {
    const offset = (lunarYear - 1984) % 60;
    const idx = (offset + 60) % 60;
    const gan = TIAN_GAN[idx % 10];
    const zhi = DI_ZHI[idx % 12];
    return gan + zhi;
  }
  
// 使用 CommonJS 导出
module.exports = {
  formatDateYMD,
  weekdayCN,
  addDays,
  within7Days,
  getCurrentHour,
  isCustomizeTime,
  getMealPeriod,        // 新增
  getRecommendIntent,   // 新增
  isWeekendOrHoliday,   // 新增
  getPeriodText,         // 新增
  ganzhiOfYear  // 新增
}