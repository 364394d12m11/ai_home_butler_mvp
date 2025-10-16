// pages/diet/taste-setup/index.js - V5.3首次偏好设置版
const { saveDietPreferences, getUserProfileV3 } = require('../../../utils/storage')

Page({
  data: {
    // ✅ V5.3: 简化为只收集核心偏好
    preferences: {
      goals: [],          // 饮食目标
      allergies: [],      // 过敏/禁忌
      budget: '',         // 预算档次
      cuisine_prefs: []   // 菜系偏好（可选，≤3）
    },
    
    // 选中状态
    selectedGoals: {},
    selectedAllergies: {},
    selectedCuisines: {},
    
    // 选项配置
    dietGoalOptions: [
      // 成人目标
      { value: 'lean', label: '轻盈塑形', desc: '高蛋白+控糖', category: 'adult' },
      { value: 'antiInflam', label: '抗炎稳态', desc: '少油少糖', category: 'adult' },
      { value: 'gutHealth', label: '肠道友好', desc: '膳食纤维', category: 'adult' },
      { value: 'plantBase', label: '植物优选', desc: '素食为主', category: 'adult' },
      { value: 'youngMetab', label: '年轻代谢', desc: '抗氧化', category: 'adult' },
      { value: 'menstrual', label: '经期友好', desc: '补铁暖宫', category: 'adult' },
      { value: 'sleep', label: '睡眠放松', desc: '助眠安神', category: 'adult' },
      
      // 儿童目标
      { value: 'kidsGrowth', label: '生长发育', desc: '钙+蛋白质', category: 'kids' },
      { value: 'kidsEyes', label: '护眼益智', desc: 'DHA+VA', category: 'kids' },
      { value: 'kidsGut', label: '肠胃友好', desc: '易消化', category: 'kids' },
      { value: 'kidsLowSugar', label: '控甜限盐', desc: '养成好习惯', category: 'kids' },
      { value: 'kidsFocus', label: '专注脑力', desc: '补充营养', category: 'kids' },
      { value: 'kidsImmune', label: '免疫力', desc: 'VC+锌', category: 'kids' }
    ],
    
    allergyOptions: [
      { value: 'peanut', label: '花生坚果' },
      { value: 'seafood', label: '海鲜贝壳' },
      { value: 'dairy', label: '乳制品' },
      { value: 'egg', label: '鸡蛋' },
      { value: 'gluten', label: '麸质' },
      { value: 'soy', label: '大豆' },
      { value: 'onionGarlic', label: '葱蒜' },
      { value: 'cilantro', label: '香菜' }
    ],
    
    cuisineOptions: [
      { value: 'default', label: '默认（不挑）' },
      { value: 'sichuanHunanChongqing', label: '川渝湘' },
      { value: 'cantonese', label: '粤菜' },
      { value: 'shandong', label: '鲁菜' },
      { value: 'henanShaanxi', label: '豫陕' },
      { value: 'jiangzhe', label: '江浙' },
      { value: 'fujian', label: '闽菜' },
      { value: 'northeast', label: '东北' },
      { value: 'northwest', label: '西北' },
      { value: 'yunnanGuizhou', label: '云贵' },
      { value: 'halal', label: '清真' }
    ],
    
    budgetOptions: [
      { value: '实惠', label: '实惠', desc: '注重性价比' },
      { value: '小资', label: '小资', desc: '平衡品质' },
      { value: '精致', label: '精致', desc: '追求品质' }
    ],
    
    // V5.3: 判断是否从首次生成进入
    isFirstGenerate: false,
    
    // V5.3: 判断是否有儿童
    hasKids: false
  },

  onLoad(options) {
    console.log('taste-setup onLoad, options:', options)
    
    // 检查是否从首次生成进入
    const isFirstGenerate = options.from === 'first_generate'
    
    // 获取用户画像
    const userDataV3 = getUserProfileV3()
    const hasKids = userDataV3.profile?.has_child || false
    
    this.setData({
      isFirstGenerate,
      hasKids
    })
    
    // 加载已有设置（如果有）
    this.loadExistingPreferences()
  },

  loadExistingPreferences() {
    const userDataV3 = getUserProfileV3()
    const existingPref = userDataV3.dietPref || {}
    
    if (existingPref.goals && existingPref.goals.length > 0) {
      // 已有设置，加载
      const selectedGoals = {}
      const selectedAllergies = {}
      const selectedCuisines = {}
      
      existingPref.goals.forEach(goal => {
        selectedGoals[goal] = true
      })
      
      ;(existingPref.allergies || []).forEach(allergy => {
        selectedAllergies[allergy] = true
      })
      
      ;(existingPref.cuisine_prefs || []).forEach(cuisine => {
        selectedCuisines[cuisine] = true
      })
      
      this.setData({
        'preferences.goals': existingPref.goals || [],
        'preferences.allergies': existingPref.allergies || [],
        'preferences.budget': existingPref.budget || '',
        'preferences.cuisine_prefs': existingPref.cuisine_prefs || [],
        selectedGoals,
        selectedAllergies,
        selectedCuisines
      })
    }
  },

  // ✅ V5.3: 切换饮食目标
  toggleGoal(e) {
    const goal = e.currentTarget.dataset.value
    const category = e.currentTarget.dataset.category
    
    const selectedGoals = { ...this.data.selectedGoals }
    const currentGoals = [...this.data.preferences.goals]
    
    // 成人目标最多3个，儿童目标最多2个
    const adultGoals = currentGoals.filter(g => {
      const opt = this.data.dietGoalOptions.find(o => o.value === g)
      return opt && opt.category === 'adult'
    })
    
    const kidsGoals = currentGoals.filter(g => {
      const opt = this.data.dietGoalOptions.find(o => o.value === g)
      return opt && opt.category === 'kids'
    })
    
    if (selectedGoals[goal]) {
      // 取消选择
      delete selectedGoals[goal]
      const index = currentGoals.indexOf(goal)
      if (index > -1) currentGoals.splice(index, 1)
    } else {
      // 检查限制
      if (category === 'adult' && adultGoals.length >= 3) {
        wx.showToast({ title: '成人目标最多选3个', icon: 'none', duration: 2000 })
        return
      }
      if (category === 'kids' && kidsGoals.length >= 2) {
        wx.showToast({ title: '儿童目标最多选2个', icon: 'none', duration: 2000 })
        return
      }
      
      selectedGoals[goal] = true
      currentGoals.push(goal)
    }
    
    this.setData({
      selectedGoals,
      'preferences.goals': currentGoals
    })
  },

  // ✅ V5.3: 切换过敏/禁忌
  toggleAllergy(e) {
    const allergy = e.currentTarget.dataset.value
    
    const selectedAllergies = { ...this.data.selectedAllergies }
    const currentAllergies = [...this.data.preferences.allergies]
    
    if (selectedAllergies[allergy]) {
      delete selectedAllergies[allergy]
      const index = currentAllergies.indexOf(allergy)
      if (index > -1) currentAllergies.splice(index, 1)
    } else {
      selectedAllergies[allergy] = true
      currentAllergies.push(allergy)
    }
    
    this.setData({
      selectedAllergies,
      'preferences.allergies': currentAllergies
    })
  },

  // ✅ V5.3: 切换菜系偏好（最多3个）
  toggleCuisine(e) {
    const cuisine = e.currentTarget.dataset.value
    
    const selectedCuisines = { ...this.data.selectedCuisines }
    const currentCuisines = [...this.data.preferences.cuisine_prefs]
    
    // 特殊处理：选择"默认"则清空其他
    if (cuisine === 'default') {
      this.setData({
        selectedCuisines: { 'default': true },
        'preferences.cuisine_prefs': ['default']
      })
      return
    }
    
    // 选择其他菜系，则取消"默认"
    if (selectedCuisines['default']) {
      delete selectedCuisines['default']
      const idx = currentCuisines.indexOf('default')
      if (idx > -1) currentCuisines.splice(idx, 1)
    }
    
    if (selectedCuisines[cuisine]) {
      delete selectedCuisines[cuisine]
      const index = currentCuisines.indexOf(cuisine)
      if (index > -1) currentCuisines.splice(index, 1)
    } else {
      // 最多选3个
      if (currentCuisines.length >= 3) {
        wx.showToast({ title: '菜系最多选3个', icon: 'none', duration: 2000 })
        return
      }
      selectedCuisines[cuisine] = true
      currentCuisines.push(cuisine)
    }
    
    this.setData({
      selectedCuisines,
      'preferences.cuisine_prefs': currentCuisines
    })
  },

  // ✅ V5.3: 选择预算档次
  selectBudget(e) {
    const budget = e.currentTarget.dataset.value
    this.setData({ 'preferences.budget': budget })
  },

  // ✅ V5.3: 保存偏好
  async savePreferences() {
    const { preferences, isFirstGenerate } = this.data
    
    // 验证必填项
    if (preferences.goals.length === 0) {
      wx.showToast({ title: '请至少选择1个饮食目标', icon: 'none', duration: 2000 })
      return
    }
    
    if (!preferences.budget) {
      wx.showToast({ title: '请选择预算档次', icon: 'none', duration: 2000 })
      return
    }
    
    wx.showLoading({ title: '保存中...', mask: true })
    
    try {
      const { saveDietPreferences, get, KEY } = require('../../../utils/storage')
      
      // 保存到存储
      saveDietPreferences(preferences)
      
      wx.hideLoading()
      wx.showToast({ title: '保存成功', icon: 'success', duration: 1500 })
      
      // ✅ 判断是从哪里进入的
      if (isFirstGenerate) {
        // 首次生成：返回并自动生成菜单
        setTimeout(() => {
          wx.navigateBack({
            success: () => {
              const pages = getCurrentPages()
              if (pages.length > 0) {
                const prevPage = pages[pages.length - 1]
                if (prevPage && prevPage.generateTodayMenu) {
                  prevPage.generateTodayMenu()
                }
              }
            }
          })
        }, 1500)
      } else {
        // 设置修改：直接返回
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      }
      
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
      console.error('保存饮食偏好失败:', e)
    }
  },

  // ✅ V5.3: 跳过设置（仅允许非首次生成时）
  skipSetup() {
    if (this.data.isFirstGenerate) {
      wx.showModal({
        title: '无法跳过',
        content: '首次生成菜单需要设置饮食偏好，这样AI才能为你推荐合适的菜品。',
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }
    
    wx.navigateBack()
  }
})