// miniprogram/pages/events/list.js
const { envId } = require('../../config/index')
const db = wx.cloud.database({ env: envId })

Page({
  data: { list: [] },

  onShow () { this.load() },

  async load () {
    const d = new Date()
    const pad = n => String(n).padStart(2, '0')
    const ymd = x => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
    const start = new Date(d); start.setDate(d.getDate() - 7)
    const end   = new Date(d); end.setDate(d.getDate() + 30)
    const _ = db.command

    const r = await db.collection('events')
      .where({ time: _.gte(ymd(start)).and(_.lte(ymd(end))) })
      .orderBy('pin', 'desc')
      .orderBy('time', 'asc')
      .get()
      .catch(() => ({ data: [] }))

    this.setData({ list: r.data || [] })
  },

  // 新增
  goAdd () {
    wx.navigateTo({ url: '/pages/events/new/index' })
  },

  // 编辑
  onEdit (e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/events/edit?id=${id}` })
  },

  // 置顶/取消置顶
  async onPin (e) {
    const id = e.currentTarget.dataset.id
    const pin = !!e.currentTarget.dataset.pin
    await db.collection('events').doc(id).update({ data: { pin: !pin } })
    wx.showToast({ title: pin ? '已取消置顶' : '已置顶' })
    this.load()
  },

  // 删除
  async onDel (e) {
    const id = e.currentTarget.dataset.id
    const ok = await wx.showModal({ title: '删除事件', content: '删除后不可恢复，确定删除？' })
      .then(r => r.confirm).catch(() => false)
    if (!ok) return
    await db.collection('events').doc(id).remove().catch(()=>{})
    wx.showToast({ title: '已删除' })
    this.load()
  }
})
