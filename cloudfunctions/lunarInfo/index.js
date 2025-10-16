const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const solarlunar = require('solarlunar')

exports.main = async (event) => {
  const date = event?.date
  if (!date) return { lunarDate:'', lunarFestival:'', lunarYear: null, _msg:'no date' }
  const [y,m,d] = date.split('-').map(Number)
  const o = solarlunar.solar2lunar(y, m, d)

  const mCn = o.lMonthCn || o.IMonthCn || o.monthCn || ''
  const dCn = o.lDayCn   || o.IDayCn   || o.dayCn   || ''
  const fest = o.festival || o.lunarFestival || o.term || ''
  const lunarYear = o.lYear || o.IYear || o.year || y  // 添加农历年

  return { 
    lunarDate: `${mCn}${dCn}`, 
    lunarFestival: fest,
    lunarYear: lunarYear  // 新增字段
  }
}