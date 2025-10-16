// miniprogram/pages/diet/taste-setup/index.js
Page({
  data: {
    profile: {
      consumptionLevel: 'value', // budget/value/quality/luxury
      aesthetic: 'homestyle', // homestyle/trendy/healthy/gourmet
      cuisines: ['中式', '家常'], // 多选
      maxSpicy: 1, // 0-3
      flavors: ['清淡', '咸鲜'], // 多选
      complexity: 2, // 1-5
      exploration: 'moderate', // conservative/moderate/adventurous
      allergies: '', // 文本输入
      dailyBudget: 0 // 数字
    },
    
    cuisineOptions: ['中式', '川菜', '粤菜', '湘菜', '东北菜', '西式', '日式', '韩式', '东南亚', '家常'],
    flavorOptions: ['清淡', '咸鲜', '酸甜', '麻辣', '香辣', '鲜美', '清香', '浓郁'],
    complexityLabels: ['', '极简', '简单', '适中', '复杂', '大师级'],
      // 新增这两行
  cuisineSelected: {},
  flavorSelected: {}
  },

  onLoad() {
    this.loadExistingProfile()
    this.initSelectedStates()
  },

  // 加载现有设置
  loadExistingProfile() {
    try {
      const existingProfile = wx.getStorageSync('TASTE_PROFILE')
      if (existingProfile) {
        this.setData({ profile: { ...this.data.profile, ...existingProfile } })
      }
    } catch (e) {
      console.error('加载调性设置失败:', e)
    }
  },
  // 初始化选中状态
initSelectedStates() {
  const cuisineSelected = {}
  const flavorSelected = {}
  
  this.data.profile.cuisines.forEach(item => {
    cuisineSelected[item] = true
  })
  
  this.data.profile.flavors.forEach(item => {
    flavorSelected[item] = true
  })
  
  this.setData({
    cuisineSelected,
    flavorSelected
  })
},

  // 设置消费层级
  setConsumptionLevel(e) {
    const level = e.currentTarget.dataset.level
    console.log('设置消费层级:', level)
    this.setData({ 'profile.consumptionLevel': level })
  },

  // 设置风格偏好
  setAesthetic(e) {
    const aesthetic = e.currentTarget.dataset.aesthetic
    console.log('设置风格偏好:', aesthetic)
    this.setData({ 'profile.aesthetic': aesthetic })
  },

  toggleCuisine(e) {
    const cuisine = e.currentTarget.dataset.cuisine
    const selected = !this.data.cuisineSelected[cuisine]
    
    this.setData({
      [`cuisineSelected.${cuisine}`]: selected
    })
    
    // 同步更新数组
    const cuisines = Object.keys(this.data.cuisineSelected).filter(key => 
      key === cuisine ? selected : this.data.cuisineSelected[key]
    )
    
    this.setData({
      'profile.cuisines': cuisines
    })
  },

  // 设置辣度上限
  setMaxSpicy(e) {
    const level = parseInt(e.currentTarget.dataset.level)
    console.log('设置辣度:', level)
    this.setData({ 'profile.maxSpicy': level })
  },

  // 切换口味偏好 - 修复版
  toggleFlavor(e) {
    const flavor = e.currentTarget.dataset.flavor
    const selected = !this.data.flavorSelected[flavor]
    
    this.setData({
      [`flavorSelected.${flavor}`]: selected
    })
    
    // 同步更新数组
    const flavors = Object.keys(this.data.flavorSelected).filter(key => 
      key === flavor ? selected : this.data.flavorSelected[key]
    )
    
    this.setData({
      'profile.flavors': flavors
    })
  },

  // 设置复杂度
  setComplexity(e) {
    const complexity = parseInt(e.detail.value)
    console.log('设置复杂度:', complexity)  // 加这一行
    this.setData({ 'profile.complexity': complexity })
  },

  // 设置探索度
  setExploration(e) {
    const level = e.currentTarget.dataset.level
    console.log('设置探索度:', level)
    this.setData({ 'profile.exploration': level })
  },

  // 更新过敏忌口
  updateAllergies(e) {
    this.setData({ 'profile.allergies': e.detail.value })
  },

  // 更新预算
  updateBudget(e) {
    const budget = parseFloat(e.detail.value) || 0
    this.setData({ 'profile.dailyBudget': budget })
  },

  // 预览推荐效果
  async previewRecommendation() {
    wx.showLoading({ title: '生成预览...', mask: true })
    
    try {
      // 模拟基于调性的推荐
      const mockRecommendations = this.generateMockRecommendations()
      
      setTimeout(() => {
        wx.hideLoading()
        wx.showModal({
          title: '推荐预览',
          content: `基于您的设置，为您推荐：\n${mockRecommendations.join('\n')}`,
          showCancel: false,
          confirmText: '不错'
        })
      }, 1500)
      
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '预览失败', icon: 'none' })
    }
  },

  // 生成模拟推荐
  generateMockRecommendations() {
    const { profile } = this.data
    const recommendations = []
    
    // 基于消费层级
    if (profile.consumptionLevel === 'budget') {
      recommendations.push('🥔 青椒土豆丝 (经济实惠)')
    } else if (profile.consumptionLevel === 'luxury') {
      recommendations.push('🥩 黑椒牛排 (品质优选)')
    } else {
      recommendations.push('🍗 宫保鸡丁 (性价比之选)')
    }
    
    // 基于风格偏好
    if (profile.aesthetic === 'healthy') {
      recommendations.push('🥗 蔬菜沙拉 (健康清淡)')
    } else if (profile.aesthetic === 'gourmet') {
      recommendations.push('🍤 白灼虾 (精致制作)')
    } else {
      recommendations.push('🍅 西红柿炒蛋 (家常美味)')
    }
    
    // 基于辣度
    if (profile.maxSpicy >= 2) {
      recommendations.push('🌶️ 麻婆豆腐 (微辣开胃)')
    } else {
      recommendations.push('🥦 蒜蓉西兰花 (清香不辣)')
    }
    
    return recommendations
  },

  // 保存设置
  async saveProfile() {
    const { profile } = this.data
    
    // 验证必填项
    if (!profile.consumptionLevel || !profile.aesthetic) {
      wx.showToast({ title: '请完成基础设置', icon: 'none' })
      return
    }
    
    if (profile.cuisines.length === 0) {
      wx.showToast({ title: '请至少选择一种菜系', icon: 'none' })
      return
    }
    
    wx.showLoading({ title: '保存中...', mask: true })
    
    try {
      // 保存到本地
      wx.setStorageSync('TASTE_PROFILE', profile)
      
      // 模拟上传到云端
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      wx.showToast({ title: '保存成功', icon: 'success' })
      
      // 返回上级页面
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  }
})