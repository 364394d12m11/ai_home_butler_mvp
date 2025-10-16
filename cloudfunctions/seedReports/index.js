// cloudfunctions/seedReports/index.js
// ✅ 支持两种解锁：环境变量 SEED_LOCK=unlock-dev 或 调用时 data.unlock='dev'

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const pad = n => String(n).padStart(2, '0')
const ymd = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`
const nowCN = () => new Date(Date.now() + 8*3600*1000)

function startOfWeekCN(d){ const t=new Date(d.getTime()); const w=t.getUTCDay()||7; t.setUTCDate(t.getUTCDate()-(w-1)); return t }
function endOfWeekCN(dMon){ const t=new Date(dMon.getTime()); t.setUTCDate(t.getUTCDate()+6); return t }
function monthRangeCN(d){ const s=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)); const e=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)); return {s,e} }

function isUnlocked(event){
  return process.env.SEED_LOCK === 'unlock-dev' || (event && event.unlock === 'dev')
}

exports.main = async (event) => {
  if (!isUnlocked(event)) return { ok:false, blocked:true, reason:'locked' }

  const { OPENID } = cloud.getWXContext()

  // 可选：只清理当前用户的种子
  if (event?.reset) {
    await db.collection('reports').where({ _openid: OPENID }).remove().catch(()=>{})
  }

  const today = nowCN()
  const dayStr = ymd(today)

  // 周范围（本周）
  const mon = startOfWeekCN(today), sun = endOfWeekCN(mon)
  const sW = ymd(mon), eW = ymd(sun)

  // 月范围（本月）
  const { s, e } = monthRangeCN(today)
  const sM = ymd(s), eM = ymd(e)

  const docs = [
    // —— 日报（与你现有结构一致）——
    {
      type:'day',
      ymd: dayStr,
      title: dayStr,
      range:{ from: dayStr, to: dayStr },
      displayRange: dayStr,
      stats:{ total:1, pinned:1 },
      total:1, pinned:1,
      events:[{ title:'示例·置顶事项', time: dayStr, type:'其它', pin:true }],
      suggestions:['节奏平稳，保持当日专注。'],
      _openid: OPENID, ts: Date.now()
    },
    // —— 周报 —— 
    {
      type:'week',
      ymd: sW, // 周一作为锚点
      title:`${mon.getUTCFullYear()}年第${Math.ceil((((mon - Date.UTC(mon.getUTCFullYear(),0,1))/86400000) + (new Date(Date.UTC(mon.getUTCFullYear(),0,1)).getUTCDay()||7))/7)}周`,
      range:{ from: sW, to: eW },
      displayRange:`${sW} ~ ${eW}`,
      stats:{ total:2, pinned:1 },
      total:2, pinned:1,
      events:[
        { title:'示例·周计划A', time:sW, type:'学习', pin:true },
        { title:'示例·周计划B', time:eW, type:'其它', pin:false }
      ],
      suggestions:['本周共有 1 条置顶事件，优先完成。'],
      _openid: OPENID, ts: Date.now()
    },
    // —— 月报 —— 
    {
      type:'month',
      ymd: eM, // 月末作为锚点
      title:`${e.getUTCFullYear()}年${e.getUTCMonth()+1}月`,
      range:{ from: sM, to: eM },
      displayRange:`${sM} ~ ${eM}`,
      stats:{ total:3, pinned:1, byType:{ 学习:1, 其它:2 } },
      total:3, pinned:1,
      events:[
        { title:'示例·月目标A', time:sM, type:'学习', pin:true },
        { title:'示例·月目标B', time:eM, type:'其它', pin:false },
        { title:'示例·月目标C', time:sM, type:'其它', pin:false }
      ],
      suggestions:['本月累计记录 3 条事件。'],
      _openid: OPENID, ts: Date.now()
    }
  ]

  let inserted = 0
  for (const doc of docs) {
    await db.collection('reports').add({ data: doc }).then(()=>inserted++).catch(()=>{})
  }
  return { ok:true, inserted }
}
