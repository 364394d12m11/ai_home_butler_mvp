// cloudfunctions/genReport/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// ===== 订阅模板：沿用你已验证的（thing1 / time2 / thing3） =====
const TEMPLATE_ID = process.env.REPORT_TMPL_ID || process.env.EVENT_TMPL_ID || '【可留空，直接复用 notifySchedule 的】'
const KEYS = { title: 'thing1', date: 'time2', tip: 'thing3' }
const NOTIFY_PAGE = '/pages/reports/index'   // 点击到“报告页”

// ===== 小工具 =====
const pad = n => String(n).padStart(2,'0')
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const parse = s => new Date(`${s}T00:00:00+08:00`)
const add   = (s, n) => ymd(new Date(parse(s).getTime() + n*86400000))
const diff  = (a, b) => Math.round((parse(a) - parse(b)) / 86400000)
const daysBetween = (aDate, bDate) => Math.round((aDate - bDate) / 86400000)
const clip20 = s => String(s || '').slice(0, 20)

const daysInMonth = (y,m)=> new Date(y, m+1, 0).getDate()
const safeDate = (y,m,d)=> new Date(y, m, Math.min(d, daysInMonth(y,m)))
const nextWeekly  = (base, today) => { const a=base.getDay(), b=today.getDay(); const k=(a-b+7)%7; return new Date(today.getFullYear(), today.getMonth(), today.getDate()+k) }
const nextMonthly = (base, today) => { const d=base.getDate(); let c=safeDate(today.getFullYear(), today.getMonth(), d); if(c<today) c=safeDate(today.getFullYear(), today.getMonth()+1, d); return c }
const nextYearly  = (base, today) => { const m=base.getMonth(), d=base.getDate(); let c=safeDate(today.getFullYear(), m, d); if(c<today) c=safeDate(today.getFullYear()+1, m, d); return c }

exports.main = async (event) => {
  const db = cloud.database()
  const _  = db.command

  const now8 = new Date(Date.now() + 8*3600*1000)
  const today = event?.today || ymd(now8)
  const tomorrow = add(today, 1)
  const todayDate = parse(today)

  // —— 拿事件：一次性 near + 重复 recur —— //
  const { data: near = [] } = await db.collection('events')
    .where({ time: _.gte(today).and(_.lte(add(today,7))), remind: _.in(['DAY0','T-1','T-3']) })
    .field({ title:1, time:1, type:1, remind:1, _openid:1 })
    .get()

  const { data: recur = [] } = await db.collection('events')
    .where({ remind: _.in(['WEEK','MONTH','YEAR']) })
    .field({ title:1, time:1, type:1, remind:1, _openid:1 })
    .get()

  // —— 计算：今日 & 明日 命中（一次性 + 重复）—— //
  const dueFor = (theDayStr)=>{
    const theDate = parse(theDayStr)
    const list = []
    // 一次性
    for (const e of near) {
      const d = diff(e.time, theDayStr)
      if (d === 0) list.push(e)
    }
    // 重复（当天命中）
    for (const e of recur) {
      const base = parse(e.time)
      let next
      if (e.remind==='WEEK')  next = nextWeekly(base, theDate)
      if (e.remind==='MONTH') next = nextMonthly(base, theDate)
      if (e.remind==='YEAR')  next = nextYearly(base, theDate)
      if (ymd(next) === theDayStr) list.push({ ...e, time: theDayStr })
    }
    return list
  }

  const todayList = dueFor(today)
  const tomList   = dueFor(tomorrow)

  // —— 生成建议（示例规则，简单直给）—— //
  const suggest = []
  if (tomList.length > 0) suggest.push({ title:'前置安排', reason:`明日有 ${tomList.length} 条事项`, action:'今天晚些时候确认分工/准备物品' })
  const hasFamily = todayList.some(e=>e.type==='家庭')
  if (hasFamily) suggest.push({ title:'家庭关怀', reason:'今日有家庭类事项', action:'给家人留个便签或短信提醒' })
  if (todayList.length===0 && tomList.length===0) suggest.push({ title:'轻松一天', reason:'今日/明日暂无重要事项', action:'安排一次短时运动或早睡' })

  // —— 入库：日报 —— //
  const doc = {
    type: 'daily',
    day: today,
    createdAt: Date.now(),
    stats: {
      today: { count: todayList.length, types: countByType(todayList) },
      tomorrow: { count: tomList.length, types: countByType(tomList) }
    },
    suggestions: suggest
  }
  await db.collection('reports').add({ data: doc }).catch(()=>{})

  // —— 推送：用同一张订阅模板（title/time/tip） —— //
  let sent = 0, skipped = 0; const errs = []
  if (TEMPLATE_ID) {
    // 取需要接收的人（今天/明天的 openid 去重）
    const openids = Array.from(new Set([ ...todayList, ...tomList ].map(x=>x._openid).filter(Boolean)))
    const summaryTip = `今日${todayList.length}条，明日${tomList.length}条`
    const data = o => ({
      [KEYS.title]: { value: '今日简报' },
      [KEYS.date]:  { value: `${today} 20:10` },     // 统一 20:10
      [KEYS.tip]:   { value: clip20(summaryTip) }
    })
    const tasks = openids.map(oid =>
      cloud.openapi.subscribeMessage.send({
        touser: oid, templateId: TEMPLATE_ID, page: NOTIFY_PAGE, data: data(oid)
      }).then(()=>{ sent++ }).catch(err=>{
        if (err?.errCode===43101) skipped++; else errs.push({ code: err.errCode||-1, msg:String(err.errMsg||err) })
      })
    )
    await Promise.all(tasks)
  }

  return { ok:true, day: today, stats: doc.stats, sent, skipped, errs }
}

// —— 小统计 —— //
function countByType(list){
  const m = {}
  for (const e of list) { const t = e.type || '其它'; m[t] = (m[t]||0) + 1 }
  return m
}
