const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  const db = cloud.database()
  // 创建集合（已存在就忽略）
  await db.createCollection('events').catch(()=>{})
  await db.createCollection('trigger_logs').catch(()=>{})
  // 写一条示例数据（今天）
  const today = new Date(); const pad=n=>String(n).padStart(2,'0')
  const ymd = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`
  await db.collection('events').add({ data:{ title:'测试提醒', time: ymd, remind:'DAY0', ts: Date.now() } })
  await db.collection('trigger_logs').add({ data:{ ts: Date.now(), note:'bootstrap ok' } })
  return { ok:true }
}
