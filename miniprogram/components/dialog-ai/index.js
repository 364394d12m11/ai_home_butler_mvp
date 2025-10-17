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
    isVoiceMode: false,  // ← 新增：是否语音模式
    recording: false,
    recordTime: 0,
    recordTimer: null,
    voiceContext: null,  // 当前播放的语音上下文
    currentPlayingIndex: -1,  // 当前播放的消息索引
    processing: false,
    messages: [] // 对话历史
  },
  
  methods: {

// 切换语音/文字模式
toggleVoiceMode() {
  this.setData({ 
    isVoiceMode: !this.data.isVoiceMode 
  })
},

// 从相册选择
async chooseFromAlbum() {
  if (!this.checkRateLimit('image', 3000)) {
    return
  }
  
  try {
    const res = await wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],  // 只允许相册
      sizeType: ['compressed']
    })
    
    await this.handleImageUpload(res.tempFiles[0].tempFilePath)
  } catch (e) {
    if (!e.errMsg?.includes('cancel')) {
      this.showError('选择图片失败')
    }
  }
},

// 拍照
async takePhoto() {
  if (!this.checkRateLimit('image', 3000)) {
    return
  }
  
  try {
    const res = await wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],  // 只允许拍照
      sizeType: ['compressed']
    })
    
    await this.handleImageUpload(res.tempFiles[0].tempFilePath)
  } catch (e) {
    if (!e.errMsg?.includes('cancel')) {
      this.showError('拍照失败')
    }
  }
},

// 处理图片上传（复用逻辑）
async handleImageUpload(filePath) {
  this.setData({ processing: true })
  this.addMessage('user', '[图片]', { 
    type: 'image', 
    url: filePath 
  })
  
  try {
    const uploadResult = await wx.cloud.uploadFile({
      cloudPath: `fridge/${Date.now()}.jpg`,
      filePath: filePath
    })
    
    const result = await this.callAIRouter({
      modality: 'image',
      payload: { imageUrl: uploadResult.fileID },
      context: this.getContext()
    })
    
    this.handleAIResponse(result)
    this.trackEvent('image_sent', { success: true })
    
  } catch (e) {
    this.showError('图片处理失败')
  } finally {
    this.setData({ processing: false })
  }
},

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
      console.log('========== 📤 发送文本消息 ==========')
      
      const text = this.data.inputText.trim()
      console.log('输入内容:', text)
      
      if (!text) return
      
      // 防抖检查
      if (!this.checkRateLimit('text', 1000)) {
        wx.showToast({ title: '发送太快了', icon: 'none' })
        return
      }
      
      this.addMessage('user', text)
      this.setData({ inputText: '', processing: true })
      
      try {
        console.log('🔄 开始调用 callAIRouter')
        
        const result = await this.callAIRouter({
          modality: 'text',
          payload: { text },
          context: this.getContext()
        })
        
        console.log('✅ 收到AI响应:', result)
        
        // ========== 确保调用 handleAIResponse ==========
        this.handleAIResponse(result)
        
      } catch (e) {
        console.error('❌ 发送失败:', e)
        // ========== 改这里：不要直接显示错误 ==========
        this.addMessage('assistant', '抱歉，处理失败了，请重试')
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
      this.addMessage('user', '[语音消息]', { 
        type: 'voice',
        duration: this.data.recordTime,  // ← 添加时长
        audioPath: audioPath
      })
      
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
    
// ==================== 语音播放控制 ====================

// 切换播放/暂停
toggleVoicePlay(e) {
  const index = e.currentTarget.dataset.index
  const message = this.data.messages[index]
  
  if (!message || message.meta.type !== 'voice') return
  
  // 如果是同一条消息
  if (this.data.currentPlayingIndex === index) {
    if (message.meta.playing) {
      // 暂停
      this.pauseVoice(index)
    } else {
      // 继续播放
      this.resumeVoice(index)
    }
  } else {
    // 停止当前播放，播放新的
    this.stopCurrentVoice()
    this.playVoice(index)
  }
},

// 播放语音
playVoice(index) {
  const messages = this.data.messages
  const message = messages[index]
  
  if (!message.meta.audioUrl && !message.meta.audioPath) {
    wx.showToast({ title: '语音已过期', icon: 'none' })
    return
  }
  
  const audioSrc = message.meta.audioUrl || message.meta.audioPath
  
  // 创建音频上下文
  const innerAudioContext = wx.createInnerAudioContext()
  innerAudioContext.src = audioSrc
  innerAudioContext.playbackRate = message.meta.playbackRate || 1.0
  
  // 播放
  innerAudioContext.play()
  
  // 更新状态
  messages[index].meta.playing = true
  messages[index].meta.listened = true
  this.setData({ 
    messages,
    currentPlayingIndex: index,
    voiceContext: innerAudioContext
  })
  
  // 监听播放进度
  innerAudioContext.onTimeUpdate(() => {
    messages[index].meta.currentTime = Math.floor(innerAudioContext.currentTime)
    this.setData({ messages })
  })
  
  // 播放完成
  innerAudioContext.onEnded(() => {
    messages[index].meta.playing = false
    messages[index].meta.currentTime = 0
    this.setData({ 
      messages,
      currentPlayingIndex: -1,
      voiceContext: null
    })
  })
  
  // 播放错误
  innerAudioContext.onError((res) => {
    console.error('播放失败:', res)
    wx.showToast({ title: '播放失败', icon: 'none' })
    messages[index].meta.playing = false
    this.setData({ messages })
  })
},

// 暂停播放
pauseVoice(index) {
  if (this.data.voiceContext) {
    this.data.voiceContext.pause()
    
    const messages = this.data.messages
    messages[index].meta.playing = false
    this.setData({ messages })
  }
},

// 继续播放
resumeVoice(index) {
  if (this.data.voiceContext) {
    this.data.voiceContext.play()
    
    const messages = this.data.messages
    messages[index].meta.playing = true
    this.setData({ messages })
  }
},

// 停止当前播放
stopCurrentVoice() {
  if (this.data.currentPlayingIndex >= 0) {
    if (this.data.voiceContext) {
      this.data.voiceContext.stop()
    }
    
    const messages = this.data.messages
    messages[this.data.currentPlayingIndex].meta.playing = false
    messages[this.data.currentPlayingIndex].meta.currentTime = 0
    this.setData({ 
      messages,
      currentPlayingIndex: -1,
      voiceContext: null
    })
  }
},

// 长按显示菜单（倍速、转文字等）
showVoiceMenu(e) {
  const index = e.currentTarget.dataset.index
  const message = this.data.messages[index]
  
  if (!message || message.meta.type !== 'voice') return
  
  const duration = message.meta.duration || 0
  const itemList = []
  
  // 超过10秒才能倍速
  if (duration > 10) {
    const currentRate = message.meta.playbackRate || 1.0
    if (currentRate === 1.0) {
      itemList.push('2倍速播放')
    } else {
      itemList.push('正常播放')
    }
  }
  
  itemList.push('转文字')
  itemList.push('删除')
  
  wx.showActionSheet({
    itemList: itemList,
    success: (res) => {
      const action = itemList[res.tapIndex]
      
      if (action === '2倍速播放') {
        this.setVoiceSpeed(index, 2.0)
      } else if (action === '正常播放') {
        this.setVoiceSpeed(index, 1.0)
      } else if (action === '转文字') {
        this.voiceToText(index)
      } else if (action === '删除') {
        this.deleteMessage(index)
      }
    }
  })
},

// 设置倍速
setVoiceSpeed(index, rate) {
  const messages = this.data.messages
  messages[index].meta.playbackRate = rate
  this.setData({ messages })
  
  // 如果正在播放，更新播放速度
  if (this.data.currentPlayingIndex === index && this.data.voiceContext) {
    this.data.voiceContext.playbackRate = rate
  }
  
  wx.showToast({ 
    title: rate === 1.0 ? '已恢复正常速度' : `已设置${rate}倍速`, 
    icon: 'success',
    duration: 1500
  })
},

// 语音转文字
async voiceToText(index) {
  wx.showLoading({ title: '转换中...' })
  
  // TODO: 调用语音识别API
  setTimeout(() => {
    wx.hideLoading()
    wx.showToast({ title: '功能开发中', icon: 'none' })
  }, 1000)
},

// 删除消息
deleteMessage(index) {
  wx.showModal({
    content: '确定删除这条消息？',
    success: (res) => {
      if (res.confirm) {
        const messages = this.data.messages
        messages.splice(index, 1)
        this.setData({ messages })
      }
    }
  })
},

    // ==================== AI 交互 ====================
    async callAIRouter(params) {
      console.log('========== 📡 调用云函数 aiRouter ==========')
      console.log('请求参数:', JSON.stringify(params))
      
      try {
        const result = await wx.cloud.callFunction({
          name: 'aiRouter',
          data: params
        })
        
        console.log('✅ 云函数返回:', result)
        
        if (!result || !result.result) {
          throw new Error('云函数返回数据为空')
        }
        
        return result.result
        
      } catch (error) {
        console.error('❌ 云函数调用失败:', error)
        throw error
      }
    },
    
    handleAIResponse(response) {
      console.log('========== 📥 handleAIResponse ==========')
      console.log('response:', JSON.stringify(response))
      
      if (!response) {
        this.addMessage('assistant', '服务器无响应')
        return
      }
      
      // ========== 显示AI回复 ==========
      const replyText = response.reply || '处理完成'
      console.log('准备显示回复:', replyText)
      
      this.addMessage('assistant', replyText)
      
      // 应用UI补丁（如果有）
      if (response.ui_patch && response.ui_patch.toast) {
        wx.showToast({ 
          title: response.ui_patch.toast, 
          icon: 'none',
          duration: 2000
        })
      }
    },
    
    // ==================== 辅助方法 ====================
    addMessage(role, content, meta = {}) {
      console.log('========== addMessage ==========')
      console.log('role:', role)
      console.log('content:', content)
      console.log('meta:', meta)
      
      const messages = this.data.messages || []
      messages.push({
        role: role,  // 'user' 或 'assistant'
        content: content,
        meta: meta,
        timestamp: Date.now()
      })
      
      this.setData({ 
        messages: messages,
        lastMessageId: `msg-${messages.length - 1}`
      })
      
      console.log('✅ 消息已添加，总数:', messages.length)
    },
    
    getContext() {
      // 获取当前页面上下文（用户画像、当前菜单等）
      try {
        const pages = getCurrentPages()
        const currentPage = pages[pages.length - 1]
        
        return {
          page: 'diet',
          userProfile: {}, // 暂时返回空对象
          currentMenu: currentPage?.data?.selectedDishes || {},
          candidatePool: currentPage?.data?.candidatePool || {}
        }
      } catch (e) {
        console.error('获取上下文失败:', e)
        return {
          page: 'diet',
          userProfile: {},
          currentMenu: {},
          candidatePool: {}
        }
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
// 关闭对话框（统一方法）
close() {
  console.log('========== 关闭Dialog ==========')
  this.triggerEvent('close')
},

// 点击遮罩关闭（阻止在内容区冒泡）
onMaskTap(e) {
  // 只有点击遮罩本身才关闭，点击内容区不关闭
  if (e.target === e.currentTarget) {
    console.log('========== 点击遮罩，关闭Dialog ==========')
    this.close()
  }
}
  }
})