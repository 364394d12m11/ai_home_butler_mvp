// cloudfunctions/cronDailyReport/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// —— 放在文件顶部或函数上方 —— //
const pad = n => String(n).padStart(2, '0')
// 生成“北京时间今天”的 YYYY-MM-DD：把当前时间 +8h，再用 UTC 的年月日取值
const ymdCNNow = () => {
  const t = new Date(Date.now() + 8*3600*1000)
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth()+1)}-${pad(t.getUTCDate())}`
}

exports.main = async (event) => {
  // 传了 today 就直接用（不要再 new Date 解析）
  const dayStr = (event && event.today) ? event.today : ymdCNNow()


// 原来：db.collection('events').where({ time: dayStr }).aggregate()...（错）
// 改成：
const agg = await db.collection('events')
  .aggregate()
  .match({ time: dayStr })
  .group({ _id: '$_openid' })
  .end()

const users = (agg?.list || []).map(x => x._id)

  let inserted = 0, updated = 0
  for (const oid of users) {
    // 3) 拉取该用户当天事件，置顶优先、时间升序
    const evRes = await db.collection('events')
      .where({ _openid: oid, time: dayStr })
      .orderBy('pin','desc').orderBy('time','asc')
      .field({ title:1, time:1, type:1, pin:1 })
      .get().catch(()=>({data:[]}))
    const events = evRes.data || []

    // 4) 统计
    const stats = {
      total: events.length,
      pinned: events.filter(x=>!!x.pin).length
    }

    // 5) 建议（最小规则；后续可替换为你的 genReport 逻辑）
    const suggestions = []
    if (stats.total === 0) suggestions.push('今天没有记录事件，抽空把重要事项补上。')
    if (stats.pinned >= 3) suggestions.push('置顶较多，建议压缩优先级，先做最重要的 1-2 件事。')
    if (!suggestions.length) suggestions.push('节奏平稳，保持当日专注。')

    // 6) 组装文档（与周/月报同结构）
    const doc = {
      type: 'day',
      ymd: dayStr,
      title: dayStr,
      range: { from: dayStr, to: dayStr },
      displayRange: dayStr,
      total: stats.total,
      pinned: stats.pinned,
      stats,
      events: events.map(e => ({
        title: e.title,
        time: e.time,
        type: e.type || '',
        pin: !!e.pin
      })),
      suggestions,
      _openid: oid,
      ts: Date.now()
    }

    // 7) upsert：_openid + type + ymd 唯一
    const exist = await db.collection('reports')
      .where({ _openid: oid, type: 'day', ymd: dayStr })
      .limit(1).get()
    if (exist.data?.length) {
      await db.collection('reports').doc(exist.data[0]._id).update({ data: doc })
      updated++
    } else {
      await db.collection('reports').add({ data: doc })
      inserted++
    }
  }

  // 8) 记录触发日志（可选）
  await db.collection('trigger_logs').add({ data: {
    name: 'cronDailyReport',
    ts: Date.now(),
    ymd: dayStr,
    users: users.length,
    inserted, updated
  }}).catch(()=>{})

  return { ok: true, ymd: dayStr, users: users.length, inserted, updated }
}
