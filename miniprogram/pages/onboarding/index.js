// pages/onboarding/index.js - 添加菜系偏好（≤3个）
import { set, get, KEY } from '../../utils/storage'

Page({
  data: {
    currentStep: 1,
    regionText: '',
    locationStatus: 'pending',
    
    form: {
      city: null,
      autoLocation: false,
      familyType: '',
      gender: '',
      childCount: 0,
      childrenInfo: [],
      helpers: {
        nanny: { enabled: false, count: 1 },
        cleaner: { enabled: false, count: 1, frequency: '' },
        driver: { enabled: false, count: 1 }
      },
      hasPet: false,
      cuisinePrefs: [],        // 新增：菜系偏好（≤3）
      dietGoals: [],
      tastePreferences: [],
      dietTaboos: [],
      shoppingFreq: '',
      breakfastTime: '',
      dinnerTime: '',
      diningOutFreq: '',
      budgetLevel: '',
      lifeStyle: '',
      aiTone: ''
    },
    
    hasAnyHelper: false,
    selectedCuisinePrefs: {},       // 新增
    selectedDietGoals: {},
    selectedTastePreferences: {},
    selectedDietTaboos: {},
    
    // 新增：菜系选项
    cuisineOptions: [
      { value: '默认（不挑）', label: '默认（不挑）' },
      { value: '川渝湘', label: '川渝湘' },
      { value: '粤菜', label: '粤菜' },
      { value: '鲁菜', label: '鲁菜' },
      { value: '豫陕', label: '豫陕' },
      { value: '江浙', label: '江浙' },
      { value: '闽菜', label: '闽菜' },
      { value: '东北', label: '东北' },
      { value: '西北', label: '西北' },
      { value: '云贵', label: '云贵' },
      { value: '清真', label: '清真' }
    ],
    
    childAgeOptions: {
      years: Array.from({length: 19}, (_, i) => i),
      months: Array.from({length: 12}, (_, i) => i + 1)
    },
    
    cleanerFrequencies: ['每周1次', '每周2-3次', '每天1次', '不固定'],
    
    dietGoalOptions: [
      { value: 'antiInflammatory', label: '抗炎轻养', desc: '少油少糖，身体轻' },
      { value: 'bloodSugar', label: '控糖轻盈', desc: '稳定血糖，少发胖' },
      { value: 'seasonal', label: '节气养生', desc: '四时调理' },
      { value: 'childNutrition', label: '孩子营养', desc: '免疫/专注/成长' },
      { value: 'weightLoss', label: '减脂塑形', desc: '高蛋白+控糖' },
      { value: 'sleep', label: '睡眠调理', desc: '温补、助眠' }
    ]
  },

  onLoad() {
    const profile = get(KEY.PROFILE, {})
    if (profile.onboarding_done) {
      wx.reLaunch({ url: '/pages/home/index' })
      return
    }
    this.tryAutoLocation()
  },

  async tryAutoLocation() {
    this.setData({ locationStatus: 'pending' })
    try {
      const setting = await wx.getSetting()
      if (!setting.authSetting['scope.userLocation']) {
        await wx.authorize({ scope: 'scope.userLocation' })
      }
      const { latitude, longitude } = await wx.getLocation({ type: 'gcj02' })
      const { result } = await wx.cloud.callFunction({
        name: 'reverseGeocode',
        data: { lat: latitude, lng: longitude }
      })
      if (result && result.ok) {
        const province = result.province || ''
        const city = result.city || ''
        const district = result.district || ''
        if (city) {
          let displayText = ''
          if (province && city && district) {
            displayText = `${province}${city}${district}`
          } else if (province && city) {
            displayText = `${province}${city}`
          } else {
            displayText = city
          }
          this.setData({
            locationStatus: 'success',
            regionText: displayText,
            'form.city': {
              province: province || city,
              city: city,
              district: district || '',
              name: city
            },
            'form.autoLocation': true
          })
        } else {
          throw new Error('无法获取城市信息')
        }
      } else {
        throw new Error('逆地理编码失败')
      }
    } catch (e) {
      console.log('自动定位失败:', e)
      this.setData({ locationStatus: 'failed' })
    }
  },

  onRegion(e) {
    const values = e.detail.value
    const province = values[0] || ''
    const city = values[1] || ''
    const district = values[2] || ''
    if (!city) {
      wx.showToast({ title: '请至少选择到城市', icon: 'none' })
      return
    }
    if (!district) {
      wx.showToast({ title: '建议选择到区获得更精准服务', icon: 'none', duration: 2000 })
    }
    let displayText = ''
    if (province && city && district) {
      displayText = `${province}${city}${district}`
    } else if (province && city) {
      displayText = `${province}${city}`
    } else {
      displayText = city
    }
    this.setData({ 
      regionText: displayText,
      'form.city': { 
        province: province || city,
        city: city,
        district: district || '',
        name: city
      },
      'form.autoLocation': false,
      locationStatus: 'success'
    })
  },

  onFamilyTypeSelect(e) {
    const type = e.currentTarget.dataset.value
    this.setData({ 
      'form.familyType': type,
      'form.gender': '',
      'form.childCount': 0,
      'form.childrenInfo': []
    })
  },

  onGenderSelect(e) {
    this.setData({ 'form.gender': e.currentTarget.dataset.value })
  },

  onChildCountSelect(e) {
    const count = parseInt(e.currentTarget.dataset.value)
    const children = []
    for (let i = 0; i < count; i++) {
      children.push({ years: 1, months: 0, gender: 'skip' })
    }
    this.setData({ 
      'form.childCount': count,
      'form.childrenInfo': children
    })
  },

  onChildAgeChange(e) {
    const { index } = e.currentTarget.dataset
    const [yearsIndex, monthsIndex] = e.detail.value
    const years = this.data.childAgeOptions.years[yearsIndex]
    const children = [...this.data.form.childrenInfo]
    if (years <= 2 && monthsIndex !== undefined) {
      const months = this.data.childAgeOptions.months[monthsIndex]
      children[index] = { ...children[index], years, months }
    } else {
      children[index] = { ...children[index], years, months: 0 }
    }
    this.setData({ 'form.childrenInfo': children })
  },

  onChildGenderSelect(e) {
    const { index, value } = e.currentTarget.dataset
    const children = [...this.data.form.childrenInfo]
    children[index] = { ...children[index], gender: value }
    this.setData({ 'form.childrenInfo': children })
  },

  onHelperToggle(e) {
    const type = e.currentTarget.dataset.type
    const enabled = e.detail.value
    if (type === 'selfHandle') {
      this.setData({
        'form.helpers.nanny.enabled': false,
        'form.helpers.cleaner.enabled': false,
        'form.helpers.driver.enabled': false,
        hasAnyHelper: false
      })
      return
    }
    this.setData({ 
      [`form.helpers.${type}.enabled`]: enabled
    })
    this.updateSelfHandleStatus()
  },

  updateSelfHandleStatus() {
    const { helpers } = this.data.form
    const hasAnyHelper = helpers.nanny.enabled || helpers.cleaner.enabled || helpers.driver.enabled
    this.setData({ hasAnyHelper })
  },

  onHelperCountSelect(e) {
    const { type, value } = e.currentTarget.dataset
    this.setData({ [`form.helpers.${type}.count`]: parseInt(value) })
  },

  onHelperFreqSelect(e) {
    const { type, value } = e.currentTarget.dataset
    this.setData({ [`form.helpers.${type}.frequency`]: value })
  },

  onPetToggle(e) {
    this.setData({ 'form.hasPet': e.detail.value })
  },

  // 🔥 新增：菜系偏好选择（≤3个）
  onCuisineToggle(e) {
    const cuisine = e.currentTarget.dataset.value
    const current = [...(this.data.form.cuisinePrefs || [])]
    const selected = {...this.data.selectedCuisinePrefs}
    
    // 选择"默认（不挑）"清空其他
    if (cuisine === '默认（不挑）') {
      if (current.includes(cuisine)) {
        current.splice(current.indexOf(cuisine), 1)
        delete selected[cuisine]
      } else {
        this.setData({
          'form.cuisinePrefs': [cuisine],
          selectedCuisinePrefs: { '默认（不挑）': true }
        })
        return
      }
    } else {
      // 选其他先移除"默认（不挑）"
      const defaultIdx = current.indexOf('默认（不挑）')
      if (defaultIdx > -1) {
        current.splice(defaultIdx, 1)
        delete selected['默认（不挑）']
      }
      
      const index = current.indexOf(cuisine)
      if (index > -1) {
        current.splice(index, 1)
        delete selected[cuisine]
      } else {
        // 限制≤3
        if (current.length >= 3) {
          wx.showToast({ title: '最多选3个菜系', icon: 'none', duration: 1500 })
          return
        }
        current.push(cuisine)
        selected[cuisine] = true
      }
    }
    
    this.setData({ 
      'form.cuisinePrefs': current,
      selectedCuisinePrefs: selected
    })
    console.log('✅ 菜系偏好:', current)
  },

  onDietGoalToggle(e) {
    const goal = e.currentTarget.dataset.value
    const current = [...(this.data.form.dietGoals || [])]
    const selected = {...this.data.selectedDietGoals}
    
    const index = current.indexOf(goal)
    if (index > -1) {
      current.splice(index, 1)
      delete selected[goal]
    } else {
      current.push(goal)
      selected[goal] = true
    }
    
    this.setData({ 
      'form.dietGoals': current,
      selectedDietGoals: selected
    })
    console.log('✅ 饮食目标:', current, selected)
  },

  onTastePreferenceToggle(e) {
    const taste = e.currentTarget.dataset.value
    const current = [...(this.data.form.tastePreferences || [])]
    const selected = {...this.data.selectedTastePreferences}
    
    const index = current.indexOf(taste)
    if (index > -1) {
      current.splice(index, 1)
      delete selected[taste]
    } else {
      current.push(taste)
      selected[taste] = true
    }
    
    this.setData({ 
      'form.tastePreferences': current,
      selectedTastePreferences: selected
    })
    console.log('✅ 口味偏好:', current, selected)
  },

  onTabooToggle(e) {
    const taboo = e.currentTarget.dataset.value
    const current = [...(this.data.form.dietTaboos || [])]
    const selected = {...this.data.selectedDietTaboos}
    
    const index = current.indexOf(taboo)
    if (index > -1) {
      current.splice(index, 1)
      delete selected[taboo]
    } else {
      current.push(taboo)
      selected[taboo] = true
    }
    
    this.setData({ 
      'form.dietTaboos': current,
      selectedDietTaboos: selected
    })
    console.log('✅ 饮食禁忌:', current, selected)
  },

  onTabooOtherInput(e) {
    const value = e.detail.value
    const current = this.data.form.dietTaboos.filter(t => !t.startsWith('其他:'))
    if (value.trim()) {
      current.push(`其他:${value.trim()}`)
    }
    this.setData({ 'form.dietTaboos': current })
  },

  onRhythmSelect(e) {
    const { field, value } = e.currentTarget.dataset
    this.setData({ [`form.${field}`]: value })
  },

  onBudgetSelect(e) {
    this.setData({ 'form.budgetLevel': e.currentTarget.dataset.value })
  },

  onLifeStyleSelect(e) {
    this.setData({ 'form.lifeStyle': e.currentTarget.dataset.value })
  },

  onAiToneSelect(e) {
    this.setData({ 'form.aiTone': e.currentTarget.dataset.value })
  },

  nextStep() {
    if (!this.validateCurrentStep()) return
    const nextStep = Math.min(this.data.currentStep + 1, 3)
    this.setData({ currentStep: nextStep })
    wx.vibrateShort()
    setTimeout(() => {
      wx.pageScrollTo({ scrollTop: 0, duration: 300 })
    }, 100)
    if (nextStep === 2) {
      wx.showToast({ title: '了解啦，这样我能更好安排你家的节奏～', icon: 'none', duration: 2000 })
    }
    if (nextStep === 3) {
      wx.showToast({ title: '明白啦，等会儿我就用这些偏好为你生成今日餐桌～', icon: 'none', duration: 2000 })
    }
  },

  prevStep() {
    const prevStep = Math.max(this.data.currentStep - 1, 1)
    this.setData({ currentStep: prevStep })
  },

  validateCurrentStep() {
    const { currentStep, form, locationStatus } = this.data
    switch (currentStep) {
      case 1:
        if (locationStatus !== 'success') {
          wx.showToast({ title: '请先完成城市定位', icon: 'none' })
          return false
        }
        if (!form.familyType) {
          wx.showToast({ title: '请选择家庭成员结构', icon: 'none' })
          return false
        }
        if (form.familyType === 'single' && !form.gender) {
          wx.showToast({ title: '请选择性别', icon: 'none' })
          return false
        }
        if (form.familyType === 'hasChild' && form.childCount === 0) {
          wx.showToast({ title: '请选择孩子数量', icon: 'none' })
          return false
        }
        break
      case 2:
        // 🔥 新增：验证菜系偏好≤3
        if (form.cuisinePrefs.length > 3) {
          wx.showToast({ title: '菜系偏好最多选3个', icon: 'none' })
          return false
        }
        if (form.dietGoals.length === 0) {
          wx.showToast({ title: '请选择至少一个饮食目标', icon: 'none' })
          return false
        }
        if (form.tastePreferences.length === 0) {
          wx.showToast({ title: '请选择口味偏好', icon: 'none' })
          return false
        }
        if (!form.budgetLevel) {
          wx.showToast({ title: '请选择预算档次', icon: 'none' })
          return false
        }
        break
      case 3:
        if (!form.lifeStyle) {
          wx.showToast({ title: '请选择生活风格', icon: 'none' })
          return false
        }
        if (!form.aiTone) {
          wx.showToast({ title: '请选择AI语气偏好', icon: 'none' })
          return false
        }
        break
    }
    return true
  },

  onDone() {
    if (!this.validateCurrentStep()) return
    
    const { saveUserProfileV3 } = require('../../utils/storage')
    const result = saveUserProfileV3(this.data.form)
    
    console.log('V3.0建档完成:', result)
    
    wx.showToast({ title: '建档完成 🎉', icon: 'success', duration: 1500 })
    
    setTimeout(() => {
      wx.showModal({
        title: '建档完成',
        content: `已为你生成六维家庭画像：\n结构维${result.sixDimensions.structure.score}分\n生活方式维${result.sixDimensions.lifestyle.score}分\n健康维${result.sixDimensions.health.score}分\n\n我会根据这些信息为你定制日常推荐～`,
        showCancel: false,
        confirmText: '进入',
        success: () => {
          wx.reLaunch({ url: '/pages/home/index' })
        }
      })
    }, 1500)
    
    this.trackOnboardingComplete(result.profileV3)
  },

  calculateTotalMembers() {
    const { familyType, childCount } = this.data.form
    let total = 0
    if (familyType === 'single') total = 1
    else if (familyType === 'couple') total = 2
    else if (familyType === 'hasChild') total = 2 + childCount
    return total
  },

  summarizeHelpers() {
    const { helpers } = this.data.form
    const summary = []
    if (helpers.nanny.enabled) {
      summary.push({
        type: '保姆',
        count: helpers.nanny.count
      })
    }
    if (helpers.cleaner.enabled) {
      summary.push({
        type: '钟点工',
        count: helpers.cleaner.count,
        frequency: helpers.cleaner.frequency
      })
    }
    if (helpers.driver.enabled) {
      summary.push({
        type: '司机',
        count: helpers.driver.count
      })
    }
    return summary
  },

  buildDietProfile() {
    const { dietGoals, tastePreferences, dietTaboos, budgetLevel } = this.data.form
    return {
      goals: dietGoals,
      tastes: tastePreferences,
      taboos: dietTaboos,
      budget: budgetLevel,
      consumptionLevel: budgetLevel === '实惠' ? 'budget' : budgetLevel === '精致' ? 'luxury' : 'value',
      aesthetic: dietGoals.includes('seasonal') ? 'seasonal' : 
                 dietGoals.includes('antiInflammatory') ? 'healthy' : 'homestyle'
    }
  },

  trackOnboardingComplete(profile) {
    try {
      console.log('V3.0 Onboarding completed:', {
        familyType: profile.familyType,
        totalMembers: profile.totalMembers,
        helperCount: profile.helperSummary.length,
        cuisinePrefs: profile.cuisinePrefs,
        dietGoals: profile.dietGoals,
        lifeStyle: profile.lifeStyle
      })
    } catch (e) {
      console.log('Track error:', e)
    }
  },

  onHide() {
    const draft = {
      currentStep: this.data.currentStep,
      form: this.data.form,
      regionText: this.data.regionText,
      locationStatus: this.data.locationStatus
    }
    wx.setStorageSync('onboarding_draft', draft)
  },

  onUnload() {
    wx.removeStorageSync('onboarding_draft')
  }
})