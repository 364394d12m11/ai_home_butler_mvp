// cloudfunctions/explainMenu/index.js
// V3.3 智能菜单解释生成器 - 基于用户画像 + 影子层

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

/**
 * 生成菜单解释（≤30字）
 * @param {Object} event
 * - dishes: 菜品数组
 * - profile: 用户画像（V3 + 影子层）
 * - context: 上下文（天气、时段、节日等）
 */
exports.main = async (event, context) => {
  const { dishes = [], profile = {}, context: ctx = {} } = event
  
  // 合并用户画像（V3显性 + 影子层隐性）
  const fullProfile = {
    ...profile,
    shadow: profile.shadow || {}
  }
  
  // 如果是单道菜解释
  if (dishes.length === 1) {
    return {
      success: true,
      explain: explainSingleDish(dishes[0], fullProfile, ctx)
    }
  }
  
  // 整餐解释
  return {
    success: true,
    explain: explainFullMeal(dishes, fullProfile, ctx)
  }
}

/**
 * 单道菜解释逻辑（优先级排序）
 */
function explainSingleDish(dish, profile, ctx) {
  const templates = []
  
  // 优先级 1: 儿童友好（高权重）
  if (profile.has_child && dish.kids_friendly) {
    templates.push(
      `${dish.name}，孩子也容易接受`,
      `这道菜小朋友会喜欢`,
      `口味温和，适合全家`
    )
  }
  
  // 优先级 2: 健康目标关联
  if (profile.health_goal === 'anti_inflam' && dish.tags?.includes('抗炎')) {
    templates.push(
      `清淡抗炎，适合最近的状态`,
      `温和养护，身体会感谢你`,
      `低刺激食材，吃完很舒服`
    )
  }
  
  if (profile.health_goal === 'gut' && dish.tags?.includes('护胃')) {
    templates.push(
      `温和养胃，适合调理期`,
      `食材温润，对肠胃友好`
    )
  }
  
  // 优先级 3: 影子层 - 挑剔用户偏好
  if (profile.shadow?.change_rate > 0.5) {
    // 挑剔用户喜欢多样性
    if (dish.tags?.includes('特色')) {
      templates.push(
        `换个口味，试试这道特色菜`,
        `不常见的做法，应该会喜欢`
      )
    }
  }
  
  // 优先级 4: 天气关联
  if (ctx.weather_text?.includes('冷') && dish.tags?.includes('暖身')) {
    templates.push(
      `天冷了，这道菜暖和`,
      `温热的食物，刚好应景`
    )
  }
  
  if (ctx.weather_text?.includes('热') && dish.tags?.includes('清爽')) {
    templates.push(
      `天热吃这个，清爽解腻`,
      `轻盈少油，不会腻`
    )
  }
  
  // 优先级 5: 成本感知（不说"便宜"）
  if (dish.cost_tier === 1) {
    templates.push(
      `家常实惠，味道不打折`,
      `简单好做，日常刚好`
    )
  } else if (dish.cost_tier === 3) {
    templates.push(
      `偶尔精致一下，值得的`,
      `周末来点好的，犒劳自己`
    )
  }
  
  // 优先级 6: 最近偏油补偿
  if (ctx.recent_oil_high && dish.tags?.includes('清淡')) {
    templates.push(
      `清爽解腻，刚好平衡一下`,
      `轻盈少油，换个口味`
    )
  }
  
  // 默认兜底
  templates.push(
    `均衡搭配，家里人都适合`,
    `营养全面，做起来也不难`,
    `这道菜评价不错，试试看`
  )
  
  // 随机选择（避免重复）
  return templates[Math.floor(Math.random() * templates.length)]
}

/**
 * 整餐解释逻辑
 */
function explainFullMeal(dishes, profile, ctx) {
  const dishNames = dishes.slice(0, 2).map(d => d.name).join('、')
  const suffix = dishes.length > 2 ? '等' : ''
  
  const templates = []
  
  // 场景化解释
  if (ctx.has_guest) {
    templates.push(
      `${dishNames}${suffix}，客人来也够丰盛`,
      `今天准备了${dishNames}${suffix}，份量刚好`
    )
  }
  
  if (ctx.time_limited) {
    templates.push(
      `${dishNames}${suffix}，30分钟搞定`,
      `快手菜，今天时间紧也来得及`
    )
  }
  
  if (profile.has_child) {
    templates.push(
      `${dishNames}${suffix}，大人小孩都适合`,
      `今天的菜色小朋友应该会喜欢`
    )
  }
  
  // 营养均衡说明
  const hasMeat = dishes.some(d => d.tags?.includes('高蛋白'))
  const hasVeg = dishes.some(d => d.tags?.includes('蔬菜'))
  
  if (hasMeat && hasVeg) {
    templates.push(
      `${dishNames}${suffix}，荤素搭配刚好`,
      `营养均衡，做起来也不难`
    )
  }
  
  // 影子层 - 完成率高的用户鼓励
  if (profile.shadow?.completion_ratio > 0.7) {
    templates.push(
      `${dishNames}${suffix}，你最近完成得很好`,
      `继续保持，今天也很棒`
    )
  }
  
  // 默认兜底
  templates.push(
    `今天准备了${dishNames}${suffix}`,
    `${dishNames}${suffix}，搭配得刚刚好`
  )
  
  return templates[Math.floor(Math.random() * templates.length)]
}