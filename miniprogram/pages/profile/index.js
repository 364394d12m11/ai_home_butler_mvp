// pages/profile/index.js - V4.1设置中心
const { get, set, getUserProfileV3 } = require('../../utils/storage')
const { collectDailyData } = require('../../utils/reflection_v4')

Page({
  data: {
    profile: {},
    settings: {
      weather_dynamic: true,
      show_solar_term: true,
      show_daily_quote: true,
      push_frequency: 'daily',
      budget_level: '小资',
      ui_mode: 'default',
      transparent_mode: false,
      animations: 'medium',
      privacy_upload: false
    },
    version: '4.1.0'
  },

  onLoad() {
    this.loadUserData()
  },

  onShow() {
    // V4.2 数据收集
    collectDailyData({ type: 'settings_access' })
    this.loadUserData()
  },

  // 加载用户数据
  loadUserData() {
    const userDataV3 = getUserProfileV3()
    const legacyProfile = get('USER_PROFILE', {})
    const settings = get('APP_SETTINGS', this.data.settings)

    // 修复用户信息显示
    let displayProfile = {}
    if (userDataV3.isV3 && userDataV3.profile) {
      displayProfile = {
        family_profile: userDataV3.profile.family_profile || '小橙子用户',
        city: userDataV3.profile.city || '未设置城市',
        ai_tone: userDataV3.profile.ai_tone || '温柔'
      }
    } else if (legacyProfile.family_profile) {
      displayProfile = {
        family_profile: legacyProfile.family_profile || '小橙子用户', 
        city: legacyProfile.city || '未设置城市',
        ai_tone: legacyProfile.ai_tone || '温柔'
      }
    } else {
      displayProfile = {
        family_profile: '小橙子用户',
        city: '未设置城市', 
        ai_tone: '温柔'
      }
    }

    this.setData({
      profile: displayProfile,
      settings: settings
    })
  },

  // 导航到语气设置
  goToToneSettings() {
    wx.navigateTo({
      url: '/pages/profile/tone/index'
    })
  },

  // 导航到饮食偏好设置
  goToDietSettings() {
    wx.navigateTo({
      url: '/pages/diet/taste-setup/index'
    })
  },

  // 切换天气动态背景
  toggleWeatherDynamic() {
    const newValue = !this.data.settings.weather_dynamic
    this.updateSetting('weather_dynamic', newValue)
    wx.showToast({
      title: newValue ? '已开启动态背景' : '已关闭动态背景',
      icon: 'none'
    })
  },



  // 切换每日语录
  toggleDailyQuote() {
    const newValue = !this.data.settings.show_daily_quote
    this.updateSetting('show_daily_quote', newValue)
    wx.showToast({
      title: newValue ? '已开启每日语录' : '已关闭每日语录',
      icon: 'none'
    })
  },



  // 选择推送频率
  selectPushFrequency() {
    const options = [
      { key: 'daily', label: '每日推送' },
      { key: 'weekly', label: '每周推送' },
      { key: 'off', label: '关闭推送' }
    ]

    wx.showActionSheet({
      itemList: options.map(item => item.label),
      success: (res) => {
        const selected = options[res.tapIndex]
        this.updateSetting('push_frequency', selected.key)
        wx.showToast({
          title: `已设置为${selected.label}`,
          icon: 'none'
        })
      }
    })
  },

  // 选择预算等级
  selectBudgetLevel() {
    const options = [
      { key: '实惠', label: '实惠型（注重性价比）' },
      { key: '小资', label: '小资型（平衡价格与品质）' },
      { key: '精致', label: '精致型（追求品质）' }
    ]

    wx.showActionSheet({
      itemList: options.map(item => item.label),
      success: (res) => {
        const selected = options[res.tapIndex]
        this.updateSetting('budget_level', selected.key)
        
        // 同时更新到饮食偏好
        const dietPref = get('DIET_PREF_V3', {})
        dietPref.budget = selected.key
        set('DIET_PREF_V3', dietPref)
        
        wx.showToast({
          title: `预算等级：${selected.key}`,
          icon: 'none'
        })
      }
    })
  },

  // 选择动画密度
  selectAnimations() {
    const options = [
      { key: 'off', label: '关闭动画（省电模式）' },
      { key: 'low', label: '简化动画' },
      { key: 'medium', label: '标准动画' },
      { key: 'high', label: '丰富动画' }
    ]

    wx.showActionSheet({
      itemList: options.map(item => item.label),
      success: (res) => {
        const selected = options[res.tapIndex]
        this.updateSetting('animations', selected.key)
        wx.showToast({
          title: `动画设置：${selected.label}`,
          icon: 'none'
        })
      }
    })
  },

  // 切换隐私设置
  togglePrivacyUpload() {
    const newValue = !this.data.settings.privacy_upload
    
    if (newValue) {
      wx.showModal({
        title: '数据上传确认',
        content: '开启后，您的使用偏好将上传到云端，用于改善推荐效果。可随时关闭。',
        success: (res) => {
          if (res.confirm) {
            this.updateSetting('privacy_upload', true)
            wx.showToast({
              title: '已开启云端同步',
              icon: 'none'
            })
          }
        }
      })
    } else {
      this.updateSetting('privacy_upload', false)
      wx.showToast({
        title: '已关闭云端同步',
        icon: 'none'
      })
    }
  },

  // 更新设置项
  updateSetting(key, value) {
    const settings = { ...this.data.settings }
    settings[key] = value
    this.setData({ settings })
    set('APP_SETTINGS', settings)
  },

  // 清除所有数据
  clearAllData() {
    wx.showModal({
      title: '清除所有数据',
      content: '这将删除所有本地数据，包括用户设置、历史记录等，确定继续吗？',
      confirmText: '确定清除',
      confirmColor: '#ff4444',
      success: (res) => {
        if (res.confirm) {
          this.performClearData()
        }
      }
    })
  },

  // 执行清除数据
  performClearData() {
    wx.showLoading({ title: '清除中...', mask: true })
    
    try {
      // 清除主要数据
      const keysToRemove = [
        'USER_PROFILE',
        'USER_PROFILE_V3',
        'HELPERS_V3',
        'DIET_PREF_V3',
        'SIX_DIMENSIONS_V3',
        'MENU_HISTORY',
        'SHADOW_PROFILE',
        'SHADOW_EVENTS',
        'APP_SETTINGS'
      ]
      
      keysToRemove.forEach(key => {
        try {
          wx.removeStorageSync(key)
        } catch (e) {
          console.warn(`清除${key}失败:`, e)
        }
      })
      
      wx.hideLoading()
      wx.showToast({
        title: '数据已清除',
        icon: 'success'
      })
      
      // 重新初始化
      setTimeout(() => {
        this.setData({
          profile: {},
          settings: {
            weather_dynamic: true,
            show_solar_term: true,
            show_daily_quote: true,
            push_frequency: 'daily',
            budget_level: '小资',
            ui_mode: 'default',
            transparent_mode: false,
            animations: 'medium',
            privacy_upload: false
          }
        })
      }, 1000)
      
    } catch (e) {
      wx.hideLoading()
      wx.showToast({
        title: '清除失败',
        icon: 'none'
      })
    }
  },



  // 关于页面
  showAbout() {
    wx.showModal({
      title: '关于小橙子',
      content: `版本：${this.data.version}\n\n小橙子是您的AI家庭助手，帮助管理日常生活的方方面面。\n\n如有问题或建议，欢迎反馈。`,
      showCancel: false
    })
  },

  // 意见反馈
  showFeedback() {
    wx.showModal({
      title: '意见反馈',
      content: '感谢您的反馈！我们会认真考虑每一条建议，持续改进产品体验。',
      showCancel: false,
      confirmText: '好的'
    })
  }
})