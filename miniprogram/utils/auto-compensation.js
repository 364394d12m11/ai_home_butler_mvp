// utils/auto-compensation.js
// V5.3-Plus 不死板越权 + 自动补救系统
// 规则：显式点菜后自动补救（少油/去辣/气炸/焯后、份量提示、配平建议）

/**
 * 自动补救引擎
 * 当用户显式点菜或改料时，分析菜品特征，给出补救方案
 */
class AutoCompensationEngine {
  /**
   * 分析菜品，生成补救方案
   * @param {Object} dish - 菜品对象
   * @param {Object} context - 用户画像和当前菜单
   * @returns {Object} 补救方案
   */
  compensate(dish, context) {
    const { userProfile, currentMenu } = context
    
    const result = {
      method: null,           // 做法调整
      portionHint: null,      // 份量提示
      suggestedAddons: [],    // 建议配菜
      warnings: [],           // 警告信息
      badges: [],             // 卡片标注
      scoreAdjustment: {
        ExplicitRequestBoost: 0.30,    // 显式请求加分
        GoalDeviationPenalty: 0         // 目标偏离扣分
      }
    }
    
    // 1. 做法调整（健康化改造）
    result.method = this.adjustCookingMethod(dish, userProfile)
    
    // 2. 份量提示
    result.portionHint = this.calculatePortion(dish, userProfile)
    
    // 3. 营养配平建议
    result.suggestedAddons = this.suggestAddons(dish, currentMenu, userProfile)
    
    // 4. 目标偏离检查
    const deviation = this.checkGoalDeviation(dish, userProfile)
    if (deviation.hasDeviation) {
      result.scoreAdjustment.GoalDeviationPenalty = -0.15
      result.warnings.push(deviation.message)
    }
    
    // 5. 生成卡片标注
    result.badges = this.generateBadges(dish, result)
    
    return result
  }
  
  /**
   * 调整做法（少油/去辣/气炸/焯后）
   */
  adjustCookingMethod(dish, userProfile) {
    const { diet_goal, health_concerns, taste_preference } = userProfile || {}
    
    // 健康模式默认少油
    if (diet_goal === 'lose_weight' || health_concerns?.includes('高血脂')) {
      if (dish.tags?.includes('油炸') || dish.name?.includes('炸')) {
        return {
          original: '油炸',
          adjusted: '气炸',
          reason: '健康模式，用气炸代替油炸'
        }
      }
      if (dish.tags?.includes('红烧') || dish.name?.includes('红烧')) {
        return {
          original: '红烧',
          adjusted: '少油版红烧',
          reason: '减少烹调油，降低热量'
        }
      }
    }
    
    // 清淡口味自动去辣
    if (taste_preference === 'light' && (dish.tags?.includes('辣') || dish.name?.includes('辣'))) {
      return {
        original: '正常辣度',
        adjusted: '微辣/不辣',
        reason: '按你的清淡口味调整'
      }
    }
    
    // 高血压患者少盐
    if (health_concerns?.includes('高血压')) {
      return {
        original: '正常盐度',
        adjusted: '少盐',
        reason: '控制钠摄入'
      }
    }
    
    return null
  }
  
  /**
   * 计算份量提示
   */
  calculatePortion(dish, userProfile) {
    const { family_size = 2, diet_goal } = userProfile || {}
    
    // 荤菜份量（按家庭人数）
    if (dish.course === '荤菜' || dish.course === 'meat') {
      const baseGram = diet_goal === 'lose_weight' ? 100 : 150
      const totalGram = baseGram * family_size
      
      return {
        perPerson: `${baseGram}g/成人`,
        total: `${totalGram}g`,
        note: diet_goal === 'lose_weight' ? '减脂期建议控制肉量' : null
      }
    }
    
    // 主食份量
    if (dish.course === '主食' || dish.course === 'staple') {
      const baseBowl = diet_goal === 'lose_weight' ? 0.5 : 1
      const totalBowl = baseBowl * family_size
      
      return {
        perPerson: `${baseBowl}碗/成人`,
        total: `${totalBowl}碗`,
        note: diet_goal === 'lose_weight' ? '主食减半' : null
      }
    }
    
    return null
  }
  
  /**
   * 建议配菜（营养配平）
   */
  suggestAddons(dish, currentMenu, userProfile) {
    const suggestions = []
    
    // 检查当前菜单的营养结构
    const stats = this.analyzeMenuStats(currentMenu)
    
    // 1. 高油荤菜 → 建议高纤素菜
    if (this.isHighFat(dish)) {
      if (stats.highFiberVeg < 2) {
        suggestions.push({
          type: '素菜',
          reason: '配高纤维素菜解腻',
          examples: ['凉拌西兰花', '清炒菠菜', '蒜蓉生菜']
        })
      }
    }
    
    // 2. 精米白面 → 建议粗粮
    if (this.isRefinedStaple(dish)) {
      if (stats.wholeGrain === 0) {
        suggestions.push({
          type: '主食',
          reason: '加点粗粮更健康',
          examples: ['玉米', '红薯', '杂粮饭']
        })
      }
    }
    
    // 3. 重口味菜 → 建议清淡汤
    if (this.isHeavyFlavor(dish)) {
      if (stats.lightSoup === 0) {
        suggestions.push({
          type: '汤',
          reason: '清淡汤品平衡口味',
          examples: ['紫菜蛋花汤', '番茄汤', '豆腐汤']
        })
      }
    }
    
    return suggestions
  }
  
  /**
   * 检查目标偏离
   */
  checkGoalDeviation(dish, userProfile) {
    const { diet_goal } = userProfile || {}
    
    if (diet_goal === 'lose_weight') {
      // 减脂目标
      if (this.isHighCalorie(dish)) {
        return {
          hasDeviation: true,
          message: '此菜热量较高，已调整为低脂做法'
        }
      }
    }
    
    if (diet_goal === 'muscle_gain') {
      // 增肌目标
      if (this.isLowProtein(dish)) {
        return {
          hasDeviation: true,
          message: '蛋白质含量偏低，建议多吃肉蛋类'
        }
      }
    }
    
    return { hasDeviation: false }
  }
  
  /**
   * 生成卡片标注
   */
  generateBadges(dish, compensation) {
    const badges = []
    
    // Override标注
    badges.push({
      type: 'override',
      text: '⚑ 已按要求加入'
    })
    
    // 方法调整标注
    if (compensation.method) {
      badges.push({
        type: 'info',
        text: `🍳 ${compensation.method.adjusted}`
      })
    }
    
    // 警告标注
    if (compensation.warnings.length > 0) {
      badges.push({
        type: 'warning',
        text: `⚠️ ${compensation.warnings[0]}`
      })
    }
    
    return badges
  }
  
  // ==================== 辅助判断函数 ====================
  
  isHighFat(dish) {
    const highFatKeywords = ['油炸', '红烧', '炸', '煎', '五花肉', '肥肠']
    return highFatKeywords.some(kw => 
      dish.name?.includes(kw) || dish.tags?.includes(kw)
    )
  }
  
  isRefinedStaple(dish) {
    const refinedKeywords = ['白米饭', '馒头', '面条', '白粥']
    return refinedKeywords.some(kw => dish.name?.includes(kw))
  }
  
  isHeavyFlavor(dish) {
    const heavyKeywords = ['麻辣', '重庆', '湖南', '川菜', '水煮']
    return heavyKeywords.some(kw => 
      dish.name?.includes(kw) || dish.tags?.includes(kw)
    )
  }
  
  isHighCalorie(dish) {
    return this.isHighFat(dish) || dish.tags?.includes('高热量')
  }
  
  isLowProtein(dish) {
    return dish.course === '素菜' || dish.course === 'veg'
  }
  
  /**
   * 分析当前菜单统计
   */
  analyzeMenuStats(currentMenu) {
    const stats = {
      highFiberVeg: 0,
      wholeGrain: 0,
      lightSoup: 0
    }
    
    if (!Array.isArray(currentMenu)) return stats
    
    currentMenu.forEach(dish => {
      if (dish.tags?.includes('高纤维')) stats.highFiberVeg++
      if (dish.tags?.includes('粗粮')) stats.wholeGrain++
      if (dish.course === '汤' && dish.tags?.includes('清淡')) stats.lightSoup++
    })
    
    return stats
  }
}

/**
 * Override Ledger（越权记录）
 * 用于追踪所有用户显式点菜的记录
 */
class OverrideLedger {
  constructor() {
    this.records = []
  }
  
  /**
   * 记录一次越权
   */
  log(dishId, dishName, compensation, userId) {
    const record = {
      id: `override-${Date.now()}`,
      userId: userId || 'anonymous',
      dishId,
      dishName,
      compensation,
      timestamp: Date.now()
    }
    
    this.records.push(record)
    
    // 持久化
    this.saveToStorage()
    
    console.log('📝 越权记录:', record)
    
    return record.id
  }
  
  /**
   * 获取用户的所有越权记录
   */
  getRecords(userId, limit = 20) {
    return this.records
      .filter(r => r.userId === userId)
      .slice(-limit)
  }
  
  /**
   * 保存到本地存储
   */
  saveToStorage() {
    try {
      wx.setStorageSync('OVERRIDE_LEDGER', this.records.slice(-100)) // 只保留最近100条
    } catch (e) {
      console.error('保存越权记录失败:', e)
    }
  }
  
  /**
   * 从本地存储加载
   */
  loadFromStorage() {
    try {
      const records = wx.getStorageSync('OVERRIDE_LEDGER')
      if (Array.isArray(records)) {
        this.records = records
      }
    } catch (e) {
      console.error('加载越权记录失败:', e)
    }
  }
}

// 导出单例
const compensationEngine = new AutoCompensationEngine()
const overrideLedger = new OverrideLedger()

// 初始化时加载历史记录
overrideLedger.loadFromStorage()

module.exports = {
  AutoCompensationEngine,
  compensationEngine,
  OverrideLedger,
  overrideLedger
}