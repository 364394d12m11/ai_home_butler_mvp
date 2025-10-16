// 2025 中国法定节假日+调休（示例）
const HOLIDAYS = {
  ranges: [
    { name:'国庆节', start:'2025-10-01', end:'2025-10-07', off:true },
  ],
  makeups: [
    { date:'2025-09-27' }, { date:'2025-09-28' }
  ],
  lunar: [
    { name:'春节', lunar:'正月初一' },
    { name:'元宵', lunar:'正月十五' },
    { name:'清明', term:'清明' },
    { name:'端午', lunar:'五月初五' },
    { name:'中秋', lunar:'八月十五' },
    { name:'重阳', lunar:'九月初九' }
  ]
}

export function isInRange(ymd){
  const t = new Date(ymd)
  return HOLIDAYS.ranges.find(r => t >= new Date(r.start) && t <= new Date(r.end))
}
export function isMakeup(ymd){
  return !!HOLIDAYS.makeups.find(m=>m.date===ymd)
}
export { HOLIDAYS }
