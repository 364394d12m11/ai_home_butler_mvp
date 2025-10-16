const COL = 'logs_analytics'
export const EVENTS = {
  home_view: 'home_view',
  weather_card_click: 'weather_card_click',
  holiday_badge_click: 'holiday_badge_click',
  important_event_added: 'important_event_added',
  recommend_click: 'recommend_click',
  dish_swap: 'dish_swap',
  pantry_mode_on: 'pantry_mode_on',
  study_task_done: 'study_task_done',
  pickup_scheduled: 'pickup_scheduled',
  chore_done: 'chore_done',
  parcel_added: 'parcel_added',
  report_viewed: 'report_viewed',
}
export function track(name, payload={}){
  wx.cloud.database().collection(COL).add({ data:{ name, payload, ts: Date.now() } })
}
