Page({
  data:{ name:'', time:'' },
  onName(e){ this.setData({ name:e.detail.value }) },
  onTime(e){ this.setData({ time:e.detail.value }) },
  async onSave(){
    const db = wx.cloud.database()
    await db.collection('health').add({ data:{ name:this.data.name, time:this.data.time, ts:Date.now() } })
    wx.showToast({ title:'已保存' })
  }
})
