// miniprogram/app.js
const config = require('./config/index')

// App 定义
App({
  onLaunch: function () {
    // 初始化云环境
    try {
      wx.cloud.init({ env: config.envId, traceUser: true })
    } catch (e) {
      console.error('wx.cloud.init failed:', e)
    }

    // 检查建档状态
    setTimeout(() => this.checkOnboardingStatus(), 100)
  },

  // 建档状态检查
  checkOnboardingStatus() {
    try {
      const profile = wx.getStorageSync('USER_PROFILE') || {}
      const pages = getCurrentPages()
      const currentRoute = pages[pages.length - 1]?.route || ''
      
      if (profile.onboarding_done) {
        // 已建档，确保在首页
        if (!currentRoute.includes('home/index')) {
          wx.reLaunch({ url: '/pages/home/index' })
        }
      } else {
        // 未建档，确保在建档页
        if (!currentRoute.includes('onboarding/index')) {
          wx.reLaunch({ url: '/pages/onboarding/index' })
        }
      }
    } catch (e) {
      console.error('checkOnboardingStatus error:', e)
      // 出错时默认进入建档页
      wx.reLaunch({ url: '/pages/onboarding/index' })
    }
  },

  getDB() {
    return wx.cloud.database({ env: this.globalData.envId })
  },

  globalData: {
    envId: config.envId,
    cityFallback: config.cityFallback,
    featureFlags: config.featureFlags,
    kpis: config.kpis,
  }
})