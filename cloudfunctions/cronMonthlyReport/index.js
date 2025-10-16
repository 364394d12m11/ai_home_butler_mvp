// cloudfunctions/cronMonthlyReport/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _  = db.command

// ---- helpers（东八区安全）----
const pad = n => String(n).padStart(2,'0')
const toCNDate = ymd => new Date(`${ymd}T00:00:00+08:00`)
const ymdCN = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`

// 传入“东八区基准”的 Date，算当月起止（按 CN 月份）
function monthRangeCN(d){
  const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
  const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0))
  return { s, e }
}

exports.main = async (event)=>{
  // 基准：如果传 today 就用它；否则用北京时间“现在”
  const now = event?.today ? toCNDate(event.today) : new Date(Date.now()+8*3600*1000)
  // 统计“上个月”
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()-1, 15))
  const { s, e } = monthRangeCN(prev)
  const sY = ymdCN(s), eY = ymdCN(e)

  // 找该月有事件的用户
  const agg = await db.collection('events')
    .aggregate().match({ time: _.gte(sY).and(_.lte(eY)) })
    .group({ _id: '$_openid' }).end()
  const users = (agg?.list || []).map(x => x._id)

  let inserted = 0, updated = 0
  for (const oid of users) {
    const ev = await db.collection('events')
      .where({ _openid: oid, time: _.gte(sY).and(_.lte(eY)) })
      .field({ title:1, time:1, type:1, pin:1 })
      .orderBy('pin','desc').orderBy('time','asc')
      .get().catch(()=>({data:[]}))
    const list = ev.data || []

    // 统计（补上 byType，避免空对象报错）
    const byType = list.reduce((m,x)=>{ const k=x.type||'其它'; m[k]=(m[k]||0)+1; return m }, {})
    const stats = { total:list.length, pinned:list.filter(x=>x.pin).length, byType }

    const doc = {
      type: 'month',
      ymd: eY,                              // 用月末做排序锚点
      title: `${prev.getUTCFullYear()}年${prev.getUTCMonth()+1}月`,
      range: { from:sY, to:eY },
      displayRange: `${sY} ~ ${eY}`,
      total: stats.total,
      pinned: stats.pinned,
      stats,
      events: list.map(x => ({ title:x.title, time:x.time, type:x.type||'', pin:!!x.pin })),
      suggestions: buildMonthTips(stats),
      _openid: oid,
      ts: Date.now()
    }

    const exist = await db.collection('reports')
      .where({ _openid: oid, type:'month', ymd:eY }).limit(1).get()
    if (exist.data?.length) { await db.collection('reports').doc(exist.data[0]._id).update({ data: doc }); updated++ }
    else { await db.collection('reports').add({ data: doc }); inserted++ }
  }

  await db.collection('trigger_logs').add({
    data:{ name:'cronMonthlyReport', ts:Date.now(), users:users.length, inserted, updated, range:{from:sY,to:eY} }
  }).catch(()=>{})

  return { ok:true, users: users.length, inserted, updated, range:{from:sY,to:eY} }
}

function buildMonthTips(stats){
  const tips = []
  tips.push(`本月累计记录 ${stats.total} 条事件。`)
  if (stats.pinned) tips.push(`其中 ${stats.pinned} 条被置顶。`)
  const byType = stats.byType || {}
  if (Object.keys(byType).length > 1) tips.push('给不同类型分配固定时间块，会更高效。')
  return tips
}
