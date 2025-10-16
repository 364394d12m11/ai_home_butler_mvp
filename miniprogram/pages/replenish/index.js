// pages/replenish/index.js
const { envId } = require('../../config/index')
const db = wx.cloud.database({ env: envId })
const _  = db.command  

Page({
  data: { loading: true, items: [] },

  async onLoad() {
    this.load()
  },

  goHistory(){ wx.navigateTo({ url:'/pages/replenish/history/index' }) },
  goNew(){ wx.navigateTo({ url:'/pages/replenish/new/index' }) },

  // ========== 加载补货清单 ==========
  async load() {
    this.setData({ loading: true })
    try {
      // 1) 系统推荐的补货
      const { result } = await wx.cloud.callFunction({ name: 'recommendGoods' })
      let items = result?.items || []

      // 2) 加载手动补货需求
      const r = await db.collection('replenish_demand')
        .where({ status: 'open' })
        .orderBy('createdAt','desc')
        .get()

      const manual = (r.data || []).map(x => ({
        name: x.name,
        suggestQty: x.qty,
        brand: '(手动)',
        price: 0,
        manualId: x._id   // 用于识别来源
      }))

      // 3) 拼在系统推荐前面
      items = manual.concat(items)

      this.setData({ items })
    } catch (e) {
      console.error(e)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ items: [] })
    } finally {
      this.setData({ loading: false })
    }
  },

  // ========== 记一笔 ==========
  async addPurchase(e){
    const it   = e.currentTarget.dataset.item || {}
    const incr = Number(it.suggestQty || 1)
  
    wx.showLoading({ title: '提交中...' })
    try {
      // 1) 记入 purchases
      await db.collection('purchases').add({
        data: {
          skuId: it.name,
          name: it.name,
          qty: incr,
          unitPrice: it.price || 0,
          brand: it.brand || '',
          purchasedAt: Date.now()
        }
      })

      // 2) 库存回加（系统推荐项才执行）
      if (it.invId) {
        await db.collection('inventory').doc(it.invId).update({
          data: { qty: _.inc(incr) }
        })
      }

      // 3) 如果是手动补货，自动关闭状态
      if (it.manualId) {
        await db.collection('replenish_demand').doc(it.manualId).update({
          data: { status: 'done' }
        })
      }

      wx.showToast({ title:'已记录' })
      this.load()
    } catch (err) {
      console.error(err)
      wx.showToast({ title: '失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 复制购买链接
  copyLink(e) {
    const link = e.currentTarget.dataset.link
    if (!link) return
    wx.setClipboardData({ data: String(link) })
  }
})
