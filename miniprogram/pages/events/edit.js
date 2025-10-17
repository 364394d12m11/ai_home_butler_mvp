// miniprogram/pages/events/edit.js
const { envId, tmpls } = require('../../config/index')  // 环境 & 模板
const db = wx.cloud.database({ env: envId })

const { EventTypes } = require('../../utils/schema')
const { EVENTS, track } = require('../../utils/analytics')

// UI值 <-> 存储值 的映射
const ui2storeRemind = { '当日': 'DAY0', 'T-1': 'T-1', 'T-3': 'T-3', '每周': 'WEEK', '每月': 'MONTH', '每年': 'YEAR', '关闭': '关闭' }
const store2uiRemind = { 'DAY0': '当日', 'T-1': 'T-1', 'T-3': 'T-3', 'WEEK':'每周','MONTH':'每月','YEAR':'每年','关闭':'关闭' }

Page({
  data: {
    types: EventTypes,
    reminds: ['当日','T-1','T-3','每周','每月','每年','关闭'],
    form: {}     // { _id?, title, time, type, pin, remind }
  },

  async onLoad (opt) {
    // 编辑态：带 id 则读取
    if (opt?.id) {
      try {
        const { data } = await db.collection('events').doc(opt.id).get()
        if (data) {
          // 存储里的提醒值转成 UI 显示值
          data.remind = store2uiRemind[data.remind] || '当日'
          this.setData({ form: data })
        }
      } catch (_) {}
    }
  },

  onTitle (e) { this.setData({ 'form.title': e.detail.value }) },
  onType  (e) { this.setData({ 'form.type': this.data.types[e.detail.value] }) },
  onDate  (e) { this.setData({ 'form.time': e.detail.value }) },
  onPin   (e) { this.setData({ 'form.pin' : e.detail.value }) },
  onRemind(e) { this.setData({ 'form.remind': this.data.reminds[e.detail.value] }) },

  async onSave () {
    const f = this.data.form || {}

    // 1) 校验
    if (!f.title || !f.time) {
      wx.showToast({ title: '请填写标题和日期', icon: 'none' })
      return
    }

    // 2) UI -> 存储
    const remind = ui2storeRemind[f.remind] || 'DAY0'
    const doc = {
      title: f.title,
      time:  f.time,                 // YYYY-MM-DD
      type:  f.type || '提醒',
      pin:   !!f.pin,
      remind,
      ts:    Date.now()
    }

    try {
      // 3) 新增/更新
      if (f._id) {
        await db.collection('events').doc(f._id).update({ data: doc })
      } else {
        await db.collection('events').add({ data: doc })
      }

      // 4) 保存成功后请求一次订阅（需要在用户点击回调中）
      if (tmpls?.event && remind !== '关闭') {
        try { await wx.requestSubscribeMessage({ tmplIds: [tmpls.event] }) } catch (_) {}
      }

      track(EVENTS.important_event_added, doc)
      wx.showToast({ title: '已保存' })
      setTimeout(() => wx.navigateBack(), 200)
    } catch (e) {
      console.error(e)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  }
})
