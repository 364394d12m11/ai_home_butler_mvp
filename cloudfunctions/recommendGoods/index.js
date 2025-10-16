// cloudfunctions/recommendGoods/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const pad = n => String(n).padStart(2,'0')
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  try {
    // 只取当前用户的数据（避免拿到别人的数据）
    const [profRes, invRes, catRes] = await Promise.all([
      db.collection('profiles').where({ _openid: OPENID }).limit(1).get(),
      db.collection('inventory').where({ _openid: OPENID }).get(),
      db.collection('catalog').where({ _openid: OPENID }).get()
    ])

    const profile = (profRes.data && profRes.data[0]) || {}
    const catalogMap = new Map(catRes.data.map(x => [x.name, x]))

    const items = []
    for (const it of invRes.data || []) {
      const qty = Number(it.qty || 0)
      const thr = Number(it.threshold || 0)
      const use = Number(it.dailyUse || 0)

      const leftDays = use > 0 ? qty / use : 9999
      const need = qty <= thr || leftDays < 7
      if (!need) continue

      const sku = catalogMap.get(it.name) || {}
      const suggestQty = Math.max(1, Math.ceil(Math.max(0, 7 - leftDays) * use)) || (thr || 1)

      items.push({
        name: it.name,
        reason: qty <= thr ? '低于阈值' : '7天内不够用',
        suggestQty,
        price: sku.price || 0,
        brand: sku.brand || '',
        img: sku.img || '',
        invId: it._id,
        curQty: qty
      })
    }

    return { ok: true, date: ymd(new Date(Date.now()+8*3600*1000)), items, bias: profile.qualityBias || [] }
  } catch (err) {
    console.error('recommendGoods error:', err)
    return { ok: false, error: String(err && err.message || err) }
  }
}
