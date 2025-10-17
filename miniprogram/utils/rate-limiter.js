
const RATE_LIMITS = {
  voice: 5000,    // 5秒
  image: 10000,   // 10秒
  text: 1000,     // 1秒
  maxPerMinute: 10 // 每分钟最大请求数
}

class RateLimiter {
  constructor() {
    this.lastCallTimes = {}
    this.callHistory = []
  }
  
  /**
   * 检查是否可以调用
   * @param {string} type - voice | image | text
   * @returns {boolean}
   */
  canCall(type) {
    const now = Date.now()
    const lastTime = this.lastCallTimes[type] || 0
    const minInterval = RATE_LIMITS[type] || 0
    
    // 1. 检查单类型间隔
    if (now - lastTime < minInterval) {
      const waitTime = Math.ceil((minInterval - (now - lastTime)) / 1000)
      wx.showToast({
        title: `请等待${waitTime}秒`,
        icon: 'none'
      })
      return false
    }
    
    // 2. 检查总次数限制（1分钟内）
    this.cleanOldHistory(now)
    if (this.callHistory.length >= RATE_LIMITS.maxPerMinute) {
      wx.showToast({
        title: '请求太频繁，稍后再试',
        icon: 'none'
      })
      return false
    }
    
    // 3. 记录本次调用
    this.lastCallTimes[type] = now
    this.callHistory.push({ type, time: now })
    
    return true
  }
  
  /**
   * 清理1分钟前的历史记录
   */
  cleanOldHistory(now) {
    const oneMinuteAgo = now - 60000
    this.callHistory = this.callHistory.filter(item => item.time > oneMinuteAgo)
  }
  
  /**
   * 重置频控（用于测试）
   */
  reset() {
    this.lastCallTimes = {}
    this.callHistory = []
  }
}

module.exports = new RateLimiter()
