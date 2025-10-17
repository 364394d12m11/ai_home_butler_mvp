// components/dialog-ai/index.js
// V5.3-Plus 多模态对话抽屉
// 支持：语音≤60s / 文字 / 图片输入

Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    }
  },
  
  data: {
    inputMode: 'text', // text | voice | image
    inputText: '',
    recording: false,
    recordTime: 0,
    recordTimer: null,
    processing: false,
    messages: [] // 对话历史
  },
  
  methods: {
    // ==================== 模式切换 ====================
    
    switchMode(e) {
      const mode = e.currentTarget.dataset.mode
      this.setData({ inputMode: mode })
      
      // 埋点
      this.trackEvent('switch_input_mode', { mode })
    },
    
    // ==================== 文本输入 ====================
    
    onInputChange(e) {
      this.setData({ inputText: e.detail.value })
    },
    
    async sendText() {
      const text = this.data.inputText.trim()
      if (!text) return
      
      // 防抖检查（1秒内不能重复发送）
      if (!this.checkRateLimit('text', 1000)) {
        wx.showToast({ title: '发送太快了', icon: 'none' })
        return
      }
      
      this.addMessage('user', text)
      this.setData({ inputText: '', processing: true })
      
      try {
        const result = await this.callAIRouter({
          modality: 'text',
          payload: { text },
          context: this.getContext()
        })
        
        this.handleAIResponse(result)
      } catch (e) {
        this.showError('处理失败，请重试')
      } finally {
        this.setData({ processing: false })
      }
    },
    
    // ==================== 语音输入 ====================
    
    startRecord() {
      // 频控：≥5s 才能再次录音
      if (!this.checkRateLimit('voice', 5000)) {
        wx.showToast({ title: '说话太频繁了', icon: 'none' })
        return
      }
      
      const recorderManager = wx.getRecorderManager()
      
      recorderManager.start({
        duration: 60000, // 最长60秒
        format: 'mp3'
      })
      
      this.setData({ recording: true, recordTime: 0 })
      
      // 计时器
      this.data.recordTimer = setInterval(() => {
        const time = this.data.recordTime + 1
        this.setData({ recordTime: time })
        
        if (time >= 60) {
          this.stopRecord()
        }
      }, 1000)
      
      recorderManager.onStop(async (res) => {
        clearInterval(this.data.recordTimer)
        this.setData({ recording: false })
        
        if (this.data.recordTime < 1) {
          wx.showToast({ title: '录音太短了', icon: 'none' })
          return
        }
        
        await this.sendVoice(res.tempFilePath)
      })
      
      // 埋点
      this.trackEvent('voice_start')
    },
    
    stopRecord() {
      const recorderManager = wx.getRecorderManager()
      recorderManager.stop()
    },
    
    async sendVoice(audioPath) {
      this.setData({ processing: true })
      this.addMessage('user', '[语音消息]', { type: 'voice' })
      
      try {
        // 1. 上传音频到云存储
        const uploadResult = await wx.cloud.uploadFile({
          cloudPath: `voice/${Date.now()}.mp3`,
          filePath: audioPath
        })
        
        // 2. 调用AI Router
        const result = await this.callAIRouter({
          modality: 'voice',
          payload: { audioUrl: uploadResult.fileID },
          context: this.getContext()
        })
        
        this.handleAIResponse(result)
        
        // 埋点
        this.trackEvent('voice_sent', { 
          duration: this.data.recordTime,
          success: true 
        })
        
      } catch (e) {
        this.showError('语音处理失败')
        this.trackEvent('voice_sent', { success: false, error: e.message })
      } finally {
        this.setData({ processing: false })
      }
    },
    
    // ==================== 图片输入 ====================
    
    async chooseImage() {
      // 频控：≥10s 才能再次上传图片
      if (!this.checkRateLimit('image', 10000)) {
        wx.showToast({ title: '上传太频繁了', icon: 'none' })
        return
      }
      
      try {
        const res = await wx.chooseImage({
          count: 1,
          sizeType: ['compressed'],
          sourceType: ['camera', 'album']
        })
        
        this.setData({ processing: true })
        this.addMessage('user', '[冰箱照]', { type: 'image', url: res.tempFilePaths[0] })
        
        // 上传到云存储
        const uploadResult = await wx.cloud.uploadFile({
          cloudPath: `fridge/${Date.now()}.jpg`,
          filePath: res.tempFilePaths[0]
        })
        
        // 调用AI Router
        const result = await this.callAIRouter({
          modality: 'image',
          payload: { imageUrl: uploadResult.fileID },
          context: this.getContext()
        })
        
        this.handleAIResponse(result)
        
        // 埋点
        this.trackEvent('image_sent', { success: true })
        
      } catch (e) {
        if (e.errMsg && e.errMsg.includes('cancel')) return
        this.showError('图片处理失败')
        this.trackEvent('image_sent', { success: false, error: e.message })
      } finally {
        this.setData({ processing: false })
      }
    },
    
    // ==================== AI 交互 ====================
    
    async callAIRouter(params) {
      const result = await wx.cloud.callFunction({
        name: 'aiRouter',
        data: params
      })
      
      return result.result
    },
    
    handleAIResponse(response) {
      if (!response.ok) {
        this.showError(response.reply || '处理失败')
        return
      }
      
      // 添加AI回复到对话历史
      this.addMessage('assistant', response.reply)
      
      // 应用UI Patch
      if (response.ui_patch) {
        this.triggerEvent('ui-patch', response.ui_patch)
      }
      
      // 埋点
      this.trackEvent('intent_hit', {
        intent: response.intent,
        confidence: response.confidence
      })
    },
    
    // ==================== 辅助方法 ====================
    
    addMessage(role, content, meta = {}) {
      const messages = this.data.messages
      messages.push({
        role,
        content,
        meta,
        timestamp: Date.now()
      })
      this.setData({ messages })
    },
    
    getContext() {
      // 获取当前页面上下文（用户画像、当前菜单等）
      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1]
      
      return {
        userProfile: getApp().globalData.userProfile || {},
        currentMenu: currentPage.data.selectedDishes || [],
        candidatePool: currentPage.data.candidatePool || {}
      }
    },
    
    showError(message) {
      wx.showToast({
        title: message,
        icon: 'none',
        duration: 2000
      })
    },
    
    // 频控检查
    checkRateLimit(type, minInterval) {
      const lastTime = this.data[`last_${type}_time`] || 0
      const now = Date.now()
      
      if (now - lastTime < minInterval) {
        return false
      }
      
      this.setData({ [`last_${type}_time`]: now })
      return true
    },
    
    // 埋点
    trackEvent(event, params = {}) {
      wx.reportEvent(event, params)
      console.log('📊 埋点:', event, params)
    },
    
    // 关闭对话框
    close() {
      this.triggerEvent('close')
    }
  }
})