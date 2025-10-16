// miniprogram/utils/perception.js
// V3.3 用户感知层 - 语气生成与话术管理

/**
 * V3.3 核心原则：
 * 1. 对外共情，对内逻辑
 * 2. 不暴露算法维度（禁止"检测/分析/算法"等词）
 * 3. 提议代替选择
 */

// 语气模式枚举
const TONE_MODES = {
  COMPANION: 'companion',    // 陪伴型（晚间、复盘、情绪安抚）
  SUGGEST: 'suggest',        // 建议型（菜单解释、任务提醒）
  PROFESSIONAL: 'professional' // 专业型（健康/食疗建议）
}

// 禁用词库（绝不出现在用户界面）
const FORBIDDEN_WORDS = [
  '检测', '分析', '算法', '模型', '权重', '维度',
  '数据', '计算', '评分', '匹配度', 'AI判断'
]

/**
 * 生成菜单解释文案（≤30字）
 * @param {Object} dish - 菜品对象 {name, tags, kids_friendly, cost_tier}
 * @param {Object} context - 上下文 {has_child, health_goal, recent_oil_high}
 * @returns {String} 一句话解释
 */
function explainDish(dish, context = {}) {
  const templates = []
  
  // 优先级1：儿童友好
  if (context.has_child && dish.kids_friendly) {
    templates.push(`${dish.name}孩子也容易接受`)
    templates.push(`这道菜小朋友会喜欢`)
  }
  
  // 优先级2：健康目标关联
  if (context.health_goal === 'anti_inflam' && dish.tags?.includes('抗炎')) {
    templates.push(`清淡抗炎，适合最近的状态`)
    templates.push(`温和养护，身体会感谢你`)
  }
  
  if (context.health_goal === 'gut' && dish.tags?.includes('护胃')) {
    templates.push(`温和养胃，吃完很舒服`)
  }
  
  // 优先级3：最近偏油补偿
  if (context.recent_oil_high && dish.tags?.includes('清淡')) {
    templates.push(`清爽解腻，刚好平衡一下`)
    templates.push(`轻盈少油，换个口味`)
  }
  
  // 优先级4：成本感知（不说"便宜"）
  if (dish.cost_tier === 1) {
    templates.push(`家常实惠，味道不打折`)
    templates.push(`简单好做，日常刚好`)
  } else if (dish.cost_tier === 3) {
    templates.push(`偶尔精致一下，值得的`)
  }
  
  // 默认兜底
  templates.push(`均衡搭配，家里人都适合`)
  templates.push(`营养全面，做起来也不难`)
  
  // 随机选择一个模板
  const selected = templates[Math.floor(Math.random() * templates.length)]
  
  // 验证禁用词
  if (containsForbiddenWords(selected)) {
    return `${dish.name}，温和均衡` // 安全兜底
  }
  
  return selected
}

/**
 * 生成整餐解释（多道菜组合）
 * @param {Array} dishes - 菜品数组
 * @param {Object} context - 上下文
 * @returns {String}
 */
function explainMeal(dishes, context = {}) {
  if (dishes.length === 0) return '今天吃点简单的'
  
  const dishNames = dishes.slice(0, 2).map(d => d.name).join('、')
  const suffix = dishes.length > 2 ? '等' : ''
  
  const templates = [
    `${dishNames}${suffix}，营养刚好`,
    `今天准备了${dishNames}${suffix}`,
    `${dishNames}${suffix}，搭配得刚刚好`
  ]
  
  // 特殊情境
  if (context.has_guest) {
    templates.unshift(`${dishNames}${suffix}，客人来也够丰盛`)
  }
  
  if (context.time_limited) {
    templates.unshift(`${dishNames}${suffix}，30分钟搞定`)
  }
  
  return templates[Math.floor(Math.random() * templates.length)]
}

/**
 * 陪伴型语气生成器（晚间、复盘）
 * @param {String} scenario - 场景：evening_greeting, daily_review, comfort
 * @param {Object} data - 数据上下文
 * @returns {String}
 */
function generateCompanionTone(scenario, data = {}) {
  const templates = {
    evening_greeting: [
      '今晚有点凉，我给你准备了暖汤餐',
      '晚上好，今天也辛苦了',
      '夜色温柔，早点休息吧'
    ],
    daily_review: [
      '今天完成了3道菜，节奏很好',
      '这周偏清淡，身体应该舒服些',
      '最近做饭时间稳定在30分钟，保持得不错'
    ],
    comfort: [
      '今天如果太累，简单吃点也很好',
      '没关系，明天再好好做',
      '家里人在一起，简单也是温暖'
    ]
  }
  
  const list = templates[scenario] || templates.evening_greeting
  return list[Math.floor(Math.random() * list.length)]
}

/**
 * 建议型语气生成器（菜单推荐、任务提醒）
 * @param {String} scenario - suggest_menu, remind_task, shopping_list
 * @param {Object} data
 * @returns {String}
 */
function generateSuggestTone(scenario, data = {}) {
  const templates = {
    suggest_menu: [
      '这套菜低油高蛋白，孩子也容易接受。要不要我直接生成购物清单？',
      '今天准备了清淡的，适合最近的状态',
      '考虑到家里人数，准备了3道菜，份量刚好'
    ],
    remind_task: [
      '别忘了今天要买菜哦',
      '下午4点记得准备晚餐食材',
      '保姆今天会来，可以让她帮忙洗菜'
    ],
    shopping_list: [
      '需要买5样东西，我已经列好了',
      '今天的食材比较简单，超市都能买到',
      '这些食材可以让司机顺便带回来'
    ]
  }
  
  const list = templates[scenario] || templates.suggest_menu
  return list[Math.floor(Math.random() * list.length)]
}

/**
 * 专业型语气生成器（健康建议）
 * @param {String} scenario - health_insight, diet_adjust
 * @param {Object} data
 * @returns {String}
 */
function generateProfessionalTone(scenario, data = {}) {
  const templates = {
    health_insight: [
      '过去三天偏油，我提高了抗炎比例；周报会标注变化',
      '最近清淡饮食坚持得很好，继续保持',
      '这周蛋白质摄入均衡，肠胃应该舒服些'
    ],
    diet_adjust: [
      '今天增加了膳食纤维，帮助消化',
      '考虑到最近容易上火，换成了清凉的食材',
      '周末聚餐后，今天恢复清淡'
    ]
  }
  
  const list = templates[scenario] || templates.health_insight
  return list[Math.floor(Math.random() * list.length)]
}

/**
 * 检查文案是否包含禁用词
 * @param {String} text
 * @returns {Boolean}
 */
function containsForbiddenWords(text) {
  return FORBIDDEN_WORDS.some(word => text.includes(word))
}

/**
 * 生成换菜话术（温和引导）
 * @param {String} reason - 换菜原因：dislike, repeat, too_complex
 * @returns {String}
 */
function generateReplaceTone(reason) {
  const templates = {
    dislike: [
      '换一道你更喜欢的？',
      '试试别的口味吧',
      '这道不合适，我换一个'
    ],
    repeat: [
      '最近做过了，换个新的？',
      '这道最近吃过，换一换',
      '来点新鲜的吧'
    ],
    too_complex: [
      '今天时间紧，换个简单的',
      '这道有点复杂，换个快手菜',
      '30分钟能搞定的，换这个'
    ]
  }
  
  const list = templates[reason] || templates.dislike
  return list[Math.floor(Math.random() * list.length)]
}

/**
 * 生成完成鼓励话术
 * @param {Object} stats - {dishes_done: 3, time_used: 25}
 * @returns {String}
 */
function generateCompletionTone(stats) {
  const templates = [
    '今天完成得很好，休息一下吧',
    `${stats.dishes_done}道菜搞定，厉害`,
    `${stats.time_used}分钟完成，效率很高`,
    '今天的菜色不错，家人一定喜欢'
  ]
  
  return templates[Math.floor(Math.random() * templates.length)]
}

module.exports = {
  TONE_MODES,
  explainDish,
  explainMeal,
  generateCompanionTone,
  generateSuggestTone,
  generateProfessionalTone,
  generateReplaceTone,
  generateCompletionTone,
  containsForbiddenWords
}