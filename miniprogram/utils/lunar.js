export async function getLunarInfo(dateYmd){
  try{
    const res = await wx.cloud.callFunction({ name:'lunarInfo', data:{ date: dateYmd } })
    return res?.result || { lunarDate:'', lunarFestival:'' }
  }catch(e){
    console.warn('lunarInfo fallback:', e)
    return { lunarDate:'', lunarFestival:'' }   // 兜底不卡首页
  }
}
