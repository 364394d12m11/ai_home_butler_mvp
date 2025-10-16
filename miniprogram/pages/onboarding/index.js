// pages/onboarding/index.js - V5.3精简版
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
      // ✅ V5.3: 第二页仅保留生活风格和AI语气
      lifeStyle: '',
      aiTone: ''
    },
    
    hasAnyHelper: false,
    
    childAgeOptions: {
      years: Array.from({length: 19}, (_, i) => i),
      months: Array.from({length: 12}, (_, i) => i + 1)
    },
    
    cleanerFrequencies: ['每周1次', '每周2-3次', '每天1次', '不固定']
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

  onLifeStyleSelect(e) {
    this.setData({ 'form.lifeStyle': e.currentTarget.dataset.value })
  },

  onAiToneSelect(e) {
    this.setData({ 'form.aiTone': e.currentTarget.dataset.value })
  },

  nextStep() {
    if (!this.validateCurrentStep()) return
    const nextStep = Math.min(this.data.currentStep + 1, 2)  // ✅ 改为最多2步
    this.setData({ currentStep: nextStep })
    wx.vibrateShort()
    setTimeout(() => {
      wx.pageScrollTo({ scrollTop: 0, duration: 300 })
    }, 100)
    if (nextStep === 2) {
      wx.showToast({ title: '了解啦，最后设置下风格和语气～', icon: 'none', duration: 2000 })
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
    
    // ✅ V5.3: 精简版保存逻辑（内联实现）
    const formData = this.data.form
    
    // 辅助函数
    const buildFamilyProfile = (formData) => {
      const { familyType, childCount, childrenInfo } = formData
      if (familyType === 'single') {
        return `1成人(${formData.gender})`
      } else if (familyType === 'couple') {
        return '2成人'
      } else if (familyType === 'hasChild') {
        const childDesc = childrenInfo.map(child => {
          const ageDesc = child.years <= 2 ? `${child.years}岁${child.months}个月` : `${child.years}岁`
          const genderDesc = child.gender === 'skip' ? '' : (child.gender === 'boy' ? '男孩' : '女孩')
          return `${ageDesc}${genderDesc}`
        }).join('、')
        return `2成人+${childCount}儿童(${childDesc})`
      }
      return '未知结构'
    }
    
    const calculateTotalMembers = (formData) => {
      if (formData.familyType === 'single') return 1
      if (formData.familyType === 'couple') return 2
      if (formData.familyType === 'hasChild') return 2 + formData.childCount
      return 0
    }
    
    const mapHelperType = (type) => {
      const map = { 'nanny': '保姆', 'cleaner': '钟点工', 'driver': '司机' }
      return map[type] || type
    }
    
    const mapAiTone = (tone) => {
      const map = { '温柔陪伴': '温柔', '干练高效': '干练', '幽默轻松': '幽默' }
      return map[tone] || '温柔'
    }
    
    const getHelperDuties = (type) => {
      const duties = {
        'nanny': ['做饭', '保洁', '照顾孩子'],
        'cleaner': ['保洁'],
        'driver': ['接送', '采买']
      }
      return duties[type] || []
    }
    
    // 主画像
    const profileV3 = {
      version: '5.3',
      city: formData.city,
      family_profile: buildFamilyProfile(formData),
      total_members: calculateTotalMembers(formData),
      family_type: formData.familyType,
      has_child: formData.familyType === 'hasChild',
      child_count: formData.childCount || 0,
      children_info: formData.childrenInfo || [],
      life_style: formData.lifeStyle,
      ai_tone: mapAiTone(formData.aiTone),
      has_pet: formData.hasPet || false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      onboarding_done: true
    }
    
    // 帮手配置
    const helpersV3 = Object.entries(formData.helpers)
      .filter(([type, config]) => config.enabled)
      .map(([type, config]) => ({
        type: mapHelperType(type),
        count: config.count,
        frequency: config.frequency || '每日',
        duties: getHelperDuties(type)
      }))
    
    // 饮食偏好（初始化为空）
    const dietPrefV3 = {
      goals: [],
      allergies: [],
      budget: '',
      taste: [],
      taboos: [],
      rhythm: {},
      cuisine_prefs: [],
      setup_completed: false
    }
    
    // 保存
    set(KEY.PROFILE_V3, profileV3)
    set(KEY.HELPERS_V3, helpersV3)
    set(KEY.DIET_PREF_V3, dietPrefV3)
    
    // 兼容旧格式
    const legacyProfile = {
      city: formData.city,
      familyType: formData.familyType,
      gender: formData.gender,
      childCount: formData.childCount,
      childrenInfo: formData.childrenInfo,
      helpers: formData.helpers,
      hasPet: formData.hasPet,
      lifeStyle: formData.lifeStyle,
      aiTone: formData.aiTone,
      onboarding_done: true,
      setup_completed: false,
      version: '5.3'
    }
    set(KEY.PROFILE, legacyProfile)
    
    console.log('V5.3建档完成:', { profileV3, helpersV3, dietPrefV3 })
    
    wx.showToast({ title: '建档完成 🎉', icon: 'success', duration: 1500 })
    
    setTimeout(() => {
      wx.showModal({
        title: '建档完成',
        content: `已为你生成家庭画像～\n\n饮食偏好将在首次生成菜单时设置。`,
        showCancel: false,
        confirmText: '进入',
        success: () => {
          wx.reLaunch({ url: '/pages/home/index' })
        }
      })
    }, 1500)
    
    this.trackOnboardingComplete(profileV3)
  },

  calculateTotalMembers() {
    const { familyType, childCount } = this.data.form
    let total = 0
    if (familyType === 'single') total = 1
    else if (familyType === 'couple') total = 2
    else if (familyType === 'hasChild') total = 2 + childCount
    return total
  },

  trackOnboardingComplete(profile) {
    try {
      console.log('V5.3 Onboarding completed:', {
        familyType: profile.familyType,
        totalMembers: profile.totalMembers,
        lifeStyle: profile.lifeStyle,
        aiTone: profile.aiTone
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