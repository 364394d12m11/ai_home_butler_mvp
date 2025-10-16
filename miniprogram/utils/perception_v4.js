// miniprogram/utils/perception_v4.js
// V4.2 Emotion Layer - AI语气系统（集成V5.2增强）

// ✅ 新增：引入AI文案引擎
const { 
  generateSuggestTone: generateSuggestToneV2,
  generateReplaceTone: generateReplaceToneV2,
  generateDishReason,
  generateNutritionComment
} = require('./diet-ai-writer')

// 语气类型枚举
const TONE_TYPES = {
  GENTLE: '温柔',    // 共情、细腻、关怀型
  CONCISE: '简练',   // 高效、理性、极简
  HUMOROUS: '幽默'   // 调皮、有温度、自然
}

/**
 * 生成家庭问候语（首页使用）
 * @param {Object} weather - 天气对象 {now: {text, temp}, daily: {max, min}}
 * @param {Object} solarTerm - 节气 {name}
 * @param {Object} profile - 用户画像 {ai_tone, has_child, health_goal}
 * @param {String} time - 时段 morning/afternoon/evening/night
 * @returns {Object} {tone, greeting, explain}
 */
function generateFamilyTone(weather, solarTerm, profile, time) {
  const tone = profile?.ai_tone || TONE_TYPES.GENTLE
  const weatherText = weather?.now?.text || '多云'
  const temp = Number(weather?.now?.temp) || 20
  const termName = solarTerm?.name || ''
  
  let greeting = ''
  let explain = ''
  
  switch (tone) {
    case TONE_TYPES.GENTLE:
      greeting = generateGentleGreeting(weatherText, temp, termName, time, profile)
      explain = generateGentleExplain(weatherText, temp, profile)
      break
    case TONE_TYPES.CONCISE:
      greeting = generateConciseGreeting(weatherText, temp, termName, time)
      explain = generateConciseExplain(weatherText, temp)
      break
    case TONE_TYPES.HUMOROUS:
      greeting = generateHumorousGreeting(weatherText, temp, termName, time, profile)
      explain = generateHumorousExplain(weatherText, temp, profile)
      break
    default:
      greeting = generateGentleGreeting(weatherText, temp, termName, time, profile)
      explain = generateGentleExplain(weatherText, temp, profile)
  }
  
  return { tone, greeting, explain }
}

/**
 * 生成饮食推荐语气
 * @param {Array} dishes - 菜品数组
 * @param {Object} profile - 用户画像
 * @returns {String} 饮食推荐文案
 */
function generateDietTone(dishes, profile) {
  const tone = profile?.ai_tone || TONE_TYPES.GENTLE
  const dishNames = dishes.slice(0, 2).map(d => d.name).join('、')
  const suffix = dishes.length > 2 ? '等' : ''
  
  switch (tone) {
    case TONE_TYPES.GENTLE:
      return `今天准备了${dishNames}${suffix}，营养刚好，家人一定喜欢`
    case TONE_TYPES.CONCISE:
      return `${dishNames}${suffix}，营养均衡`
    case TONE_TYPES.HUMOROUS:
      return `今天的菜单：${dishNames}${suffix}，不说了，开饭！`
    default:
      return `今天准备了${dishNames}${suffix}，搭配得刚刚好`
  }
}

// ============ 温柔语气生成器 ============
function generateGentleGreeting(weatherText, temp, termName, time, profile) {
  const timeGreetings = {
    morning: {
      sunny: ['早安🌞，阳光正好，今天也要轻松一点', '早安☀️，新的一天，愿一切顺利', '早安🌤️，晴空万里，心情也明朗起来'],
      rainy: ['早安🌧️，小雨淅沥，出门别忘带伞', '早安☔，雨天也有雨天的美好', '早安🌂，雨声温柔，适合安静的一天'],
      cold: ['早安❄️，天有点凉，记得保暖哦', '早安🧥，温度低了些，多穿一点', '早安🌨️，寒冷的早晨，温暖的问候给你'],
      hot: ['早安🌞，天气有点热，记得多喝水', '早安☀️，炎热的一天开始了，注意防暑', '早安🔆，阳光强烈，早点出门比较舒适']
    },
    afternoon: {
      sunny: ['午后阳光☀️，适合小憩或散步', '午后时光🌤️，晒晒太阳，放松一下', '午后阳光正好☀️，做点喜欢的事'],
      rainy: ['午后小雨🌧️，窗边听雨也是一种美好', '午后☔，雨声滴答，适合发呆放空', '午后🌂，雨天的午后，静谧而美好'],
      default: ['午后时光🌤️，给自己一点温柔的陪伴', '午后🌅，休息一下，下午更有精神', '午后时光🌤️，慢一点，生活更美好']
    },
    evening: {
      sunny: ['傍晚金光🌅，今天辛苦了，慢慢放松', '傍晚时分🌇，夕阳温柔，今天也很棒', '傍晚☀️，金色的光，映照着归家的路'],
      rainy: ['傍晚细雨🌧️，早点回家，温暖的晚餐等着', '傍晚☔，雨夜归家，格外温馨', '傍晚🌂，雨中归途，慢慢走不着急'],
      default: ['傍晚时分🌤️，今天也很棒，好好休息', '傍晚🌇，辛苦了一天，放松一下吧', '傍晚时光🌤️，慢慢走，不着急']
    },
    night: {
      clear: ['晚安🌙，星光温柔，早点休息', '晚安✨，星空璀璨，愿你好梦', '晚安🌃，夜色温柔，好好睡一觉'],
      rainy: ['晚安🌧️，雨声催眠，愿你好梦', '晚安☔，雨夜最适合安心入睡', '晚安🌂，听着雨声，慢慢进入梦乡'],
      default: ['晚安🌤️，月光柔和，明天会更好', '晚安🌙，夜深了，放下一切好好睡', '晚安✨，愿你安然入睡，好梦连连']
    }
  }
  
  // 节气特殊问候
  if (termName) {
    const termGreetings = {
      '立春': '春暖花开的时候又到了，心情也跟着明朗起来',
      '雨水': '春雨润物，万物复苏，生活也充满希望',
      '立夏': '夏天来了，记得多喝水，照顾好自己',
      '立秋': '秋高气爽的日子，最适合和家人一起度过',
      '立冬': '冬天来了，记得保暖，温暖的家最舒服了',
      '冬至': '冬至到了，记得吃饺子，团团圆圆最温暖'
    }
    if (termGreetings[termName]) {
      return termGreetings[termName]
    }
  }
  
  // 根据天气和时段选择
  let weatherType = 'default'
  if (weatherText.includes('晴')) weatherType = 'sunny'
  else if (weatherText.includes('雨')) weatherType = 'rainy'
  else if (temp < 10) weatherType = 'cold'
  else if (temp > 30) weatherType = 'hot'
  
  const periodGreetings = timeGreetings[time] || timeGreetings.morning
  const greetingList = periodGreetings[weatherType] || periodGreetings.default || periodGreetings.sunny
  
  return greetingList[Math.floor(Math.random() * greetingList.length)]
}

function generateGentleExplain(weatherText, temp, profile) {
  if (profile?.has_child && temp < 15) {
    return '天冷了，给孩子多准备点温暖的食物'
  }
  if (profile?.health_goal && weatherText.includes('雨')) {
    return '雨天湿气重，清淡饮食对身体更好'
  }
  if (temp > 30) {
    return '天气热，多吃些清爽的，身体会舒服一些'
  }
  return '今天的搭配考虑了营养均衡，家人吃得健康最重要'
}

// ============ 简练语气生成器 ============
function generateConciseGreeting(weatherText, temp, termName, time) {
  const conciseGreetings = {
    morning: [`早安，${weatherText}，${temp}°`, '新的一天开始', '早安'],
    afternoon: [`午后，${weatherText}`, '下午好', '午安'],
    evening: [`傍晚，${weatherText}`, '晚上好', '归家时分'],
    night: [`${weatherText}，${temp}°，早休息`, '晚安', '夜深了']
  }
  
  if (termName) {
    return `${termName}，${weatherText}`
  }
  
  const greetings = conciseGreetings[time] || conciseGreetings.morning
  return greetings[Math.floor(Math.random() * greetings.length)]
}

function generateConciseExplain(weatherText, temp) {
  if (temp < 10) return '天冷，温热食物'
  if (temp > 30) return '天热，清淡为主'
  if (weatherText.includes('雨')) return '雨天，暖胃食物'
  return '营养均衡'
}

// ============ 幽默语气生成器 ============
function generateHumorousGreeting(weatherText, temp, termName, time, profile) {
  const humorousGreetings = {
    morning: {
      sunny: ['早安🌞！太阳公公已经打卡上班了，你呢？', '早安☀️！阳光这么好，不起来就浪费了', '早安🌤️！天气好得像心情一样明朗'],
      rainy: ['早安🌧️！雨天最适合赖床，但还是要起来呀', '早安☔！连老天爷都在洗脸，你也该起来了', '早安🌂！雨天出门记得带伞，别成落汤鸡'],
      cold: ['早安❄️！外面冷得像冰箱，被窝才是真爱', '早安🧥！天冷穿秋裤，妈妈说得对', '早安🌨️！这天气，企鹅都要穿羽绒服'],
      hot: ['早安🌞！太阳这么毒，记得防晒，别烤糊了', '早安☀️！这天气，出门5分钟，出汗2小时', '早安🔆！热得像蒸笼，记得多喝水']
    },
    afternoon: {
      sunny: ['午后阳光☀️！适合晒太阳，但别晒成咸鱼', '午后时光🌤️！阳光正好，微风不燥，完美', '午后☀️！这天气，连懒觉都想多睡一会'],
      rainy: ['午后小雨🌧️！最适合听雨发呆，顺便午睡', '午后☔！雨声哗啦啦，心情也跟着放松', '午后🌂！雨天就是懒人的天堂'],
      default: ['午后时光🌤️！该充电了，不是手机是你', '午后🌅！下午茶时间，给自己个甜蜜', '午后🌤️！时光正好，别急着赶路']
    },
    evening: {
      sunny: ['傍晚🌅！夕阳西下，美得像油画', '傍晚🌇！金色时光，连空气都是甜的', '傍晚☀️！这光线，拍照都不用美颜'],
      rainy: ['傍晚🌧️！雨中回家，有种电影的感觉', '傍晚☔！雨夜归途，浪漫得要命', '傍晚🌂！雨天的晚上，最适合窝在家'],
      default: ['傍晚🌤️！一天的工作结束，该放松了', '傍晚🌇！回家的路，是世界上最美的路', '傍晚🌤️！家的方向，永远是最温暖的']
    },
    night: {
      clear: ['晚安🌙！月亮都睡了，你也该休息了', '晚安✨！数星星数到睡着，古老但有效', '晚安🌃！夜深了，连猫头鹰都打哈欠'],
      rainy: ['晚安🌧️！雨声是最好的催眠曲', '晚安☔！雨夜睡觉，比数羊管用', '晚安🌂！听雨入眠，梦里也是诗意'],
      default: ['晚安🌤️！做个好梦，明天更美好', '晚安🌙！睡个好觉，充满电力', '晚安✨！夜安，梦甜']
    }
  }
  
  // 节气幽默问候
  if (termName) {
    const termHumor = {
      '立春': '春天来了，万物复苏，连我的食欲都苏醒了',
      '立夏': '夏天到了，是时候展示真正的技术了（空调技术）',
      '立秋': '秋天来了，又到了贴秋膘的季节（合法长肉）',
      '立冬': '冬天来了，火锅季正式开启！',
      '冬至': '冬至到了，不吃饺子就是跟节气过不去'
    }
    if (termHumor[termName]) {
      return termHumor[termName]
    }
  }
  
  // 根据天气和时段选择
  let weatherType = 'default'
  if (weatherText.includes('晴')) weatherType = 'sunny'
  else if (weatherText.includes('雨')) weatherType = 'rainy'
  else if (temp < 10) weatherType = 'cold'
  else if (temp > 30) weatherType = 'hot'
  
  const periodGreetings = humorousGreetings[time] || humorousGreetings.morning
  const greetingList = periodGreetings[weatherType] || periodGreetings.default || periodGreetings.sunny
  
  return greetingList[Math.floor(Math.random() * greetingList.length)]
}

function generateHumorousExplain(weatherText, temp, profile) {
  if (profile?.has_child && temp < 15) {
    return '天冷了，给小朋友做点热乎乎的，暖胃又暖心'
  }
  if (temp > 30) {
    return '这天气，吃点清爽的，给身体降降火'
  }
  if (weatherText.includes('雨')) {
    return '雨天最适合窝在家吃热腾腾的饭菜了'
  }
  return '今天的菜谱，营养师看了都点赞（虽然我不是营养师）'
}

/**
 * 获取换一句问候语
 * @param {Object} weather 
 * @param {Object} solarTerm 
 * @param {Object} profile 
 * @param {String} time 
 * @returns {String}
 */
function getAlternativeGreeting(weather, solarTerm, profile, time) {
  const result = generateFamilyTone(weather, solarTerm, profile, time)
  return result.greeting
}

/**
 * 生成复盘语气（V4.2）
 */
function generateReflectionTone(reportData, tone) {
  const { date, activityScore, totalInteractions, menuGenerated } = reportData
  
  switch (tone) {
    case TONE_TYPES.GENTLE:
      if (activityScore >= 80) {
        return `今天表现很棒呢，活跃度${activityScore}分，与小橙子的${totalInteractions}次互动都很有意义。继续保持这样的节奏，生活会越来越有条理的。`
      } else if (activityScore >= 60) {
        return `今天有${activityScore}分的活跃度，虽然不是最高，但每一次互动都很珍贵。慢慢来，生活的节奏找到了就好。`
      } else {
        return `今天可能比较忙碌，${activityScore}分的活跃度说明时间有限。没关系，忙碌也是生活的一部分，明天再试试新功能吧。`
      }
      
    case TONE_TYPES.CONCISE:
      return `活跃度${activityScore}分，${totalInteractions}次互动${menuGenerated ? '，已生成菜单' : ''}。`
      
    case TONE_TYPES.HUMOROUS:
      if (activityScore >= 80) {
        return `哇塞！今天${activityScore}分的活跃度，你这是要成为小橙子的头号粉丝吗？${totalInteractions}次互动，比我跟朋友聊天还频繁呢！`
      } else if (activityScore >= 60) {
        return `今天${activityScore}分，中规中矩的表现，就像是工作日的咖啡——不够浓烈但还算提神。${totalInteractions}次互动，继续加油哦！`
      } else {
        return `今天${activityScore}分，看来是个"佛系使用"的日子。${totalInteractions}次互动，虽然不多，但质量说不定很高呢。`
      }
      
    default:
      return `今天的活跃度是${activityScore}分，共有${totalInteractions}次互动。每一次使用都在帮助小橙子更好地了解您的需求。`
  }
}

// ✅ 新增：换一换提示语（兼容旧版调用）
/**
 * 生成"建议换一换"提示语（V5.2增强版）
 * @param {Object} context - {reason, tone} 或 {dish, weather, ...}
 * @returns {String}
 */
function generateSuggestTone(context = {}) {
  // 兼容旧版调用方式
  if (typeof context === 'string') {
    context = { reason: context, tone: TONE_TYPES.GENTLE }
  }
  
  // 如果没有指定reason，尝试自动判断
  if (!context.reason) {
    context.reason = 'default'
  }
  
  // 调用新版引擎
  return generateSuggestToneV2(context)
}

// ✅ 新增：换菜确认语（兼容旧版调用）
/**
 * 生成"已换一道"确认语（V5.2增强版）
 * @param {String} oldDish - 旧菜名
 * @param {String} newDish - 新菜名
 * @param {String} tone - 语气
 * @returns {String}
 */
function generateReplaceTone(oldDish, newDish, tone = TONE_TYPES.GENTLE) {
  return generateReplaceToneV2(oldDish, newDish, tone)
}

module.exports = {
  TONE_TYPES,
  generateFamilyTone,
  generateDietTone,
  generateReflectionTone,
  getAlternativeGreeting,
  generateSuggestTone,      // ✅ 新增导出
  generateReplaceTone,      // ✅ 新增导出
  explainMeal: function(dishes, context = {}) {
    if (!dishes || dishes.length === 0) return '今天准备了简单的菜'
    const dishNames = dishes.slice(0, 2).map(d => d.name || d).join('、')
    const suffix = dishes.length > 2 ? '等' : ''
    return `今天准备了${dishNames}${suffix}，营养刚好`
  }
}