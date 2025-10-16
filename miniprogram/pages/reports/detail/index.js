// miniprogram/pages/reports/detail/index.js
const { envId } = require('../../../config/index')
const db = wx.cloud.database({ env: envId })

Page({
  data: {
    loading: true,
    report: null,
    // 便于下拉刷新复用入参
    _lastQuery: null // { id } 或 { type, ymd }
  },

  onLoad(options) {
    const id   = options && options.id
    const type = options && options.type
    const ymd  = options && options.ymd

    if (id) {
      this.setData({ _lastQuery: { id } })
      this.loadById(id)
      return
    }
    if (type && ymd) {
      this.setData({ _lastQuery: { type, ymd } })
      this.loadByKey(type, ymd)
      return
    }

    this.setData({ loading: false })
    wx.showToast({ title: '缺少参数', icon: 'none' })
  },

  onPullDownRefresh() {
    const q = this.data._lastQuery
    if (!q) return wx.stopPullDownRefresh()
    if (q.id) this.loadById(q.id, true)
    else this.loadByKey(q.type, q.ymd, true)
  },

  async loadById(id, isRefresh) {
    try {
      const r = await db.collection('reports').doc(id).get()
      const rep = r.data || {}
      this.applyDisplayMapping(rep)
      if (isRefresh) wx.stopPullDownRefresh()
    } catch (e) {
      console.error('loadById error:', e)
      if (isRefresh) wx.stopPullDownRefresh()
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  async loadByKey(type, ymd, isRefresh) {
    try {
      const r = await db.collection('reports')
        .where({ type: type, ymd: ymd })
        .limit(1)
        .get()
      const rows = r.data || []
      if (!rows.length) {
        this.setData({ loading: false })
        if (isRefresh) wx.stopPullDownRefresh()
        wx.showToast({ title: '未找到该报告', icon: 'none' })
        return
      }
      this.applyDisplayMapping(rows[0])
      if (isRefresh) wx.stopPullDownRefresh()
    } catch (e) {
      console.error('loadByKey error:', e)
      if (isRefresh) wx.stopPullDownRefresh()
      this.setData({ loading: false })
      wx.showToast({ title: '查询失败', icon: 'none' })
    }
  },

  // —— 把后端文档“抹平”为详情页可直接渲染的字段 —— //
  applyDisplayMapping(rep) {
    // 1) 标题：优先用文档 title；否则按 type 简单兜底
    if (!rep.title) {
      const map = { day: '日报', week: '周报', month: '月报' }
      const t = map[rep.type] || '报告'
      rep.title = rep.ymd ? `${t} · ${rep.ymd}` : t
    }

    // 2) 区间展示：优先 displayRange；否则用 range.from~range.to；再否则用 ymd
    if (!rep.displayRange) {
      const r = rep.range || {}
      if (r.from && r.to) rep.displayRange = `${r.from} ~ ${r.to}`
      else rep.displayRange = rep.ymd || ''
    }

    // 3) 统计：将 stats 平铺到顶层（供 wxml 直接使用）
    const stats = rep.stats || {}
    if (rep.total  === undefined || rep.total  === null)  rep.total  = stats.total  || 0
    if (rep.pinned === undefined || rep.pinned === null) rep.pinned = stats.pinned || 0

    // 4) 建议：兼容 daily.suggestions 与顶层 suggestions
    if (!Array.isArray(rep.suggestions) || rep.suggestions.length === 0) {
      const ds = rep.daily && rep.daily.suggestions
      rep.suggestions = Array.isArray(ds) ? ds : []
    }

    // 5) 事件：若存在则按“置顶优先、时间升序”排序；没有就给空数组
    if (Array.isArray(rep.events)) {
      rep.events = rep.events.slice().sort((a, b) => {
        const ap = !!a.pin, bp = !!b.pin
        if (ap !== bp) return ap ? -1 : 1
        const at = a.time || '', bt = b.time || ''
        return at.localeCompare(bt)
      })
    } else {
      rep.events = []
    }

    this.setData({ report: rep, loading: false })
  }
})
