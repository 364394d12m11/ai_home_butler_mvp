const { EVENTS, track } = require('../../utils/analytics')
Page({
  data:{ task:'', pickup:'' },
  onTask(e){ this.setData({ task:e.detail.value }) },
  onPickupTime(e){ this.setData({ pickup:e.detail.value }) },
  async onSave(){
    const db = wx.cloud.database()
    await db.collection('study').add({ data:{ task:this.data.task, pickup:this.data.pickup, ts: Date.now() } })
    track(EVENTS.pickup_scheduled)
    wx.showToast({ title:'已保存' })
  }
})
