// miniprogram/pages/diet/after-meal/index.js
Page({
  data: {
    photoTaken: false,
    photoPath: '',
    analysisStep: 0, // 0: 未开始, 1: 识别菜品, 2: 分析剩余, 3: 学习权重
    
    // 识别结果
    identifiedDishes: [],
    analysisResults: [],
    overallConfidence: 0,
    
    // 学习效果
    learningInsights: [],
    recommendationChanges: {
      increase: [],
      decrease: []
    },
    
    // 界面状态
    showExample: false
  },

  onLoad() {
    // 页面加载时的初始化
  },

  // 相机错误处理
  cameraError(e) {
    console.error('相机错误:', e)
    wx.showToast({ title: '相机初始化失败', icon: 'none' })
  },

  // 拍照
  takePhoto() {
    const ctx = wx.createCameraContext()
    ctx.takePhoto({
      quality: 'high',
      success: (res) => {
        this.setData({ 
          photoTaken: true, 
          photoPath: res.tempImagePath 
        })
        this.startAnalysis(res.tempImagePath)
      },
      fail: (err) => {
        console.error('拍照失败:', err)
        wx.showToast({ title: '拍照失败', icon: 'none' })
      }
    })
  },

  // 从相册选择
  chooseFromGallery() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: (res) => {
        this.setData({ 
          photoTaken: true, 
          photoPath: res.tempFilePaths[0] 
        })
        this.startAnalysis(res.tempFilePaths[0])
      }
    })
  },

  // 重新拍摄
  retakePhoto() {
    this.setData({ 
      photoTaken: false, 
      photoPath: '', 
      analysisStep: 0,
      identifiedDishes: [],
      analysisResults: [],
      overallConfidence: 0
    })
  },

  // 开始分析
  async startAnalysis(imagePath) {
    try {
      // 步骤1: 识别菜品
      this.setData({ analysisStep: 1 })
      await this.identifyDishes(imagePath)
      
      // 步骤2: 分析剩余比例
      this.setData({ analysisStep: 2 })
      await this.analyzeRemaining()
      
      // 步骤3: 学习偏好权重
      this.setData({ analysisStep: 3 })
      await this.learnPreferences()
      
    } catch (e) {
      console.error('分析失败:', e)
      wx.showToast({ title: '分析失败，请重试', icon: 'none' })
    }
  },

  // 识别菜品种类
  async identifyDishes(imagePath) {
    return new Promise((resolve) => {
      setTimeout(() => {
        // 模拟AI识别结果
        const mockDishes = [
          { name: '西红柿炒蛋', confidence: 0.95 },
          { name: '青椒土豆丝', confidence: 0.88 },
          { name: '蒜蓉西兰花', confidence: 0.92 }
        ]
        
        this.setData({ identifiedDishes: mockDishes })
        resolve(mockDishes)
      }, 1500)
    })
  },

  // 分析剩余比例
  async analyzeRemaining() {
    return new Promise((resolve) => {
      setTimeout(() => {
        const { identifiedDishes } = this.data
        
        // 模拟剩余比例分析
        const analysisResults = identifiedDishes.map(dish => {
          const remainingPercent = Math.floor(Math.random() * 80) + 10 // 10-90%
          const eatenPercent = 100 - remainingPercent
          
          let popularityLevel, popularityText, futureWeight
          
          if (eatenPercent >= 80) {
            popularityLevel = 'high'
            popularityText = '非常受欢迎'
            futureWeight = 15
          } else if (eatenPercent >= 50) {
            popularityLevel = 'medium'
            popularityText = '较受欢迎'
            futureWeight = 5
          } else {
            popularityLevel = 'low'
            popularityText = '不太受欢迎'
            futureWeight = -10
          }
          
          return {
            name: dish.name,
            remainingPercent: remainingPercent,
            popularityLevel,
            popularityText,
            futureWeight,
            confidence: dish.confidence,
            showCorrection: false
          }
        })
        
        // 计算整体置信度
        const avgConfidence = analysisResults.reduce((sum, item) => sum + item.confidence, 0) / analysisResults.length
        const overallConfidence = Math.round(avgConfidence * 100)
        
        this.setData({ 
          analysisResults,
          overallConfidence 
        })
        
        resolve()
      }, 2000)
    })
  },

  // 学习偏好权重
  async learnPreferences() {
    return new Promise((resolve) => {
      setTimeout(() => {
        const { analysisResults } = this.data
        
        // 生成学习洞察
        const insights = []
        const increaseTypes = []
        const decreaseTypes = []
        
        analysisResults.forEach(result => {
          if (result.popularityLevel === 'high') {
            insights.push(`${result.name} 很受欢迎，AI学会了这类菜品的偏好特征`)
            increaseTypes.push(this.getDishType(result.name))
          } else if (result.popularityLevel === 'low') {
            insights.push(`${result.name} 剩余较多，AI将减少类似推荐`)
            decreaseTypes.push(this.getDishType(result.name))
          }
        })
        
        this.setData({
          learningInsights: insights,
          recommendationChanges: {
            increase: [...new Set(increaseTypes)],
            decrease: [...new Set(decreaseTypes)]
          }
        })
        
        resolve()
      }, 1500)
    })
  },

  // 获取菜品类型
  getDishType(dishName) {
    const typeMap = {
      '西红柿炒蛋': '家常菜',
      '青椒土豆丝': '素菜',
      '蒜蓉西兰花': '清淡菜',
      '宫保鸡丁': '下饭菜'
    }
    return typeMap[dishName] || '家常菜'
  },

  // 切换校正状态
  toggleCorrection(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    const results = [...this.data.analysisResults]
    results[index].showCorrection = !results[index].showCorrection
    
    this.setData({ analysisResults: results })
  },

  // 校正剩余比例
  correctRemaining(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    const percent = parseInt(e.detail.value)
    
    const results = [...this.data.analysisResults]
    results[index].remainingPercent = percent
    
    // 重新计算受欢迎程度
    const eatenPercent = 100 - percent
    if (eatenPercent >= 80) {
      results[index].popularityLevel = 'high'
      results[index].popularityText = '非常受欢迎'
      results[index].futureWeight = 15
    } else if (eatenPercent >= 50) {
      results[index].popularityLevel = 'medium'
      results[index].popularityText = '较受欢迎'
      results[index].futureWeight = 5
    } else {
      results[index].popularityLevel = 'low'
      results[index].popularityText = '不太受欢迎'
      results[index].futureWeight = -10
    }
    
    this.setData({ analysisResults: results })
  },

  // 显示示例
  showExample() {
    this.setData({ showExample: true })
  },

  // 关闭示例
  closeExample() {
    this.setData({ showExample: false })
  },

  // 跳过学习
  skipLearning() {
    wx.showModal({
      title: '跳过学习',
      content: '确定要跳过本次偏好学习吗？AI将不会根据这次用餐调整推荐。',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack()
        }
      }
    })
  },

  // 确认学习
  async confirmLearning() {
    wx.showLoading({ title: '保存学习结果...', mask: true })
    
    try {
      // 模拟保存学习数据
      const learningData = {
        timestamp: new Date(),
        dishes: this.data.analysisResults.map(result => ({
          name: result.name,
          remainingPercent: result.remainingPercent,
          popularityLevel: result.popularityLevel,
          futureWeight: result.futureWeight
        })),
        overallConfidence: this.data.overallConfidence,
        insights: this.data.learningInsights
      }
      
      // 保存到本地存储
      const history = wx.getStorageSync('MEAL_LEARNING_HISTORY') || []
      history.unshift(learningData)
      
      // 只保留最近20条记录
      if (history.length > 20) {
        history.splice(20)
      }
      
      wx.setStorageSync('MEAL_LEARNING_HISTORY', history)
      
      // 模拟上传到云端
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      wx.showToast({ title: '学习完成', icon: 'success' })
      
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 查看历史记录
  viewHistory() {
    wx.navigateTo({ url: '/pages/diet/learning-history/index' })
  }
})