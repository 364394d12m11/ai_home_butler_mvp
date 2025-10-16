// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { tag, limit = 10, random = false } = event

  let query = db.collection('recipes')
  if (tag) query = query.where({ tags: db.command.elemMatch(tag) })

  if (random) {
    const countRes = await db.collection('recipes').count()
    const total = countRes.total
    const skip = Math.max(0, Math.floor(Math.random() * (total - limit)))
    const res = await query.skip(skip).limit(limit).get()
    return { ok: true, items: res.data }
  } else {
    const res = await query.limit(limit).get()
    return { ok: true, items: res.data }
  }
}
