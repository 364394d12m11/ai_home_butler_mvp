import { EVENTS, track } from '../../utils/analytics'
Page({
  data:{ chores:[], parcels:[], chore:'' },
  async onShow(){
    const db = wx.cloud.database();
    const r1 = await db.collection('chores').orderBy('ts','desc').get()
    const r2 = await db.collection('parcels').orderBy('ts','desc').get()
    this.setData({ chores:r1.data||[], parcels:r2.data||[] })
  },
  onChore(e){ this.setData({ chore:e.detail.value }) },
  async addChore(){
    const db = wx.cloud.database();
    await db.collection('chores').add({ data:{ title:this.data.chore, done:false, ts:Date.now() } })
    this.onShow()
  },
  async doneChore(e){
    const db = wx.cloud.database();
    await db.collection('chores').doc(e.currentTarget.dataset.id).update({ data:{ done:true, doneAt: Date.now() } })
    track(EVENTS.chore_done)
    this.onShow()
  },
  async addParcel(){
    const db = wx.cloud.database({ env: require('../../config/index').envId })
    const photos = await wx.chooseMedia({ count:1, mediaType:['image'] })
    const places = ['门口柜','玄关左柜','书房','储物间']
    const place = await wx.showActionSheet({ itemList: places })
                    .then(r=>places[r.tapIndex]).catch(()=>null)
  
    const up = await wx.cloud.uploadFile({
      cloudPath: `parcels/${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`,
      filePath: photos.tempFiles[0].tempFilePath
    })
  
    await db.collection('parcels').add({
      data:{ photo: up.fileID, place, status:'待处理', ts: Date.now() }
    })
    this.onShow()
  }  
})
