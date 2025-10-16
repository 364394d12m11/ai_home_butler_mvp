export function buildDailyTips({ weather, holiday, profile }){
  const tips = []
  const t = Number(weather?.now?.temp)
  const max = Number(weather?.daily?.max)
  const min = Number(weather?.daily?.min)
  const text = String(weather?.now?.text || '')

  // 规则（取前2条）
  if (text.includes('雨')) tips.push('带伞 · 路滑慢行')
  if (!Number.isNaN(max) && !Number.isNaN(min) && max - min >= 8) tips.push('早晚温差大 · 出门加外套')
  if (!Number.isNaN(t) && t >= 30) tips.push('炎热 · 少油少辣，多补水')
  if (!Number.isNaN(t) && t <= 10) tips.push('偏冷 · 晚上加一份热汤')
  if (holiday?.name) tips.push(`临近${holiday.name} · 提前准备礼物/祝福`)
  if (profile?.diet?.quick) tips.push('时间紧 · 今晚用「快手菜」≤20分钟')

  return tips.slice(0,2)
}
