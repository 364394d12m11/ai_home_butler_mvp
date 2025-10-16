const { envId } = require('../../config/index')
const db = wx.cloud.database({ env: envId })
import seed from './seed'

Page({
  data:{
    tagsAll:['家常','快手','下饭','素菜','荤菜','汤羹','减脂','砂锅','面点','甜品'],
    tagIdx:-1,   // -1 不限
    timeIdx:0,   // 0 不限
    diffIdx:0,   // 0 不限
    timeOpts:[{label:'不限',max:999},{label:'≤10分钟',max:10},{label:'≤20分钟',max:20},{label:'≤30分钟',max:30}],
    diffOpts:['不限','简单','普通','进阶'],
    pick:null, loading:false, useSeed:false
  },

  onShow(){ this.shuffle() },

  async shuffle(){
    this.setData({loading:true})
    const { tagIdx, timeIdx, diffIdx, timeOpts, tagsAll } = this.data

    try{
      let list = []
      
      // 优先使用本地数据
      try{
        const { RECIPES } = require('../../utils/recipes')
        list = RECIPES.filter(r=>{
          if (tagIdx>=0 && !r.tags?.includes(tagsAll[tagIdx])) return false
          if (timeIdx>0 && !(r.time<=timeOpts[timeIdx].max)) return false
          // 本地数据没有difficulty字段，跳过难度筛选
          return true
        })
        this.setData({ useSeed:false })
      }catch(e){
        // 本地数据失败，尝试云数据库
        const cond = {}
        if (tagIdx>=0) cond.tags = db.command.all([tagsAll[tagIdx]])
        if (timeIdx>0) cond.minutes = db.command.lte(timeOpts[timeIdx].max)
        if (diffIdx>0) cond.difficulty = diffIdx

        try{
          const r = await db.collection('recipes').where(cond).limit(100).get()
          list = r.data || []
          this.setData({ useSeed:false })
        }catch(e2){
          // 云数据库也失败，使用seed数据
          list = seed.filter(r=>{
            if (tagIdx>=0 && !r.tags?.includes(tagsAll[tagIdx])) return false
            if (timeIdx>0 && !(r.minutes<=timeOpts[timeIdx].max)) return false
            if (diffIdx>0 && r.difficulty!==diffIdx) return false
            return true
          })
          this.setData({ useSeed:true })
        }
      }
      
      if (!list.length) return this.setData({ pick:null, loading:false })
      const i = Math.floor(Math.random()*list.length)
      const pick = list[i]
      this.setData({ pick, loading:false })
    }finally{ 
      this.setData({loading:false}) 
    }
  },

  onPickTag(e){ this.setData({ tagIdx:Number(e.detail.value)-1 }); this.shuffle() },
  onPickTime(e){ this.setData({ timeIdx:Number(e.detail.value) }); this.shuffle() },
  onPickDiff(e){ this.setData({ diffIdx:Number(e.detail.value) }); this.shuffle() },

  goDetail(){
    const p = this.data.pick
    if(!p) return
    const id = p._id || p.id
    const seed = this.data.useSeed ? 1 : 0
    wx.navigateTo({ url:`/pages/diet/detail?id=${id}&seed=${seed}` })
  }
})
