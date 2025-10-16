// pages/reports/reflection/index.js - V4.2 每日复盘页面
const { generateDailyReflection, generateWeeklyReflection, getReflectionHistory } = require('../../../utils/reflection_v4')
const { getUserProfileV3, get } = require('../../../utils/storage')

Page({
  data: {
    loading: true,
    currentTab: 'today', // today | week | history
    
    // 今日复盘
    todayReflection: null,
    
    // 本周复盘  
    weeklyReflection: null,
    
    // 历史记录
    historyData: [],
    
    // 空状态
    empty: false,
    
    // 用户数据
    userProfile: {}
  },

  onLoad() {
    this.loadUserProfile()
    this.loadCurrentTab()
  },

  onShow() {
    // 每次显示页面时刷新数据
    this.loadCurrentTab()
  },

  onPullDownRefresh() {
    this.loadCurrentTab().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 加载用户资料
  loadUserProfile() {
    const userDataV3 = getUserProfileV3()
    const profile = userDataV3.isV3 ? userDataV3.profile : get('USER_PROFILE', {})
    this.setData({ userProfile: profile })
  },

  // 切换标签页
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ 
      currentTab: tab,
      loading: true 
    })
    this.loadCurrentTab()
  },

  // 根据当前标签加载数据
  async loadCurrentTab() {
    this.setData({ loading: true, empty: false })
    
    try {
      switch (this.data.currentTab) {
        case 'today':
          await this.loadTodayReflection()
          break
        case 'week':
          await this.loadWeeklyReflection()
          break
        case 'history':
          await this.loadHistoryData()
          break
      }
    } catch (e) {
      console.error('加载复盘数据失败:', e)
      this.setData({ loading: false, empty: true })
    }
  },

  // 加载今日复盘
  async loadTodayReflection() {
    try {
      const today = new Date()
      const dateStr = this.formatDate(today)
      const reflection = generateDailyReflection(dateStr)
      
      if (reflection) {
        this.setData({
          todayReflection: reflection,
          loading: false,
          empty: false
        })
      } else {
        this.setData({
          todayReflection: null,
          loading: false,
          empty: true
        })
      }
    } catch (e) {
      console.error('生成今日复盘失败:', e)
      this.setData({ loading: false, empty: true })
    }
  },

  // 加载本周复盘
  async loadWeeklyReflection() {
    try {
      const reflection = generateWeeklyReflection()
      
      if (reflection) {
        this.setData({
          weeklyReflection: reflection,
          loading: false,
          empty: false
        })
      } else {
        this.setData({
          weeklyReflection: null,
          loading: false,
          empty: true
        })
      }
    } catch (e) {
      console.error('生成周复盘失败:', e)
      this.setData({ loading: false, empty: true })
    }
  },

  // 加载历史数据
  async loadHistoryData() {
    try {
      const history = getReflectionHistory(14) // 获取最近14天
      
      if (history && history.length > 0) {
        // 处理历史数据，添加显示相关的字段
        const processedHistory = history.map(item => ({
          ...item,
          dateDisplay: this.formatDateDisplay(item.date),
          scoreLevel: this.getScoreLevel(item.score),
          scoreColor: this.getScoreColor(item.score)
        }))
        
// 计算统计数据
const averageScore = processedHistory.length > 0 ? 
  Math.round(processedHistory.reduce((sum, item) => sum + item.score, 0) / processedHistory.length) : 0
const totalInteractions = processedHistory.reduce((sum, item) => sum + item.interactions, 0)

this.setData({
  historyData: processedHistory,
  averageScore: averageScore,
  totalInteractions: totalInteractions,
  loading: false,
  empty: false
})
      } else {
        this.setData({
          historyData: [],
          loading: false,
          empty: true
        })
      }
    } catch (e) {
      console.error('加载历史数据失败:', e)
      this.setData({ loading: false, empty: true })
    }
  },

  // 查看具体日期的复盘
  viewDayReflection(e) {
    const date = e.currentTarget.dataset.date
    if (!date) return
    
    try {
      const reflection = generateDailyReflection(date)
      if (reflection) {
        // 可以跳转到详情页，或者弹窗显示
        this.showReflectionDetail(reflection)
      } else {
        wx.showToast({
          title: '该日期暂无数据',
          icon: 'none'
        })
      }
    } catch (e) {
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  // 显示复盘详情
  showReflectionDetail(reflection) {
    const content = `【${reflection.date} 复盘】

活跃度：${reflection.activityScore}分

${reflection.summary}

主要洞察：
${reflection.insights.map(item => `• ${item}`).join('\n')}

改进建议：
${reflection.suggestions.map(item => `• ${item}`).join('\n')}`

    wx.showModal({
      title: '复盘详情',
      content: content,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  // 分享复盘报告
  shareReflection() {
    const { currentTab, todayReflection, weeklyReflection } = this.data
    
    if (currentTab === 'today' && todayReflection) {
      this.shareToday()
    } else if (currentTab === 'week' && weeklyReflection) {
      this.shareWeek()
    } else {
      wx.showToast({
        title: '暂无可分享的内容',
        icon: 'none'
      })
    }
  },

  // 分享今日复盘
  shareToday() {
    const reflection = this.data.todayReflection
    const shareText = `【小橙子今日复盘】
日期：${reflection.date}
活跃度：${reflection.activityScore}分
${reflection.summary}`

    wx.setClipboardData({
      data: shareText,
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        })
      }
    })
  },

  // 分享周复盘
  shareWeek() {
    const reflection = this.data.weeklyReflection
    const shareText = `【小橙子周复盘】
时间：${reflection.weekStart} ~ ${reflection.weekEnd}
活跃天数：${reflection.stats.activeDays}天
平均活跃度：${reflection.stats.avgActivityScore}分
${reflection.summary}`

    wx.setClipboardData({
      data: shareText,
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        })
      }
    })
  },

  // 查看使用指南
  showGuide() {
    const guideContent = `【复盘系统使用指南】

📊 今日复盘
• 显示当天的使用情况和活跃度得分
• 基于您的AI语气个性化生成总结
• 提供针对性的改进建议

📈 本周复盘  
• 汇总一周的整体表现
• 分析使用习惯和一致性
• 发现使用模式和趋势

📋 历史记录
• 查看最近14天的复盘历史
• 追踪活跃度变化趋势
• 点击可查看具体日期详情

💡 提示
复盘数据基于您在小橙子中的互动行为自动生成，包括菜单生成、设置访问、语气切换等操作。`

    wx.showModal({
      title: '使用指南',
      content: guideContent,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  // 重新生成复盘
  regenerateReflection() {
    wx.showModal({
      title: '重新生成',
      content: '将基于最新数据重新生成复盘报告，确定继续吗？',
      success: (res) => {
        if (res.confirm) {
          this.loadCurrentTab()
          wx.showToast({
            title: '正在重新生成...',
            icon: 'loading'
          })
        }
      }
    })
  },

  // 工具函数：格式化日期
  formatDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  // 工具函数：格式化显示日期
  formatDateDisplay(dateStr) {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    
    if (dateStr === this.formatDate(today)) {
      return '今天'
    } else if (dateStr === this.formatDate(yesterday)) {
      return '昨天'
    } else {
      const month = date.getMonth() + 1
      const day = date.getDate()
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      const weekday = weekdays[date.getDay()]
      return `${month}/${day} ${weekday}`
    }
  },

  // 工具函数：获取得分等级
  getScoreLevel(score) {
    if (score >= 80) return '优秀'
    if (score >= 60) return '良好'
    if (score >= 40) return '一般'
    return '待提升'
  },

  // 工具函数：获取得分颜色
  getScoreColor(score) {
    if (score >= 80) return '#4caf50'
    if (score >= 60) return '#ff9800'
    if (score >= 40) return '#2196f3'
    return '#9e9e9e'
  }
})