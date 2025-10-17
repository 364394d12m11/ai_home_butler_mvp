// cloudfunctions/aiRouter/index.js
// V5.3-Plus 统一对话网关
// 作用：接收多模态输入 → 混元NLU → 意图分类 → 返回ui_patch

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// ==================== 白名单意图 ====================

const INTENT_WHITELIST = {
  ExplicitDishRequest: 'ExplicitDishRequest',    // 显式点菜
  SwapIngredient: 'SwapIngredient',              // 改料
  ReplaceDishes: 'ReplaceDishes',                // 换一换
  AddConstraint: 'AddConstraint',                // 添加约束（去辣/清淡/快手等）
  RemoveConstraint: 'RemoveConstraint',          // 移除约束
  EvaluateMenu: 'EvaluateMenu',                  // 营养点评
  MakeFromFridge: 'MakeFromFridge',              // 冰箱照可做度
  ToggleKidsMode: 'ToggleKidsMode',              // 儿童模式切换
  LockMenu: 'LockMenu',                          // 锁定菜单
  GenerateShoppingList: 'GenerateShoppingList',  // 生成购物清单
  OutOfScope: 'OutOfScope'                       // 域外/兜底
}

// ==================== 阈值常量 ====================

const CONFIDENCE_THRESHOLD = {
  EXECUTE: 0.62,   // ≥0.62 执行
  CLARIFY: 0.45,   // 0.45-0.62 澄清
  OUT_OF_SCOPE: 0.45 // <0.45 域外
}

// ==================== 主函数 ====================

exports.main = async (event) => {
  const { modality, payload, context } = event || {}
  
  console.log('========== aiRouter 请求 ==========')
  console.log('modality:', modality)
  console.log('payload:', JSON.stringify(payload).slice(0, 200))
  console.log('context:', context)
  
  try {
    // 1. 输入预处理
    const processedInput = await preprocessInput(modality, payload)
    
    // 2. 调用混元NLU（模拟）
    const nluResult = await callHunyuanNLU(processedInput, context)
    
    // 3. 意图过滤和阈值判断
    const decision = decideAction(nluResult)
    
    // 4. 执行意图或返回澄清
    const result = await executeIntent(decision, context)
    
    console.log('========== aiRouter 完成 ==========')
    return result
    
  } catch (e) {
    console.error('❌ aiRouter 错误:', e)
    return generateSafeResponse('处理失败，请重试')
  }
}

// ==================== 输入预处理 ====================

async function preprocessInput(modality, payload) {
  switch (modality) {
    case 'voice':
      // 语音 → ASR
      return await mockASR(payload.audioUrl)
    
    case 'text':
      // 文本 → 直接返回
      return payload.text || ''
    
    case 'image':
      // 图片 → 冰箱识别
      return await mockFridgeOCR(payload.imageUrl)
    
    default:
      return ''
  }
}

/**
 * 模拟ASR（实际应接腾讯云ASR）
 */
async function mockASR(audioUrl) {
  // TODO: 调用腾讯云ASR API
  // 暂时返回模拟结果
  return '我想做红烧肉'
}

/**
 * 模拟冰箱识别（实际应接腾讯云OCR+物体识别）
 */
async function mockFridgeOCR(imageUrl) {
  // TODO: 调用腾讯云图像识别API
  return {
    ingredients: ['西红柿', '鸡蛋', '土豆', '白菜'],
    confidence: 0.85
  }
}

// ==================== 混元NLU ====================

async function callHunyuanNLU(input, context) {
  // TODO: 调用腾讯混元大模型API
  // 暂时使用规则匹配模拟
  
  if (typeof input === 'object' && input.ingredients) {
    // 冰箱照
    return {
      intent: INTENT_WHITELIST.MakeFromFridge,
      slots: { ingredients: input.ingredients },
      confidence: input.confidence,
      reply: '我看到冰箱里有这些食材，让我帮你看看能做什么菜'
    }
  }
  
  const text = String(input).toLowerCase()
  
  // 规则匹配（生产环境应使用混元NLU）
  const rules = [
    {
      pattern: /(想吃|想做|来个|做个|加个)(.+)/,
      intent: INTENT_WHITELIST.ExplicitDishRequest,
      confidence: 0.85,
      extract: (match) => ({ dish_name: match[2].trim() })
    },
    {
      pattern: /(换|替换)(.+)/,
      intent: INTENT_WHITELIST.ReplaceDishes,
      confidence: 0.75,
      extract: (match) => ({ course: inferCourse(match[2]) })
    },
    {
      pattern: /(去辣|不要辣|清淡|少油)/,
      intent: INTENT_WHITELIST.AddConstraint,
      confidence: 0.80,
      extract: () => ({ constraint: '清淡' })
    },
    {
      pattern: /(点评|营养|怎么样)/,
      intent: INTENT_WHITELIST.EvaluateMenu,
      confidence: 0.70,
      extract: () => ({})
    },
    {
      pattern: /(购物|买菜|清单)/,
      intent: INTENT_WHITELIST.GenerateShoppingList,
      confidence: 0.75,
      extract: () => ({})
    }
  ]
  
  for (const rule of rules) {
    const match = text.match(rule.pattern)
    if (match) {
      return {
        intent: rule.intent,
        slots: rule.extract(match),
        confidence: rule.confidence,
        reply: generateReply(rule.intent, rule.extract(match))
      }
    }
  }
  
  // 脏词检测
  if (containsProfanity(text)) {
    return {
      intent: INTENT_WHITELIST.OutOfScope,
      slots: { reason: 'profanity' },
      confidence: 1.0,
      reply: '让我们专注在美食上吧～'
    }
  }
  
  // 默认域外
  return {
    intent: INTENT_WHITELIST.OutOfScope,
    slots: { reason: 'unknown' },
    confidence: 0.2,
    reply: '没太明白你的意思，可以试试这些'
  }
}

function inferCourse(text) {
  if (/荤|肉|鸡|鸭|鱼|虾/.test(text)) return '荤菜'
  if (/素|菜|青菜/.test(text)) return '素菜'
  if (/汤|羹/.test(text)) return '汤类'
  if (/饭|面|主食/.test(text)) return '主食'
  return '荤菜'
}

function generateReply(intent, slots) {
  const replies = {
    [INTENT_WHITELIST.ExplicitDishRequest]: `好的，我帮你加入${slots.dish_name || '这道菜'}`,
    [INTENT_WHITELIST.ReplaceDishes]: `好的，我帮你换一批${slots.course || '菜品'}`,
    [INTENT_WHITELIST.AddConstraint]: '好的，已调整为清淡口味',
    [INTENT_WHITELIST.EvaluateMenu]: '让我看看今天的菜单营养如何',
    [INTENT_WHITELIST.GenerateShoppingList]: '购物清单准备好了'
  }
  return replies[intent] || '好的'
}

function containsProfanity(text) {
  const profanityList = ['傻逼', '操', '草泥马', '妈的', '他妈']
  return profanityList.some(word => text.includes(word))
}

// ==================== 意图决策 ====================

function decideAction(nluResult) {
  const { intent, confidence, slots, reply } = nluResult
  
  // 1. 检查是否在白名单
  if (!Object.values(INTENT_WHITELIST).includes(intent)) {
    return {
      action: 'reject',
      reason: 'intent_not_whitelisted',
      intent: INTENT_WHITELIST.OutOfScope,
      confidence: 0,
      reply: '抱歉，我暂时不能帮你做这个'
    }
  }
  
  // 2. 阈值判断
  if (confidence >= CONFIDENCE_THRESHOLD.EXECUTE) {
    return { action: 'execute', intent, slots, confidence, reply }
  } else if (confidence >= CONFIDENCE_THRESHOLD.CLARIFY) {
    return { action: 'clarify', intent, slots, confidence, reply }
  } else {
    return { action: 'out_of_scope', intent: INTENT_WHITELIST.OutOfScope, confidence, reply }
  }
}

// ==================== 意图执行 ====================

async function executeIntent(decision, context) {
  const { action, intent, slots, reply } = decision
  
  // 1. 域外处理
  if (action === 'out_of_scope') {
    return {
      ok: true,
      intent: INTENT_WHITELIST.OutOfScope,
      confidence: decision.confidence,
      reply: reply,
      ui_patch: {
        toast: reply,
        quickActions: [
          { label: '来点重口味', action: 'addConstraint', args: { constraint: '重口' } },
          { label: '川湘下饭', action: 'addConstraint', args: { constraint: '川湘' } },
          { label: '今日最香荤菜', action: 'replaceDishes', args: { course: '荤菜', count: 3 } },
          { label: '随便来三道', action: 'generateRandom', args: { count: 3 } }
        ]
      }
    }
  }
  
  // 2. 需要澄清
  if (action === 'clarify') {
    return {
      ok: true,
      intent: intent,
      confidence: decision.confidence,
      reply: reply + '，是这个意思吗？',
      ui_patch: {
        ask: reply + '，是这个意思吗？',
        quickActions: [
          { label: '是的', action: 'confirm', args: { intent, slots } },
          { label: '不是', action: 'cancel', args: {} }
        ]
      }
    }
  }
  
  // 3. 执行白名单意图
  return await dispatchIntent(intent, slots, context)
}

async function dispatchIntent(intent, slots, context) {
  switch (intent) {
    case INTENT_WHITELIST.ExplicitDishRequest:
      return await handleExplicitDishRequest(slots, context)
    
    case INTENT_WHITELIST.ReplaceDishes:
      return await handleReplaceDishes(slots, context)
    
    case INTENT_WHITELIST.AddConstraint:
      return await handleAddConstraint(slots, context)
    
    case INTENT_WHITELIST.EvaluateMenu:
      return await handleEvaluateMenu(context)
    
    case INTENT_WHITELIST.MakeFromFridge:
      return await handleMakeFromFridge(slots, context)
    
    case INTENT_WHITELIST.GenerateShoppingList:
      return await handleGenerateShoppingList(context)
    
    default:
      return generateSafeResponse('暂不支持此操作')
  }
}

// ==================== 具体意图处理器 ====================

async function handleExplicitDishRequest(slots, context) {
  const { dish_name } = slots
  
  // TODO: 从数据库查询菜品
  const dish = await findDishByName(dish_name)
  
  if (!dish) {
    return {
      ok: false,
      reply: `抱歉，没找到${dish_name}，换个试试？`
    }
  }
  
  // 自动补救逻辑
  const compensation = autoCompensate(dish, context)
  
  return {
    ok: true,
    intent: INTENT_WHITELIST.ExplicitDishRequest,
    reply: `已加入${dish.name}`,
    ui_patch: {
      toast: `已加入${dish.name}`,
      appendSuggestions: [{ dish }],
      badges: [{
        dishId: dish.id,
        type: 'override',
        text: compensation.note
      }],
      undoToken: generateUndoToken()
    }
  }
}

async function handleReplaceDishes(slots, context) {
  const { course, count = 3 } = slots
  
  // TODO: 从数据库随机抽取
  const newDishes = await fetchRandomDishes(course, count, context)
  
  return {
    ok: true,
    intent: INTENT_WHITELIST.ReplaceDishes,
    reply: `已为你换了${count}道${course}`,
    ui_patch: {
      replaceBatch: {
        course: course,
        oldIds: [], // 前端自行决定替换哪些
        newDishes: newDishes
      },
      undoToken: generateUndoToken()
    }
  }
}

async function handleAddConstraint(slots, context) {
  return {
    ok: true,
    intent: INTENT_WHITELIST.AddConstraint,
    reply: '已调整为清淡口味',
    ui_patch: {
      toast: '已调整为清淡口味',
      undoToken: generateUndoToken()
    }
  }
}

async function handleEvaluateMenu(context) {
  // TODO: 调用营养分析
  const comment = '营养搭配很均衡，热量和蛋白质都刚刚好'
  
  return {
    ok: true,
    intent: INTENT_WHITELIST.EvaluateMenu,
    reply: comment,
    ui_patch: {
      toast: comment
    }
  }
}

async function handleMakeFromFridge(slots, context) {
  const { ingredients } = slots
  
  // TODO: 根据食材推荐菜品
  const suggestions = await findDishesFromIngredients(ingredients)
  
  return {
    ok: true,
    intent: INTENT_WHITELIST.MakeFromFridge,
    reply: `找到${suggestions.immediate.length}道立刻可做的菜`,
    ui_patch: {
      toast: `找到${suggestions.immediate.length}道可做菜`,
      appendSuggestions: suggestions.immediate.map(dish => ({ dish }))
    }
  }
}

async function handleGenerateShoppingList(context) {
  // TODO: 生成购物清单
  return {
    ok: true,
    intent: INTENT_WHITELIST.GenerateShoppingList,
    reply: '购物清单已生成',
    ui_patch: {
      toast: '购物清单已生成'
    }
  }
}

// ==================== 辅助函数 ====================

async function findDishByName(name) {
  try {
    const result = await db.collection('recipes')
      .where({ name: db.RegExp({ regexp: name, options: 'i' }) })
      .limit(1)
      .get()
    return result.data[0] || null
  } catch (e) {
    console.error('查询菜品失败:', e)
    return null
  }
}

async function fetchRandomDishes(course, count, context) {
  // 简化版：返回兜底数据
  return Array.from({ length: count }, (_, i) => ({
    id: `random-${course}-${i}`,
    name: `${course}${i + 1}`,
    course: course,
    time: 15,
    tags: ['家常'],
    reason: '营养搭配不错'
  }))
}

async function findDishesFromIngredients(ingredients) {
  // 简化版：返回模拟数据
  return {
    immediate: [
      { id: 'fridge-1', name: '西红柿炒鸡蛋', course: '荤菜', reason: '食材齐全' }
    ],
    missing1or2: []
  }
}

function autoCompensate(dish, context) {
  // 自动补救逻辑（简化版）
  return {
    method: '少油做法',
    portionHint: '150g/成人',
    suggestedAddons: ['凉拌西兰花'],
    note: '已按你要求加入，默认少油做法'
  }
}

function generateUndoToken() {
  return `undo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function generateSafeResponse(message) {
  return {
    ok: false,
    reply: message,
    ui_patch: {
      toast: message
    }
  }
}