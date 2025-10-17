// cloudfunctions/aiRouter/index.js
// V5.3-Plus 统一对话网关
// 作用：接收多模态输入 → 混元NLU → 意图分类 → 返回ui_patch

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// ========== 新增：引入腾讯云SDK ==========
const tencentcloud = require('tencentcloud-sdk-nodejs')
const HunyuanClient = tencentcloud.hunyuan.v20230901.Client
// 配置（从环境变量读取）
const TENCENT_SECRET_ID = process.env.TENCENT_SECRET_ID || ''
const TENCENT_SECRET_KEY = process.env.TENCENT_SECRET_KEY || ''
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
  
  try {
    // 1. 输入预处理
    const processedInput = await preprocessInput(modality, payload)
    console.log('预处理结果:', processedInput)
    
    // 2. 调用混元NLU
    const nluResult = await callHunyuanNLU(processedInput, context)
    console.log('NLU结果:', JSON.stringify(nluResult))
    
    // 3. 意图过滤和阈值判断
    const decision = decideAction(nluResult)
    console.log('决策结果:', JSON.stringify(decision))
    
    // 4. 执行意图
    const result = await executeIntent(decision, context)
    console.log('执行结果:', JSON.stringify(result))
    
    // ========== 统一返回格式 ==========
    const finalResult = {
      ok: result.ok !== false,  // 默认为true
      intent: result.intent || decision.intent,
      confidence: decision.confidence,
      reply: result.reply || nluResult.reply || '处理完成',  // ← 关键：优先使用result.reply，然后nluResult.reply
      ui_patch: result.ui_patch || {}
    }
    
    console.log('========== 最终返回 ==========')
    console.log('finalResult:', JSON.stringify(finalResult))
    
    return finalResult
    
  } catch (e) {
    console.error('❌ aiRouter 错误:', e)
    return {
      ok: false,
      reply: '抱歉，处理失败了，请重试',
      ui_patch: {
        toast: '处理失败'
      }
    }
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

async function callHunyuanNLU(text) {
  console.log('========== 调用混元AI ==========')
  console.log('用户输入:', text)
  
  try {
    const client = new HunyuanClient({
      credential: {
        secretId: TENCENT_SECRET_ID,
        secretKey: TENCENT_SECRET_KEY,
      },
      region: "ap-guangzhou",
      profile: {
        httpProfile: {
          endpoint: "hunyuan.tencentcloudapi.com",
        },
      },
    })

    // ========== 改进的Prompt ==========
    const prompt = `你是一个智能饮食助手的意图识别系统。

用户说："${text}"

请仔细分析用户意图，返回JSON格式（必须是纯JSON，不要有其他文字）：
{
  "intent": "意图名称",
  "confidence": 0.85,
  "reply": "你的自然回复"
}

### 意图列表（优先匹配饮食相关）：

**高频意图：**
1. **inspireMe** (需要灵感/推荐)
   - 触发词：不知道吃什么、给点建议、推荐、来点、随便
   - 例句："不知道吃什么"、"给点建议"、"推荐几道菜"
   - 置信度：0.8-0.95

2. **replaceSingleDish** (换一道菜)
   - 触发词：换、不想吃、不要、别的、其他
   - 例句："换个菜"、"不想吃这个"、"换别的"
   - 置信度：0.75-0.9

3. **replaceBatch** (批量替换)
   - 触发词：全换、都换、重新、全部
   - 例句："全换成川菜"、"都换清淡的"
   - 置信度：0.8-0.95

4. **askCooking** (询问做法)
   - 触发词：怎么做、做法、步骤、教程
   - 例句："怎么做"、"具体步骤"
   - 置信度：0.85-0.95

5. **askNutrition** (询问营养)
   - 触发词：热量、卡路里、健康、营养
   - 例句："热量多少"、"健康吗"
   - 置信度：0.85-0.95

6. **askShopping** (购物清单)
   - 触发词：买、购物、清单、食材
   - 例句："要买什么"、"购物清单"
   - 置信度：0.85-0.95

**其他意图：**
- adjustPortion: 加菜、减菜、多少
- askPrice: 多少钱、价格
- confirmMenu: 就这样、确定、可以

**域外闲聊：**
- OutOfScope: 打招呼、天气、其他话题
- 置信度：0.3-0.6（较低）

### 判断规则：
1. 如果明确是饮食相关，置信度应 ≥0.75
2. 如果关键词模糊但可能相关，置信度 0.5-0.7
3. 如果完全不相关，用OutOfScope且置信度 0.3-0.5
4. **禁止返回置信度0！最低也要0.3**

### 回复要求：
- 饮食意图：给出具体建议或操作提示
- 域外闲聊：友好回应但引导到饮食话题

现在分析用户输入并返回JSON。`;

    const params = {
      Model: "hunyuan-lite",
      Messages: [
        {
          Role: "user",
          Content: prompt
        }
      ],
      Temperature: 0.3,  // ← 降低温度，更确定
      TopP: 0.8
    }

    const response = await client.ChatCompletions(params)
    let content = response.Choices[0].Message.Content
    
    console.log('混元原始返回:', content)
    
    // 清理返回内容
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    
    // 解析JSON
    let result
    try {
      result = JSON.parse(content)
    } catch (parseError) {
      console.error('JSON解析失败，原始内容:', content)
      throw new Error('JSON解析失败')
    }
    
    console.log('解析后的结果:', result)
    
    // ========== 修正置信度（防止返回0） ==========
    if (!result.confidence || result.confidence === 0) {
      result.confidence = 0.5  // 默认给0.5
      console.log('⚠️ 置信度为0，修正为0.5')
    }
    
    return {
      intent: result.intent,
      confidence: result.confidence,
      reply: result.reply
    }

  } catch (error) {
    console.error('混元调用失败:', error)
    console.log('使用降级方案')
    return fallbackIntentRecognition(text)
  }
}

function fallbackIntentRecognition(text) {
  const rules = [
    { keywords: ['确定', '就这样', '可以', '好的', 'ok'], intent: 'confirmMenu', confidence: 0.8 },
    { keywords: ['换', '不想吃', '不要', '别的'], intent: 'replaceSingleDish', confidence: 0.7 },
    { keywords: ['全换', '都换', '重新'], intent: 'replaceBatch', confidence: 0.75 },
    { keywords: ['加', '多', '少', '减'], intent: 'adjustPortion', confidence: 0.7 },
    { keywords: ['热量', '卡路里', '健康', '营养'], intent: 'askNutrition', confidence: 0.8 },
    { keywords: ['怎么做', '做法', '步骤', '准备'], intent: 'askCooking', confidence: 0.85 },
    { keywords: ['买', '购物', '清单', '超市'], intent: 'askShopping', confidence: 0.8 },
    { keywords: ['多少钱', '价格', '费用'], intent: 'askPrice', confidence: 0.8 },
    { keywords: ['不知道', '建议', '推荐', '灵感'], intent: 'inspireMe', confidence: 0.7 }
  ]

  for (const rule of rules) {
    if (rule.keywords.some(kw => text.includes(kw))) {
      return { 
        intent: rule.intent, 
        confidence: rule.confidence,
        reply: `好的，我来帮你${rule.intent}` 
      }
    }
  }

  // ========== 域外/闲聊，返回0.4确保走out_of_scope分支 ==========
  return { 
    intent: 'OutOfScope', 
    confidence: 0.4,
    reply: '你好！我是你的饮食助手，有什么可以帮你的吗？'
  }
}

function inferCourse(text) {
  if (/荤|肉|鸡|鸭|鱼|虾/.test(text)) return '荤菜'
  if (/素|菜|青菜/.test(text)) return '素菜'
  if (/汤|羹/.test(text)) return '汤类'
  if (/饭|面|主食/.test(text)) return '主食'
  return '荤菜'
}

// ... 后续代码保持不变

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

async function executeIntent(decision, context) {
  const { action, intent, slots, reply } = decision
  
  console.log('========== executeIntent ==========')
  console.log('decision:', JSON.stringify(decision))
  
  // 1. 域外处理
  if (action === 'out_of_scope') {
    return {
      ok: true,
      intent: INTENT_WHITELIST.OutOfScope,
      confidence: decision.confidence,
      reply: reply || '晚上好！',  // ← 使用decision.reply
      ui_patch: {
        toast: '你好'
      }
    }
  }
  
  // 2. 需要澄清
  if (action === 'clarify') {
    if (intent === 'OutOfScope') {
      return {
        ok: true,
        intent: INTENT_WHITELIST.OutOfScope,
        confidence: decision.confidence,
        reply: reply || '你好',
        ui_patch: {}
      }
    }
    
    return {
      ok: true,
      intent: intent,
      confidence: decision.confidence,
      reply: reply || '你是想做这个吗？',
      ui_patch: {}
    }
  }
  
  // 3. 执行意图
  return {
    ok: true,
    intent: intent,
    confidence: decision.confidence,
    reply: reply || '好的，我来帮你',
    ui_patch: {}
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