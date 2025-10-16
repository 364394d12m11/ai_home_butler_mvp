// cloudfunctions/cronWeeklyReport/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ===== 小工具（东八区安全） =====
const pad = n => String(n).padStart(2, '0')
// 把“现在”视为北京时间（+8h 后用 UTC getter 取年月日）
const nowCN = (offsetDays = 0) => new Date(Date.now() + (8 + offsetDays * 24) * 3600 * 1000)
const ymdFromDateCN = d => {
  // 传入一个 Date（已是东八区基准），输出 YYYY-MM-DD
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
const toCNDate = (ymd) => new Date(`${ymd}T00:00:00+08:00`) // 'YYYY-MM-DD' -> 东八区 Date

// 周一为起点的周区间
function startOfWeekCN(d) {
  const t = new Date(d.getTime())
  const w = t.getUTCDay() === 0 ? 7 : t.getUTCDay() // 周日=0 => 7
  t.setUTCDate(t.getUTCDate() - (w - 1))
  return t
}
function endOfWeekCN(dMon) {
  const t = new Date(dMon.getTime())
  t.setUTCDate(t.getUTCDate() + 6)
  return t
}
function weekNoCN(d) {
  // 简易展示用周序号
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const diffDays = Math.floor((d - yearStart) / 86400000)
  return Math.ceil((diffDays + (yearStart.getUTCDay() || 7)) / 7)
}

// 简易建议
function buildWeekTips(stats) {
  const tips = []
  if (!stats.total) tips.push('本周没有记录事件，别忘了添加重要事项。')
  if (stats.pinned) tips.push(`本周共有 ${stats.pinned} 条置顶事件，保持专注。`)
  return tips.length ? tips : ['保持当周节奏，优先完成置顶事项。']
}

exports.main = async (event) => {
  // ===== 1) 基准日期 =====
  // 如果传了 event.today（'YYYY-MM-DD'），用它；否则用“北京时间的今天”
  // 想要“周一早上生成上周总结”，把 baseOffsetDays 设为 -1（默认就是 -1）
  const baseOffsetDays = (event && typeof event.baseOffsetDays === 'number') ? event.baseOffsetDays : -1
  const baseDate = event && event.today
    ? toCNDate(event.today)
    : nowCN(baseOffsetDays)

  // 计算本次统计的周一/周日 & 文本
  const mon = startOfWeekCN(baseDate)
  const sun = endOfWeekCN(mon)
  const sY = ymdFromDateCN(mon)
  const eY = ymdFromDateCN(sun)
  const title = `${mon.getUTCFullYear()}年第${weekNoCN(baseDate)}周`
  const displayRange = `${sY} ~ ${eY}`

  // ===== 2) 找这一周内“有事件”的用户（聚合） =====
  const aggRes = await db.collection('events')
    .aggregate()
    .match({ time: _.gte(sY).and(_.lte(eY)) })
    .group({ _id: '$_openid' })
    .end()
  const users = (aggRes && aggRes.list ? aggRes.list : []).map(x => x._id) // ← 只声明一次

  let inserted = 0, updated = 0

  // ===== 3) 逐用户生成/更新周报 =====
  for (const oid of users) {
    const evRes = await db.collection('events')
      .where({ _openid: oid, time: _.gte(sY).and(_.lte(eY)) })
      .field({ title: 1, time: 1, type: 1, pin: 1 })
      .orderBy('pin', 'desc').orderBy('time', 'asc')
      .get().catch(() => ({ data: [] }))

    const list = evRes.data || []
    const stats = { total: list.length, pinned: list.filter(x => !!x.pin).length }

    const doc = {
      type: 'week',
      ymd: sY, // 用周一做 ymd 锚点更稳（你列表按 ymd desc 排序）
      title,
      range: { from: sY, to: eY },
      displayRange,
      total: stats.total,
      pinned: stats.pinned,
      stats,
      events: list.map(x => ({ title: x.title, time: x.time, type: x.type || '', pin: !!x.pin })),
      suggestions: buildWeekTips(stats),
      _openid: oid,
      ts: Date.now()
    }

    const exist = await db.collection('reports')
      .where({ _openid: oid, type: 'week', ymd: sY })
      .limit(1).get()

    if (exist.data && exist.data.length) {
      await db.collection('reports').doc(exist.data[0]._id).update({ data: doc })
      updated++
    } else {
      await db.collection('reports').add({ data: doc })
      inserted++
    }
  }

  // ===== 4) 触发日志（可选） =====
  await db.collection('trigger_logs').add({
    data: { name: 'cronWeeklyReport', ts: Date.now(), users: users.length, inserted, updated, range: { from: sY, to: eY } }
  }).catch(() => {})

  return { ok: true, users: users.length, inserted, updated, range: { from: sY, to: eY } }
}
