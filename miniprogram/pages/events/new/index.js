const { envId } = require('../../../config/index')
const db = wx.cloud.database({ env: envId })

Page({
  data:{
    id:'',                        // 有值=编辑
    title:'', date:'', typeIdx:0,
    types:['家庭','学校','财务','健康','社交','快递','其他'],
    remindIdx:0,
    remindOpts:['DAY0','T-1','T-3','NONE'],
    remindOptsTxt:['当日','提前1天','提前3天','不提醒'],
    pin:false
  },

  onLoad(options){
    // 默认日期=今天
    const d=new Date(), pad=n=>String(n).padStart(2,'0')
    const today=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
    this.setData({ date: today })

    // 编辑模式
    if(options.id){
      this.setData({ id: options.id })
      db.collection('events').doc(options.id).get().then(r=>{
        const x=r.data||{}
        this.setData({
          title:x.title||'',
          date:x.time||today,
          typeIdx: Math.max(0,this.data.types.indexOf(x.type||'其他')),
          remindIdx: Math.max(0,this.data.remindOpts.indexOf(x.remind||'DAY0')),
          pin: !!x.pin
        })
      })
    }
  },

  // 表单控件
  onTitle(e){ this.setData({ title:e.detail.value }) },
  onDate(e){ this.setData({ date:e.detail.value }) },
  onType(e){ this.setData({ typeIdx:+e.detail.value }) },
  onRemind(e){ this.setData({ remindIdx:+e.detail.value }) },
  onPin(e){ this.setData({ pin:e.detail.value }) },

  async onSubmit(){
    const { id,title,date,types,typeIdx,remindOpts,remindIdx,pin } = this.data
    if(!title || !date) return wx.showToast({title:'请填标题与日期',icon:'none'})
      // 👉 有提醒才申请订阅
  if (remindOpts[remindIdx] !== 'NONE') {
    try {
      await wx.requestSubscribeMessage({ tmplIds: [config.tmpls?.event || '替换成同一个模板ID'] })
    } catch(e) { /* 忽略 */ }
  }

    const doc = {
      title, time: date, type: types[typeIdx],
      remind: remindOpts[remindIdx], pin: pin?1:0,
      updatedAt: Date.now()
    }
    if(id){
      await db.collection('events').doc(id).update({ data: doc })
    }else{
      await db.collection('events').add({ data: { ...doc, createdAt: Date.now() } })
    }
    const tmplId = require('../../../config/index').tmpls.event
    const subRes = await wx.requestSubscribeMessage({ tmplIds: [tmplId] }).catch(()=> ({}))
    console.log('subscribe result:', subRes)
    if (subRes[tmplId] !== 'accept') {
      wx.showToast({ title:'未允许订阅，本次不会推送', icon:'none' })
    }
    
    wx.showToast({ title:'已保存' })
    setTimeout(()=>wx.navigateBack(), 300)
  }
})
