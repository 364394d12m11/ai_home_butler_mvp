// miniprogram/pages/reports/index.js - V3.0 含六维画像分析
const { envId } = require('../../config/index')
const db = wx.cloud.database({ env: envId })
const { getUserProfileV3, get, KEY } = require('../../utils/storage')

Page({
  data: {
    loading: true,
    currentTab: 'week', // week | dimensions | trends
    
    // 周报数据
    week: null,   // { span:{start,end}, kpisView:{...}, suggestions:[...] }
    empty: false,
    
    // V3.0 六维画像数据
    sixDimensions: null,
    dimensionsHistory: [],
    
    // 趋势数据
    trendsData: null,
    
    // 用户数据
    userDataV3: {}
  },

  onShow() { 
    this.loadUserData()
    this.loadCurrentTab() 
  },

  // 加载用户数据
  loadUserData() {
    const userDataV3 = getUserProfileV3()
    this.setData({ userDataV3 })
  },

  // 根据当前标签页加载对应数据
  loadCurrentTab() {
    const { currentTab } = this.data
    switch (currentTab) {
      case 'week':
        this.loadWeekly()
        break
      case 'dimensions':
        this.loadSixDimensions()
        break
      case 'trends':
        this.loadTrends()
        break
        case 'reflection':
  wx.navigateTo({ url: '/pages/reports/reflection/index' })
  break
    }
  },

  // 切换标签页
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
    this.loadCurrentTab()
  },

  // 原有的周报逻辑
  async loadWeekly() {
    this.setData({ loading: true, empty: false })
    let doc = await this.fetchLatestWeek()

    // 首次没有就现场生成一次
    if (!doc) {
      try {
        await wx.cloud.callFunction({ name: 'genReport', data: { type: 'week' } })
        doc = await this.fetchLatestWeek()
      } catch (e) {
        console.warn('genReport week failed:', e)
      }
    }

    if (!doc) {
      this.setData({ loading: false, week: null, empty: true })
      return
    }

    // —— 在 JS 里把展示数值算好（WXML 不允许 toFixed 调用）——
    const k = doc.kpis || {}
    const kpisView = {
      studyOnTimePct: Math.round(((k.studyOnTime || 0) * 100)),
      choresDonePct : Math.round(((k.choresDone  || 0) * 100)),
      dietClicks    : Number(k.dietClicks || 0)
    }

    this.setData({
      loading: false,
      empty: false,
      week: {
        span: doc.span || {},
        kpisView,
        suggestions: doc.suggestions || [],
        createdAt: doc.createdAt || Date.now()
      }
    })
  },

  async fetchLatestWeek() {
    try {
      const r = await db.collection('reports')
        .where({ type: 'week' })
        .orderBy('createdAt', 'desc')
        .limit(1).get()
      return r?.data?.[0] || null
    } catch (e) {
      console.warn('fetchLatestWeek:', e)
      return null
    }
  },

  // V3.0 新增：加载六维画像分析
  async loadSixDimensions() {
    this.setData({ loading: true })
    
    try {
      const { userDataV3 } = this.data
      
      if (!userDataV3.isV3 || !userDataV3.sixDimensions) {
        this.setData({ 
          loading: false, 
          sixDimensions: null,
          empty: true 
        })
        return
      }

      // 计算六维画像的详细分析
      const analysis = this.analyzeSixDimensions(userDataV3.sixDimensions)
      
      // 加载历史趋势（如果有的话）
      const history = await this.fetchDimensionsHistory()
      
      this.setData({
        loading: false,
        empty: false,
        sixDimensions: analysis,
        dimensionsHistory: history
      })
      
    } catch (e) {
      console.error('加载六维画像失败:', e)
      this.setData({ loading: false, empty: true })
    }
  },

  // 分析六维画像数据
  analyzeSixDimensions(dimensions) {
    const analysis = {
      overall: this.calculateOverallScore(dimensions),
      dimensions: [],
      insights: [],
      recommendations: []
    }

    // 分析各维度
    Object.entries(dimensions).forEach(([key, value]) => {
      const dimAnalysis = {
        key,
        name: this.getDimensionName(key),
        emoji: this.getDimensionEmoji(key),
        score: value.score,
        desc: value.desc,
        level: this.getScoreLevel(value.score),
        trend: this.calculateTrend(key, value.score), // 与历史对比
        insights: this.generateDimensionInsights(key, value),
        actions: this.generateActionItems(key, value.score)
      }
      analysis.dimensions.push(dimAnalysis)
    })

    // 生成整体洞察
    analysis.insights = this.generateOverallInsights(dimensions)
    analysis.recommendations = this.generateRecommendations(dimensions)

    return analysis
  },

  // 计算整体得分
  calculateOverallScore(dimensions) {
    const scores = Object.values(dimensions).map(d => d.score)
    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length
    
    return {
      score: Math.round(average),
      level: this.getScoreLevel(average),
      balance: this.calculateBalance(scores)
    }
  },

  // 计算平衡度
  calculateBalance(scores) {
    const avg = scores.reduce((sum, score) => sum + score, 0) / scores.length
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - avg, 2), 0) / scores.length
    const stdDev = Math.sqrt(variance)
    
    if (stdDev < 10) return '均衡发展'
    else if (stdDev < 20) return '略有偏重'
    else return '发展不均'
  },

  // 生成维度洞察
  generateDimensionInsights(key, value) {
    const insights = []
    const score = value.score

    switch (key) {
      case 'structure':
        if (score >= 80) insights.push('家庭结构优化良好，资源配置合理')
        else if (score >= 60) insights.push('家庭结构基本稳定，可适当优化')
        else insights.push('家庭结构有优化空间，建议调整资源配置')
        break
        
      case 'lifestyle':
        if (score >= 80) insights.push('生活品质优秀，审美品味较高')
        else if (score >= 60) insights.push('生活方式健康，品质有提升空间')
        else insights.push('生活方式较为基础，建议提升生活品质')
        break
        
      case 'health':
        if (score >= 80) insights.push('健康意识强烈，管理到位')
        else if (score >= 60) insights.push('健康意识良好，可加强执行')
        else insights.push('健康意识有待提升，建议加强管理')
        break
        
      case 'behavior':
        if (score >= 80) insights.push('行为习惯优秀，执行力强')
        else if (score >= 60) insights.push('行为习惯良好，规律性不错')
        else insights.push('行为习惯需要改善，建议提升规律性')
        break
        
      case 'emotion':
        if (score >= 80) insights.push('情绪管理得当，家庭氛围和谐')
        else if (score >= 60) insights.push('情绪状态稳定，偶有波动')
        else insights.push('情绪管理有待加强，需要关注心理健康')
        break
        
      case 'growth':
        if (score >= 80) insights.push('学习成长意识强，持续进步')
        else if (score >= 60) insights.push('有一定成长意识，可加强学习')
        else insights.push('成长意识较弱，建议培养学习习惯')
        break
    }

    return insights
  },

  // 生成行动建议
  generateActionItems(key, score) {
    const actions = []

    if (score < 60) {
      switch (key) {
        case 'structure':
          actions.push('考虑调整家庭分工', '优化时间安排')
          break
        case 'lifestyle': 
          actions.push('提升居住环境', '培养审美品味')
          break
        case 'health':
          actions.push('制定健康计划', '定期体检')
          break
        case 'behavior':
          actions.push('建立日常routines', '提升执行力')
          break
        case 'emotion':
          actions.push('加强沟通交流', '关注心理健康')
          break
        case 'growth':
          actions.push('设立学习目标', '培养新技能')
          break
      }
    } else if (score < 80) {
      actions.push('保持现有优势', '持续优化提升')
    } else {
      actions.push('维持优秀状态', '可指导他人')
    }

    return actions
  },

  // 生成整体洞察
  generateOverallInsights(dimensions) {
    const insights = []
    const scores = Object.entries(dimensions).map(([key, value]) => ({ key, score: value.score }))
    
    // 找出最强和最弱的维度
    const strongest = scores.reduce((max, curr) => curr.score > max.score ? curr : max)
    const weakest = scores.reduce((min, curr) => curr.score < min.score ? curr : min)
    
    insights.push(`您在${this.getDimensionName(strongest.key)}方面表现最为出色`)
    insights.push(`${this.getDimensionName(weakest.key)}是当前需要重点关注的领域`)
    
    // 平衡性分析
    const avgScore = scores.reduce((sum, item) => sum + item.score, 0) / scores.length
    if (avgScore >= 75) {
      insights.push('整体发展水平优秀，各方面较为均衡')
    } else if (avgScore >= 60) {
      insights.push('整体发展良好，有进一步提升空间')
    } else {
      insights.push('整体有较大提升空间，建议重点关注薄弱环节')
    }

    return insights
  },

  // 生成改进建议
  generateRecommendations(dimensions) {
    const recommendations = []
    const scores = Object.entries(dimensions).map(([key, value]) => ({ key, score: value.score }))
    
    // 优先改进最弱的维度
    const weakest = scores.filter(item => item.score < 60)
    
    if (weakest.length > 0) {
      recommendations.push({
        priority: 'high',
        title: '重点改进建议',
        items: weakest.map(item => `提升${this.getDimensionName(item.key)}（当前${item.score}分）`)
      })
    }
    
    // 平衡发展建议
    const unbalanced = scores.filter(item => item.score > 80).length > 0 && scores.filter(item => item.score < 50).length > 0
    
    if (unbalanced) {
      recommendations.push({
        priority: 'medium',
        title: '平衡发展建议',
        items: ['关注薄弱维度的提升', '避免过度偏重某一方面']
      })
    }

    return recommendations
  },

  // 获取历史趋势数据
  async fetchDimensionsHistory() {
    try {
      // 这里可以从数据库获取历史的六维画像数据
      // 暂时返回空数组，后续可以扩展
      return []
    } catch (e) {
      console.warn('获取历史趋势失败:', e)
      return []
    }
  },

  // 计算趋势（与历史对比）
  calculateTrend(dimensionKey, currentScore) {
    // 暂时返回平稳，后续可以基于历史数据计算
    return 'stable' // up | down | stable
  },

  // V3.0 新增：加载趋势分析
  async loadTrends() {
    this.setData({ loading: true })
    
    try {
      // 获取使用数据和行为趋势
      const trendsData = await this.generateTrendsAnalysis()
      
      this.setData({
        loading: false,
        empty: false,
        trendsData
      })
      
    } catch (e) {
      console.error('加载趋势失败:', e)
      this.setData({ loading: false, empty: true })
    }
  },

  // 生成趋势分析
  async generateTrendsAnalysis() {
    const { userDataV3 } = this.data
    
    // 获取使用历史
    const menuHistory = get('MENU_HISTORY', [])
    const userProfile = get('USER_PROFILE', {})
    
    return {
      usage: {
        totalDays: userProfile.activeDays || 0,
        menuGenerations: menuHistory.length,
        averagePerWeek: Math.round((menuHistory.length / Math.max(userProfile.activeDays, 1)) * 7)
      },
      preferences: {
        favoriteGoals: this.analyzeFavoriteGoals(userDataV3.dietPref),
        helpersUtilization: this.analyzeHelpersUsage(userDataV3.helpers),
        budgetTrend: userDataV3.dietPref?.budget || '未设置'
      },
      insights: [
        '您的使用频率保持稳定',
        '饮食偏好趋向健康化',
        '家庭助手配置合理'
      ]
    }
  },

  // 分析偏好的饮食目标
  analyzeFavoriteGoals(dietPref) {
    if (!dietPref || !dietPref.goals) return []
    return dietPref.goals.slice(0, 3) // 返回前3个目标
  },

  // 分析家庭帮手使用情况
  analyzeHelpersUsage(helpers) {
    if (!helpers || helpers.length === 0) return '无帮手，自主管理'
    
    const types = helpers.map(h => h.type).join('、')
    return `已配置${types}`
  },

  // 重新生成（按钮）
  async regen() {
    const { currentTab } = this.data
    
    if (currentTab === 'week') {
      this.setData({ loading: true })
      try {
        await wx.cloud.callFunction({ name: 'genReport', data: { type: 'week', force: true } })
      } catch (e) { console.warn('regen week:', e) }
      await this.loadWeekly()
    } else {
      // 对于六维画像和趋势，重新计算
      this.loadCurrentTab()
    }
  },

  // 工具函数
  getDimensionName(key) {
    const names = {
      structure: '结构维',
      lifestyle: '生活方式维', 
      health: '健康维',
      behavior: '行为维',
      emotion: '情绪人格维',
      growth: '兴趣成长维'
    }
    return names[key] || key
  },

  getDimensionEmoji(key) {
    const emojis = {
      structure: '🏠',
      lifestyle: '🎨',
      health: '💪', 
      behavior: '👨‍🍳',
      emotion: '😌',
      growth: '🌱'
    }
    return emojis[key] || '📊'
  },

  getScoreLevel(score) {
    if (score >= 80) return '优秀'
    if (score >= 60) return '良好'
    if (score >= 40) return '一般' 
    return '待提升'
  }
})