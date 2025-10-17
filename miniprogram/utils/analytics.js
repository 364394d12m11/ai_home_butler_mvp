// utils/analytics.js
// V5.3-Plus 埋点系统

/**
 * 埋点事件列表（对应总纲要求）
 */
const EVENTS = {
  // 意图相关
  INTENT_HIT: 'intent_hit',                    // 意图命中
  CLARIFY_SHOWN: 'clarify_shown',              // 澄清提示
  OVERRIDE_APPLIED: 'override_applied',        // 越权应用
  UNDO_CLICKED: 'undo_clicked',                // 撤销点击
  OUTOFSCOPE_REASON: 'outofscope_reason',      // 域外原因
  
  // 多模态输入
  MULTIMODAL_INPUT: 'multimodal_input',        // 多模态输入
  VOICE_START: 'voice_start',                  // 语音开始
  VOICE_SENT: 'voice_sent',                    // 语音发送
  IMAGE_SENT: 'image_sent',                    // 图片发送
  
  // 脏词
  PROFANITY_COUNT: 'profanity_count',          // 脏词次数
  
  // 菜单操作
  DISH_SELECTED: 'dish_selected',              // 菜品选择
  DISH_REPLACED: 'dish_replaced',              // 菜品替换
  MENU_GENERATED: 'menu_generated',            // 菜单生成
  SHOPPING_LIST_EXPORTED: 'shopping_list_exported', // 购物清单导出
  
  // 页面访问
  PAGE_VIEW: 'page_view',                      // 页面访问
  PAGE_LEAVE: 'page_leave'                     // 页面离开
}

/**
 * KQI 指标计算器
 */
class KQICalculator {
  constructor() {
    this.data = {
      intentHits: 0,           // 意图命中数
      totalIntents: 0,         // 总意图数
      undoCount: 0,            // 撤销次数
      totalActions: 0,         // 总动作数
      outOfScopeCount: 0,      // 域外次数
      voiceLatencies: [],      // 语音延迟列表
      profanityCount: 0        // 脏词次数
    }
  }
  
  /**
   * 记录意图命中
   */
  recordIntentHit(hit = true) {
    this.data.totalIntents++
    if (hit) {
      this.data.intentHits++
    } else {
      this.data.outOfScopeCount++
    }
  }
  
  /**
   * 记录撤销
   */
  recordUndo() {
    this.data.undoCount++
    this.data.totalActions++
  }
  
  /**
   * 记录语音延迟
   */
  recordVoiceLatency(latencyMs) {
    this.data.voiceLatencies.push(latencyMs)
  }
  
  /**
   * 记录脏词
   */
  recordProfanity() {
    this.data.profanityCount++
  }
  
  /**
   * 计算 KQI 指标
   */
  calculate() {
    const hitRate = this.data.totalIntents > 0 
      ? (this.data.intentHits / this.data.totalIntents * 100).toFixed(2)
      : 0
    
    const undoRate = this.data.totalActions > 0
      ? (this.data.undoCount / this.data.totalActions * 100).toFixed(2)
      : 0
    
    const outOfScopeRate = this.data.totalIntents > 0
      ? (this.data.outOfScopeCount / this.data.totalIntents * 100).toFixed(2)
      : 0
    
    const avgVoiceLatency = this.data.voiceLatencies.length > 0
      ? (this.data.voiceLatencies.reduce((a, b) => a + b, 0) / this.data.voiceLatencies.length / 1000).toFixed(2)
      : 0
    
    const p95VoiceLatency = this.calculateP95(this.data.voiceLatencies) / 1000
    
    return {
      hitRate: parseFloat(hitRate),          // 目标：≥75%
      undoRate: parseFloat(undoRate),        // 目标：≤8%
      outOfScopeRate: parseFloat(outOfScopeRate), // 目标：≤15%
      avgVoiceLatency: parseFloat(avgVoiceLatency), // 目标：<1.8s
      p95VoiceLatency: parseFloat(p95VoiceLatency), // 目标：<3.5s
      profanityCount: this.data.profanityCount,
      
      // 健康度评分
      health: this.calculateHealth(hitRate, undoRate, outOfScopeRate, avgVoiceLatency)
    }
  }
  
  /**
   * 计算 P95 延迟
   */
  calculateP95(arr) {
    if (arr.length === 0) return 0
    const sorted = arr.slice().sort((a, b) => a - b)
    const index = Math.ceil(sorted.length * 0.95) - 1
    return sorted[index] || 0
  }
  
  /**
   * 计算健康度评分（0-100）
   */
  calculateHealth(hitRate, undoRate, outOfScopeRate, avgLatency) {
    let score = 0
    
    // 命中率权重：40分
    if (hitRate >= 75) score += 40
    else score += (hitRate / 75) * 40
    
    // 撤销率权重：30分
    if (undoRate <= 8) score += 30
    else score += Math.max(0, 30 - (undoRate - 8) * 3)
    
    // 域外率权重：20分
    if (outOfScopeRate <= 15) score += 20
    else score += Math.max(0, 20 - (outOfScopeRate - 15) * 2)
    
    // 语音延迟权重：10分
    if (avgLatency < 1.8) score += 10
    else score += Math.max(0, 10 - (avgLatency - 1.8) * 5)
    
    return Math.round(score)
  }
  
  /**
   * 重置数据
   */
  reset() {
    this.data = {
      intentHits: 0,
      totalIntents: 0,
      undoCount: 0,
      totalActions: 0,
      outOfScopeCount: 0,
      voiceLatencies: [],
      profanityCount: 0
    }
  }
}

/**
 * 埋点上报
 */
class Analytics {
  constructor() {
    this.kqi = new KQICalculator()
    this.sessionId = this.generateSessionId()
  }
  
  /**
   * 上报事件
   */
/**
 * 上报事件
 */
track(event, params = {}) {
  const data = {
    event,
    params: {
      ...params,
      sessionId: this.sessionId,
      timestamp: Date.now(),
      page: this.getCurrentPage()
    }
  }
  
  // 1. 微信内置埋点（添加安全检查）
  try {
    if (typeof wx !== 'undefined' && wx.reportEvent) {
      wx.reportEvent(event, data.params)
    }
  } catch (e) {
    console.warn('wx.reportEvent 失败:', e)
  }
  
  // 2. 更新KQI
  this.updateKQI(event, params)
  
  // 3. 控制台日志
  console.log('📊 埋点:', event, params)
  
  // 4. 持久化（可选）
  this.saveToStorage(data)
}
  
  /**
   * 更新KQI指标
   */
  updateKQI(event, params) {
    switch (event) {
      case EVENTS.INTENT_HIT:
        this.kqi.recordIntentHit(params.confidence >= 0.62)
        break
      case EVENTS.UNDO_CLICKED:
        this.kqi.recordUndo()
        break
      case EVENTS.VOICE_SENT:
        if (params.latency) {
          this.kqi.recordVoiceLatency(params.latency)
        }
        break
      case EVENTS.PROFANITY_COUNT:
        this.kqi.recordProfanity()
        break
    }
  }
  
  /**
   * 获取KQI报告
   */
  getKQIReport() {
    return this.kqi.calculate()
  }
  
  /**
   * 页面访问埋点
   */
  pageView(pagePath, params = {}) {
    this.track(EVENTS.PAGE_VIEW, {
      page: pagePath,
      ...params
    })
  }
  
  /**
   * 页面离开埋点
   */
  pageLeave(pagePath, duration) {
    this.track(EVENTS.PAGE_LEAVE, {
      page: pagePath,
      duration
    })
  }
  
getCurrentPage() {
  try {
    if (typeof getCurrentPages === 'function') {
      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1]
      return currentPage ? currentPage.route : 'unknown'
    }
  } catch (e) {
    console.warn('获取页面路径失败:', e)
  }
  return 'unknown'
}
  
  /**
   * 生成会话ID
   */
  generateSessionId() {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
  
  saveToStorage(data) {
    try {
      if (typeof wx === 'undefined' || !wx.getStorageSync) {
        return
      }
      
      const history = wx.getStorageSync('ANALYTICS_HISTORY') || []
      history.push(data)
      
      // 只保留最近100条
      if (history.length > 100) {
        history.shift()
      }
      
      wx.setStorageSync('ANALYTICS_HISTORY', history)
    } catch (e) {
      console.error('埋点存储失败:', e)
    }
  }
  
  /**
   * 清空埋点数据
   */
  clearHistory() {
    try {
      wx.removeStorageSync('ANALYTICS_HISTORY')
      this.kqi.reset()
    } catch (e) {
      console.error('清空埋点失败:', e)
    }
  }
}

// 导出单例
const analytics = new Analytics()

// ✅ 修改为这样
module.exports = {
  analytics: analytics,
  track: analytics.track.bind(analytics),  // ← 关键！单独导出 track 方法
  pageView: analytics.pageView.bind(analytics),
  getKQIReport: analytics.getKQIReport.bind(analytics),
  EVENTS: EVENTS,
  KQICalculator: KQICalculator
}