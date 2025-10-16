// pages/profile/tone/index.js - V4.1语气设置页面
const { get, set, getUserProfileV3 } = require('../../../utils/storage')
const { generateFamilyTone, TONE_TYPES } = require('../../../utils/perception_v4')
const { collectDailyData } = require('../../../utils/reflection_v4')

Page({
  data: {
    currentTone: '温柔',
    previewGreeting: '正在生成预览...',
    toneOptions: [
      {
        key: TONE_TYPES.GENTLE,
        name: '温柔',
        emoji: '🌸',
        desc: '共情、细腻、关怀型',
        color: '#ffb3d9',
        bgColor: 'linear-gradient(135deg, #ffb3d9 0%, #ffc9e3 100%)',
        example: '早安🌞，阳光正好，今天也要轻松一点'
      },
      {
        key: TONE_TYPES.CONCISE,
        name: '简练',
        emoji: '⚡',
        desc: '高效、理性、极简',
        color: '#66ccff',
        bgColor: 'linear-gradient(135deg, #66ccff 0%, #99ddff 100%)',
        example: '早安，晴，20°'
      },
      {
        key: TONE_TYPES.HUMOROUS,
        name: '幽默',
        emoji: '😄',
        desc: '调皮、有温度、自然',
        color: '#ffcc66',
        bgColor: 'linear-gradient(135deg, #ffcc66 0%, #ffdd99 100%)',
        example: '早安🌞！太阳公公已经打卡上班了，你呢？'
      }
    ]
  },

  onLoad() {
    this.loadCurrentTone()
    this.generatePreview()
  },

  // 加载当前语气设置
  loadCurrentTone() {
    const userDataV3 = getUserProfileV3()
    const profile = userDataV3.isV3 ? userDataV3.profile : get('USER_PROFILE', {})
    const currentTone = profile.ai_tone || TONE_TYPES.GENTLE
    
    this.setData({ currentTone })
  },

  // 选择语气
  selectTone(e) {
    const tone = e.currentTarget.dataset.tone
    this.setData({ currentTone: tone })
    this.generatePreview()
    this.saveToneSettings(tone)
  },

  // 保存语气设置
  saveToneSettings(tone) {
    // 更新V3用户画像
    const userDataV3 = getUserProfileV3()
    if (userDataV3.isV3) {
      const profile = { ...userDataV3.profile }
      profile.ai_tone = tone
      set('USER_PROFILE_V3', profile)
    }
    
    // 兼容旧版本
    const legacyProfile = get('USER_PROFILE', {})
    legacyProfile.ai_tone = tone
    set('USER_PROFILE', legacyProfile)
    
    wx.showToast({
      title: `已切换为「${tone}」语气`,
      icon: 'success',
      duration: 1500
    })
    // V4.2 数据收集
collectDailyData({ type: 'tone_switch' })
  },

  // 生成预览语句
  generatePreview() {
    const { currentTone } = this.data
    
    // 模拟当前环境数据
    const mockWeather = {
      now: { text: '晴', temp: '22' },
      daily: { max: '25', min: '18' }
    }
    
    const mockProfile = {
      ai_tone: currentTone,
      has_child: false,
      health_goal: null
    }
    
    const mockSolarTerm = { name: '' }
    const currentHour = new Date().getHours()
    let timeSlot = 'morning'
    if (currentHour >= 12 && currentHour < 18) timeSlot = 'afternoon'
    else if (currentHour >= 18 && currentHour < 22) timeSlot = 'evening'
    else if (currentHour >= 22 || currentHour < 6) timeSlot = 'night'
    
    try {
      const result = generateFamilyTone(mockWeather, mockSolarTerm, mockProfile, timeSlot)
      this.setData({ previewGreeting: result.greeting })
    } catch (e) {
      console.error('生成预览失败:', e)
      // 使用静态示例
      const option = this.data.toneOptions.find(opt => opt.key === currentTone)
      this.setData({ previewGreeting: option?.example || '语气预览生成中...' })
    }
  },

  // 重新生成预览（换一句）
  regeneratePreview() {
    this.generatePreview()
    
    // 简单的触觉反馈
    wx.vibrateShort?.()
  },

  // 测试语气效果
  testToneEffect(e) {
    const tone = e.currentTarget.dataset.tone
    const option = this.data.toneOptions.find(opt => opt.key === tone)
    
    wx.showModal({
      title: `${option.emoji} ${option.name}语气示例`,
      content: option.example,
      showCancel: false,
      confirmText: '好的'
    })
  },

  // 查看语气说明
  showToneDescription() {
    const content = `🌸 温柔：共情细腻，温暖关怀，适合需要情感支持的家庭

⚡ 简练：高效理性，言简意赅，适合快节奏生活的用户

😄 幽默：调皮自然，轻松有趣，为生活增添乐趣

您可以随时在设置中调整语气风格，小橙子会立即适应您的喜好。`

    wx.showModal({
      title: 'AI语气说明',
      content: content,
      showCancel: false,
      confirmText: '知道了'
    })
  }
})