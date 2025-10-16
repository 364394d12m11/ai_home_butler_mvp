const { envId } = require('../../../config/index')
const db = wx.cloud.database({ env: envId })

const pad = n => String(n).padStart(2,'0')
const ymd  = t => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}
const hm = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }

Page({
  data:{ list:[], groups:[], page:0, pageSize:20, hasMore:true, loading:false },

  onLoad(){ this.load() },

  async load(){
    if (this.data.loading || !this.data.hasMore) return
    this.setData({ loading:true })
    try{
      const { page, pageSize } = this.data
      const r = await db.collection('purchases')
        .orderBy('purchasedAt','desc')
        .skip(page*pageSize).limit(pageSize)
        .get()
      const rows = (r.data || []).map(x => ({
        ...x,
        date: ymd(x.purchasedAt || Date.now()),
        time: hm(x.purchasedAt || Date.now())
      }))
      const list = this.data.list.concat(rows)
      // 分组
      const map = {}
      for (const it of list){
        (map[it.date] = map[it.date] || []).push(it)
      }
      const groups = Object.keys(map).sort((a,b)=> a<b?1:-1).map(d => ({ date:d, items:map[d] }))
      this.setData({
        list, groups,
        page: page + 1,
        hasMore: rows.length === pageSize
      })
    } catch(e){
      console.error(e)
      wx.showToast({ title:'加载失败', icon:'none' })
    } finally {
      this.setData({ loading:false })
    }
  },

  loadMore(){ this.load() }
})
