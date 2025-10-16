const { envId } = require('../../../config/index')
const db = wx.cloud.database({ env: envId })

Page({
  data:{ name:'', qty:'', note:'' },
  onName(e){ this.setData({ name:e.detail.value.trim() }) },
  onQty(e){ this.setData({ qty:e.detail.value }) },
  onNote(e){ this.setData({ note:e.detail.value.trim() }) },
  async save(){
    const n = Number(this.data.qty)
    if(!this.data.name) return wx.showToast({title:'填名称',icon:'none'})
    if(!n || n<=0)   return wx.showToast({title:'数量不对',icon:'none'})
    await db.collection('replenish_demand').add({
      data:{ name:this.data.name, qty:n, note:this.data.note, status:'open', createdAt:Date.now() }
    })
    wx.showToast({title:'已添加'})
    setTimeout(()=>wx.navigateBack(),200)
  }
})
