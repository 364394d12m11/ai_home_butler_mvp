// cloudfunctions/getDailyTip/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const { OPENID } = cloud.getWXContext()
    let weather = event.weather || null
    let holiday = event.holiday || null
    let profile = null

    // 1) 天气（优先复用你已有的 getWeather）
    if (!weather) {
      try {
        const r = await cloud.callFunction({ name: 'getWeather', data: { type: 'now' } })
        weather = r?.result || null
      } catch (_) {}
    }

    // 2) 今日节日（复用 getHolidays）
    if (!holiday) {
      try {
        const r = await cloud.callFunction({ name: 'getHolidays', data: { range: 'today' } })
        holiday = r?.result || null
      } catch (_) {}
    }

    // 3) 画像（可无，自动降级）
    try {
      const r = await db.collection('profiles').doc(OPENID).get()
      profile = r.data || null
    } catch (_) {}

    const tips = generateTips({ weather, holiday, profile })
    return { ok: true, tips }
  } catch (err) {
    return { ok: false, error: String(err?.message || err) }
  }
}

// —— 规则引擎（先简单，后面再丰富）——
function generateTips({ weather, holiday, profile }) {
  const tips = []

  const now = weather?.now || weather
  const temp = num(now?.temp)
  const high = num(weather?.high ?? weather?.forecast?.[0]?.high)
  const low  = num(weather?.low  ?? weather?.forecast?.[0]?.low)
  const text = (now?.text || now?.phenomenon || '').toString()

  // 天气建议
  if (!isNaN(low) && low <= 5) tips.push('今日气温偏低，出门加件外套，孩子带帽子/围巾。')
  if (!isNaN(high) && high >= 30) tips.push('今日偏热，准备清爽衣物与充足饮水，户外注意防晒。')
  if (/雨|雪/.test(text)) tips.push('有降水概率，随身带伞，接送行程预留10–15分钟。')

  // 节日/调休提示（如果有）
  const holidayName = holiday?.name || holiday?.todayName
  if (holidayName) tips.push(`临近/处于 ${holidayName}，部分机构作息可能调整，相关安排请提前确认。`)

  // 画像小规则（没有画像也不会报错）
  const spicyMax = profile?.diet?.spicyMax
  const quick    = profile?.diet?.quick ?? true
  if (quick) tips.push('今晚菜单建议“快手两荤一素”，省时不将就。')
  if (spicyMax === 0) tips.push('家庭口味不吃辣，今天菜单避开辣椒与花椒。')

  // 去重&限量
  const uniq = []
  for (const t of tips) if (t && !uniq.includes(t)) uniq.push(t)
  return uniq.slice(0, 3)
}

function num(v){ const n = Number(v); return isNaN(n) ? NaN : n }
