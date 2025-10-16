// ==========================================
// 文件5: pages/settings/index.js (新建)
// 用户偏好设置页面
// ==========================================

Page({
  data: {
    preferences: {
      budget: '实惠',
      dietStyle: [],
      spicyLevel: 1,
      cookingTime: 30,
      people: 2
    },
    budgetOptions: ['实惠', '小资', '精致'],
    dietOptions: [
      { key: '清淡', label: '清淡饮食', checked: false },
      { key: '素食', label: '素食主义', checked: false },
      { key: '少辣', label: '少辣少油', checked: false },
      { key: '高蛋白', label: '高蛋白', checked: false },
      { key: '儿童友好', label: '儿童友好', checked: false }
    ]
  },

  onLoad: function() {
    this.loadUserPreferences()
  },

  loadUserPreferences: function() {
    try {
      const prefs = wx.getStorageSync('USER_DIET_PREFERENCES') || {}
      const dietOptions = this.data.dietOptions.map(opt => ({
        ...opt,
        checked: (prefs.dietStyle || []).includes(opt.key)
      }))
      
      this.setData({
        preferences: {
          budget: prefs.budget || '实惠',
          dietStyle: prefs.dietStyle || [],
          spicyLevel: prefs.spicyLevel || 1,
          cookingTime: prefs.cookingTime || 30,
          people: prefs.people || 2
        },
        dietOptions: dietOptions
      })
    } catch (e) {
      console.error('加载偏好设置失败:', e)
    }
  },

  onBudgetChange: function(e) {
    this.setData({
      'preferences.budget': this.data.budgetOptions[e.detail.value]
    })
  },

  onDietStyleChange: function(e) {
    const values = e.detail.value
    const dietStyle = values.map(index => this.data.dietOptions[index].key)
    
    this.setData({
      'preferences.dietStyle': dietStyle
    })
  },

  onSpicyLevelChange: function(e) {
    this.setData({
      'preferences.spicyLevel': e.detail.value
    })
  },

  onCookingTimeChange: function(e) {
    this.setData({
      'preferences.cookingTime': e.detail.value
    })
  },

  onPeopleChange: function(e) {
    this.setData({
      'preferences.people': e.detail.value
    })
  },

  savePreferences: function() {
    try {
      wx.setStorageSync('USER_DIET_PREFERENCES', this.data.preferences)
      wx.showToast({ title: '保存成功', icon: 'success' })
      
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  }
})