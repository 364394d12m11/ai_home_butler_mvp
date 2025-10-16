// cloudfunctions/notifySchedule/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// ------- 填你自己的订阅模板（已验证通过的那个）-------
const TEMPLATE_ID = '【把你的模板ID粘到这里】'   // 必填：来自“我的模板”的真实ID
// 关键词映射：按你当前模板（thing1 / time2 / thing3）
const KEYS = { title: 'thing1', date: 'time2', tip: 'thing3' }
// 推送落地页
const NOTIFY_PAGE = '/pages/events/list'

// ------- 小工具 -------
const pad   = n => String(n).padStart(2, '0')
const ymd   = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const parse = s => new Date(`${s}T00:00:00+08:00`)
const add   = (s, n) => ymd(new Date(parse(s).getTime() + n*86400000))
const diff  = (a, b) => Math.round((parse(a) - parse(b)) / 86400000)
const daysBetween = (aDate, bDate) => Math.round((aDate - bDate) / 86400000)
const clip20 = s => String(s || '').slice(0, 20)

// 月天数 & 安全日期
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate()
const safeDate = (y, m, d) => new Date(y, m, Math.min(d, daysInMonth(y, m)))

// ---- 计算下一次发生日（基于锚点 e.time）----
const nextWeekly  = (base, today) => { // 同星期几；今天也算
  const w0 = base.getDay(), w1 = today.getDay()
  const addDay = (w0 - w1 + 7) % 7
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + addDay)
}
const nextMonthly = (base, today) => { // 同日期；今天也算
  const d = base.getDate()
  let cand = safeDate(today.getFullYear(), today.getMonth(), d)
  if (cand < today) cand = safeDate(today.getFullYear(), today.getMonth() + 1, d)
  return cand
}
const nextYearly  = (base, today) => { // 同月日；今天也算（2/29 → 当年2月最后一天）
  const m = base.getMonth(), d = base.getDate()
  let cand = safeDate(today.getFullYear(), m, d)
  if (cand < today) cand = safeDate(today.getFullYear() + 1, m, d)
  return cand
}

exports.main = async (event) => {
  const db = cloud.database()
  const _  = db.command

  // 今天（东八区） & 近7天窗口（用于一次性事件查询）
  const today = event?.today || ymd(new Date(Date.now() + 8*3600*1000))
  const until = add(today, 7)
  const todayDate = parse(today)

  // ---- 取数据：一次性 + 重复事件 ----
  // 一次性：近7天内 & 有相对提醒
  const { data: near = [] } = await db.collection('events')
    .where({ time: _.gte(today).and(_.lte(until)), remind: _.in(['DAY0','T-1','T-3']) })
    .field({ title:1, time:1, type:1, remind:1, _openid:1 })
    .orderBy('pin','desc').orderBy('time','asc')
    .get()

  // 重复：每周/每月/每年（不限制 time 范围）
  const { data: recur = [] } = await db.collection('events')
    .where({ remind: _.in(['WEEK','MONTH','YEAR']) })
    .field({ title:1, time:1, type:1, remind:1, _openid:1 })
    .orderBy('pin','desc').orderBy('time','asc')
    .get()

  // ---- 命中规则：生成 due（含去重）----
  const due = []
  const seen = new Set()

  // 一次性：按天差命中
  for (const e of near) {
    const d = diff(e.time, today)
    if ((e.remind==='DAY0' && d===0) ||
        (e.remind==='T-1'  && d===1) ||
        (e.remind==='T-3'  && d===3)) {
      const key = `${e._openid}|${e.title}|${e.time}|${e.remind}`
      if (!seen.has(key)) {
        seen.add(key)
        due.push({ _openid:e._openid, title:e.title, time:e.time, type:e.type || '提醒', when:e.remind })
      }
    }
  }

  // 重复：命中本次发生日 & 提前 T-1 / T-3（都支持）
  for (const e of recur) {
    const base = parse(e.time)
    let next
    if (e.remind === 'WEEK')  next = nextWeekly(base, todayDate)
    if (e.remind === 'MONTH') next = nextMonthly(base, todayDate)
    if (e.remind === 'YEAR')  next = nextYearly(base, todayDate)

    const daysTo = daysBetween(next, todayDate) // 0=当天，1/3=提前天数
    if (daysTo === 0 || daysTo === 1 || daysTo === 3) {
      // 这次提醒使用“本次发生日”的日期
      const dateStr = ymd(next)
      const tag = (daysTo === 0 ? e.remind : `T-${daysTo}`)
      const key = `${e._openid}|${e.title}|${dateStr}|${tag}`
      if (!seen.has(key)) {
        seen.add(key)
        due.push({ _openid:e._openid, title:e.title, time: dateStr, type:e.type || '提醒', when: tag })
      }
    }
  }

  // 触发日志（可选）
  try{ await db.collection('trigger_logs').add({ data:{ ts:Date.now(), today, due: due.length } }) }catch(_){}

  // 未配置模板 → 只返回统计
  if (!TEMPLATE_ID) return { today, due, sent:0, skipped:0, disabled:true, errs:[], templateUsed:'', keysUsed: KEYS }

  // ---- 发送订阅消息 ----
  let sent = 0, skipped = 0
  const errs = []
  const tasks = []

  for (const e of due) {
    if (!e._openid) { skipped++; continue }

    const data = {}
    data[KEYS.title] = { value: clip20(e.title) }
    // time2/time3 需“日期+时分”；这里统一补 08:00
    data[KEYS.date]  = { value: `${e.time} 08:00` }
    data[KEYS.tip]   = { value: clip20(e.type || '提醒') }

    tasks.push(
      cloud.openapi.subscribeMessage.send({
        touser: e._openid,
        templateId: TEMPLATE_ID,
        page: NOTIFY_PAGE,
        data
      }).then(()=>{ sent++ })
        .catch(err=>{
          if (err?.errCode === 43101) skipped++   // 用户未订阅
          else errs.push({ code: err.errCode || -1, msg: String(err.errMsg||err) })
        })
    )
  }

  await Promise.all(tasks)
  return { today, due, sent, skipped, disabled:false, errs, templateUsed: TEMPLATE_ID, keysUsed: KEYS }
}
