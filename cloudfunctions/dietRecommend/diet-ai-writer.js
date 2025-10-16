// miniprogram/utils/diet-ai-writer.js
// V5.3 纯文案引擎（只读上下文，不做决策）
// 作用：基于算法决策生成文案，严格遵守"说话≠决策"原则

const TONE = {
  GENTLE: '温柔',
  CONCISE: '简练',
  HUMOROUS: '幽默'
}

// ==========================================
// 安全模式：防止 writer 故障影响出餐
// ==========================================

const WRITER_SAFE_MODE = true  // 生产环境建议 true

function safeExecute(fn, fallback) {
  if (!WRITER_SAFE_MODE) return fn()
  
  try {
    return fn()
  } catch (e) {
    console.error('Writer 执行失败，使用兜底:', e)
    return fallback
  }
}

// ==========================================
// 1. 营养点评生成器
// ==========================================

function generateNutritionComment(ctx) {
  return safeExecute(() => {
    const { user, menu, signals } = ctx || {}
    const tone = user?.tone || TONE.GENTLE
    const flags = signals?.nutritionFlags || []
    
    // 完美搭配
    if (flags.length === 0) {
      return selectTemplate(tone, {
        [TONE.GENTLE]: [
          '营养搭配很均衡，热量和蛋白质都刚刚好，继续保持～',
          '这个搭配很棒，营养密度高，家人吃得健康又满足',
          '营养师看了都要点赞，搭配得很合理'
        ],
        [TONE.CONCISE]: [
          '营养均衡，搭配合理',
          '热量/蛋白质达标',
          '营养密度高'
        ],
        [TONE.HUMOROUS]: [
          '完美！营养师看了想给你发毕业证书',
          '这搭配，挑不出毛病，给满分',
          '营养均衡满分，可以去开营养餐厅了'
        ]
      })
    }
    
    // 热量偏低
    if (flags.includes('calories_low')) {
      return selectTemplate(tone, {
        [TONE.GENTLE]: [
          '热量稍微少了点，可以加个主食或者坚果补充一下',
          '能量不太够，建议加点米饭或者面食',
          '热量有点低，下午可能会饿，加点碳水更好'
        ],
        [TONE.CONCISE]: [
          '热量不足，建议加主食',
          '能量偏低，补充碳水',
          '热量低20%，需补充'
        ],
        [TONE.HUMOROUS]: [
          '这点热量，下午饿了可别怪我没提醒你～',
          '热量不够，建议加个馒头，不然下午要靠意志力撑',
          '这热量，适合减肥但不适合干活，加点主食吧'
        ]
      })
    }
    
    // 热量偏高
    if (flags.includes('calories_high')) {
      return selectTemplate(tone, {
        [TONE.GENTLE]: [
          '热量稍微高了些，可以考虑清蒸或少油的做法',
          '能量充足但稍多，下顿可以清淡一点平衡',
          '热量有点超，晚上散散步消耗一下'
        ],
        [TONE.CONCISE]: [
          '热量超标20%，建议调整',
          '能量偏高，少油为宜',
          '热量高，注意控制'
        ],
        [TONE.HUMOROUS]: [
          '热量爆表了，今天的跑步任务+1km',
          '这热量，吃完记得多走两圈，不然要长肉了',
          '妈呀，这能量够跑马拉松了，晚上清淡点吧'
        ]
      })
    }
    
    // 蛋白质不足
    if (flags.includes('protein_low')) {
      return selectTemplate(tone, {
        [TONE.GENTLE]: [
          '蛋白质有点少，可以加个鸡蛋或者豆腐',
          '建议加点肉蛋奶，蛋白质摄入会更好',
          '蛋白质不太够，补充些优质蛋白更健康'
        ],
        [TONE.CONCISE]: [
          '蛋白质不足，加肉蛋类',
          '缺蛋白质，需补充',
          '蛋白质低，建议加餐'
        ],
        [TONE.HUMOROUS]: [
          '蛋白质不够，肌肉表示抗议了',
          '这点蛋白质，健身房的人看了要哭',
          '蛋白质告急，赶紧加个鸡蛋救场'
        ]
      })
    }
    
    // 缺蔬菜
    if (flags.includes('veg_low')) {
      return selectTemplate(tone, {
        [TONE.GENTLE]: [
          '建议加一道青菜，膳食纤维更丰富',
          '蔬菜有点少，加点绿叶菜更健康',
          '可以再加个蔬菜，营养会更全面'
        ],
        [TONE.CONCISE]: [
          '缺蔬菜，建议补充',
          '蔬菜不足，需添加',
          '少青菜，加一道'
        ],
        [TONE.HUMOROUS]: [
          '蔬菜呢？别光吃肉呀，给青菜一个机会',
          '绿色食物在哪里？肠胃表示想念蔬菜了',
          '蔬菜严重不足，再这样下去要便秘了'
        ]
      })
    }
    
    // 默认
    return selectTemplate(tone, {
      [TONE.GENTLE]: ['搭配不错，营养比较均衡'],
      [TONE.CONCISE]: ['搭配合理'],
      [TONE.HUMOROUS]: ['看起来不错，开动吧！']
    })
    
  }, '营养搭配不错')
}

// ==========================================
// 2. 菜品推荐理由生成器
// ==========================================

function generateDishReason(ctx, dish) {
  return safeExecute(() => {
    const { user, menu, regionProfile, constraints, signals, env } = ctx || {}
    const tone = user?.tone || TONE.GENTLE
    const name = dish?.name || ''
    const tags = dish?.tags || []
    
    // 场景优先级：节气 > 极端天气 > 区域 > 探索 > 隐式学习 > 默认
    
    // 1. 节气场景
    if (env?.solarTerm) {
      const reason = getSolarTermReason(env.solarTerm, name, tone)
      if (reason) return reason
    }
    
    // 2. 极端天气场景
    const weather = env?.weather || {}
    if (weather.temp >= 35 || weather.temp <= 5 || weather.rain || weather.snow || weather.typhoon) {
      const reason = getWeatherReason(weather, name, tags, tone)
      if (reason) return reason
    }
    
    // 3. 区域风味场景（只描述，不推）
    if (regionProfile && tags.some(t => ['川菜', '粤菜', '湘菜', '日料', '西餐'].includes(t))) {
      const reason = getRegionReason(regionProfile, name, tags, tone)
      if (reason) return reason
    }
    
    // 4. 探索模式场景（只描述，不鼓励越界）
    if (menu?.mode === '灵感' && constraints?.exploreEnabled) {
      const reason = getExploreModeReason(name, tags, constraints, tone)
      if (reason) return reason
    }
    
    // 5. 隐式学习场景（"看你最近对XX感兴趣"）
    if (signals?.dwellMsByCluster) {
      const reason = getInterestReason(signals.dwellMsByCluster, name, tags, tone)
      if (reason) return reason
    }
    
    // 6. 家庭场景
    if (env?.hasKids && tags.some(t => ['儿童', '软糯', '易消化'].includes(t))) {
      return selectTemplate(tone, {
        [TONE.GENTLE]: [`${name}，孩子会喜欢，营养又好消化`],
        [TONE.CONCISE]: [`${name}，儿童友好`],
        [TONE.HUMOROUS]: [`${name}，小朋友的最爱，好吃不挑食`]
      })
    }
    
    // 7. 默认场景
    return selectTemplate(tone, {
      [TONE.GENTLE]: [
        `${name}，营养搭配不错，适合今天`,
        `${name}，家常美味，适合日常食用`
      ],
      [TONE.CONCISE]: [
        `${name}，营养均衡`,
        `${name}，家常美味`
      ],
      [TONE.HUMOROUS]: [
        `${name}，经典不踩雷，闭眼选`,
        `${name}，家常菜之光，永不出错`
      ]
    })
    
  }, `${dish?.name || '这道菜'}，营养搭配不错`)
}

function getSolarTermReason(term, name, tone) {
  const termReasons = {
    '立春': {
      [TONE.GENTLE]: `${name}，春天来了，清爽开胃正适合`,
      [TONE.CONCISE]: `${name}，应季菜`,
      [TONE.HUMOROUS]: `${name}，春天的味道，吃了一年都有好运气`
    },
    '立夏': {
      [TONE.GENTLE]: `${name}，夏天要来了，清淡消暑`,
      [TONE.CONCISE]: `${name}，消暑佳品`,
      [TONE.HUMOROUS]: `${name}，夏天的开胃菜，吃了不上火`
    },
    '立秋': {
      [TONE.GENTLE]: `${name}，秋意渐浓，贴秋膘的好时候`,
      [TONE.CONCISE]: `${name}，秋季滋补`,
      [TONE.HUMOROUS]: `${name}，秋天到了，合法长肉的季节开始了`
    },
    '立冬': {
      [TONE.GENTLE]: `${name}，冬天来了，温暖滋补`,
      [TONE.CONCISE]: `${name}，冬季暖身`,
      [TONE.HUMOROUS]: `${name}，冬天必备，吃了浑身暖和`
    },
    '冬至': {
      [TONE.GENTLE]: `${name}，冬至到了，温暖又营养`,
      [TONE.CONCISE]: `${name}，冬至应景`,
      [TONE.HUMOROUS]: `${name}，冬至不吃这个，对不起节气`
    }
  }
  
  const reasons = termReasons[term]
  return reasons ? reasons[tone] : null
}

function getWeatherReason(weather, name, tags, tone) {
  const { temp, rain, snow, typhoon } = weather
  
  // 高温
  if (temp >= 35) {
    return selectTemplate(tone, {
      [TONE.GENTLE]: [
        `${name}，天热来点清爽的，舒服`,
        `${name}，高温天气，清淡解暑`
      ],
      [TONE.CONCISE]: [`${name}，清爽解暑`],
      [TONE.HUMOROUS]: [`${name}，这天气不吃点清爽的，人都要化了`]
    })
  }
  
  // 低温
  if (temp <= 5) {
    return selectTemplate(tone, {
      [TONE.GENTLE]: [
        `${name}，天冷了，热乎乎的暖胃又暖心`,
        `${name}，低温天气，温暖滋补`
      ],
      [TONE.CONCISE]: [`${name}，暖胃御寒`],
      [TONE.HUMOROUS]: [`${name}，天这么冷，不吃点热乎的怎么行`]
    })
  }
  
  // 台风
  if (typhoon) {
    return selectTemplate(tone, {
      [TONE.GENTLE]: [`${name}，台风天在家吃热乎的，安全又舒心`],
      [TONE.CONCISE]: [`${name}，台风天适宜`],
      [TONE.HUMOROUS]: [`${name}，台风天就待家里，吃饱再说`]
    })
  }
  
  // 雨天
  if (rain) {
    return selectTemplate(tone, {
      [TONE.GENTLE]: [`${name}，下雨天喝点热汤，很舒服`],
      [TONE.CONCISE]: [`${name}，雨天暖胃`],
      [TONE.HUMOROUS]: [`${name}，下雨天和热汤更配哦`]
    })
  }
  
  // 雪天
  if (snow) {
    return selectTemplate(tone, {
      [TONE.GENTLE]: [`${name}，雪天里的温暖，暖胃又暖心`],
      [TONE.CONCISE]: [`${name}，雪天暖身`],
      [TONE.HUMOROUS]: [`${name}，雪花飘飘，热菜香香，神仙日子`]
    })
  }
  
  return null
}

function getRegionReason(regionProfile, name, tags, tone) {
  const { native, current, cityTier } = regionProfile
  
  // 描述风味来源，不越权推荐
  if (tags.includes('川菜') || tags.includes('湘菜')) {
    return selectTemplate(tone, {
      [TONE.GENTLE]: [`${name}，有点家乡的味道`],
      [TONE.CONCISE]: [`${name}，家乡风味`],
      [TONE.HUMOROUS]: [`${name}，吃着有点想家了`]
    })
  }
  
  if (tags.includes('日料') || tags.includes('西餐')) {
    // 一线城市可以"轻洋气"，但不鼓励越界
    if (cityTier === 'T1') {
      return selectTemplate(tone, {
        [TONE.GENTLE]: [`${name}，偶尔换换口味也不错`],
        [TONE.CONCISE]: [`${name}，换个口味`],
        [TONE.HUMOROUS]: [`${name}，尝尝新鲜的`]
      })
    }
  }
  
  return null
}

function getExploreModeReason(name, tags, constraints, tone) {
  const { trendyQuota, trendyCurrent, exploreCooldownActive } = constraints
  
  // 如果探索冷却中，温和提示
  if (exploreCooldownActive) {
    return selectTemplate(tone, {
      [TONE.GENTLE]: [`${name}，先试试熟悉的，下次再探索`],
      [TONE.CONCISE]: [`${name}，经典款`],
      [TONE.HUMOROUS]: [`${name}，探索有风险，先吃熟悉的`]
    })
  }
  
  // 如果洋气菜已达上限，保守措辞
  if (trendyCurrent >= trendyQuota && tags.includes('洋气')) {
    return selectTemplate(tone, {
      [TONE.GENTLE]: [`${name}，今天就这一道新口味`],
      [TONE.CONCISE]: [`${name}，尝尝新的`],
      [TONE.HUMOROUS]: [`${name}，新口味要悠着点`]
    })
  }
  
  // 正常探索
  return selectTemplate(tone, {
    [TONE.GENTLE]: [`${name}，试试新口味，说不定有惊喜`],
    [TONE.CONCISE]: [`${name}，探索新口味`],
    [TONE.HUMOROUS]: [`${name}，大胆试试，不好吃算我的`]
  })
}

function getInterestReason(dwellMs, name, tags, tone) {
  // 找到停留时长最高的兴趣簇
  const clusters = Object.keys(dwellMs).sort((a, b) => dwellMs[b] - dwellMs[a])
  
  if (clusters.length === 0) return null
  
  const topCluster = clusters[0]
  const threshold = 5000  // 5秒以上算感兴趣
  
  if (dwellMs[topCluster] > threshold && tags.some(t => topCluster.includes(t))) {
    return selectTemplate(tone, {
      [TONE.GENTLE]: [`${name}，看你最近对这类菜挺感兴趣的`],
      [TONE.CONCISE]: [`${name}，符合你的兴趣`],
      [TONE.HUMOROUS]: [`${name}，我注意到你最近常看这类菜，猜你喜欢`]
    })
  }
  
  return null
}

// ==========================================
// 3. 换一换提示语生成器
// ==========================================

function generateSuggestTone(context = {}) {
  return safeExecute(() => {
    const reason = context.reason || 'default'
    const tone = context.tone || TONE.GENTLE
    
    const templates = {
      'recent_duplicate': {
        [TONE.GENTLE]: [
          '这道菜最近做过了，换个新口味试试？',
          '前几天刚吃过，咱们换个花样吧'
        ],
        [TONE.CONCISE]: ['重复了，建议换', '最近吃过，换一道'],
        [TONE.HUMOROUS]: [
          '又是它？你是有多爱这道菜，换换口味吧',
          '这道菜最近出镜率有点高啊，给别的菜一个机会'
        ]
      },
      
      'nutrition_imbalance': {
        [TONE.GENTLE]: [
          '这个搭配营养不太均衡，换一道会更好',
          '建议调整一下，营养会更全面'
        ],
        [TONE.CONCISE]: ['营养失衡，建议换', '搭配不均，需调整'],
        [TONE.HUMOROUS]: [
          '这营养搭配，营养师看了要摇头，换一个吧',
          '这搭配有点偏科，换个均衡发展的'
        ]
      },
      
      'budget_exceeded': {
        [TONE.GENTLE]: [
          '这道菜有点超预算了，换个实惠的？',
          '预算有点紧，换个性价比高的'
        ],
        [TONE.CONCISE]: ['超预算，建议换', '价格高，换实惠'],
        [TONE.HUMOROUS]: [
          '钱包在哭泣，换个便宜点的吧',
          '这道菜太奢侈了，换个亲民的'
        ]
      },
      
      'explore_cooldown': {
        [TONE.GENTLE]: [
          '最近尝试得够多了，先稳定一下吧',
          '探索告一段落，换个熟悉的口味'
        ],
        [TONE.CONCISE]: ['冷却中，换经典', '先吃熟悉的'],
        [TONE.HUMOROUS]: [
          '探索过度了，让味蕾休息一下',
          '新口味吃太多，换个老朋友压压惊'
        ]
      },
      
      'default': {
        [TONE.GENTLE]: ['不满意的话，可以换一道试试'],
        [TONE.CONCISE]: ['可换其他', '试试别的'],
        [TONE.HUMOROUS]: ['不喜欢？那就换呗，我可以的']
      }
    }
    
    const reasonTemplates = templates[reason] || templates['default']
    return selectTemplate(tone, reasonTemplates)
    
  }, '可以换一道试试')
}

function generateReplaceTone(oldDish, newDish, tone = TONE.GENTLE) {
  return safeExecute(() => {
    const templates = {
      [TONE.GENTLE]: [
        `已将${oldDish}换成${newDish}，试试看吧～`,
        `换好了，${newDish}会更合适`
      ],
      [TONE.CONCISE]: [
        `已换：${newDish}`,
        `${oldDish} → ${newDish}`
      ],
      [TONE.HUMOROUS]: [
        `${oldDish}下岗了，${newDish}上场！`,
        `新人${newDish}登场，旧爱${oldDish}再见`
      ]
    }
    return selectTemplate(tone, templates)
  }, `已换成${newDish}`)
}

// ==========================================
// 4. 购物清单提示语生成器
// ==========================================

function generateShoppingListTip(itemCount, tone = TONE.GENTLE) {
  return safeExecute(() => {
    const templates = {
      [TONE.GENTLE]: [
        `已为你准备好${itemCount}样食材清单，点击查看～`,
        `购物清单准备好了，${itemCount}种食材等你采购`
      ],
      [TONE.CONCISE]: [
        `清单：${itemCount}项`,
        `${itemCount}种食材待购`
      ],
      [TONE.HUMOROUS]: [
        `${itemCount}种食材等着你，出发吧勇士！`,
        `购物清单新鲜出炉，${itemCount}项任务待完成`
      ]
    }
    return selectTemplate(tone, templates)
  }, `购物清单已生成，${itemCount}项`)
}

// ==========================================
// 5. 餐后反馈引导语生成器
// ==========================================

function generateFeedbackPrompt(tone = TONE.GENTLE) {
  return safeExecute(() => {
    const templates = {
      [TONE.GENTLE]: [
        '今天做得怎么样？分享一下心得吧～',
        '味道还满意吗？告诉我你的感受'
      ],
      [TONE.CONCISE]: ['评价一下？', '反馈', '今天如何？'],
      [TONE.HUMOROUS]: [
        '做完了？快说说是翻车了还是成功了',
        '今天的厨艺如何？敢不敢晒晒'
      ]
    }
    return selectTemplate(tone, templates)
  }, '今天做得怎么样？')
}

// ==========================================
// 6. 视频脚本生成器（兜底版）
// ==========================================

function generateVideoScript(dish, tone = TONE.GENTLE) {
  return safeExecute(() => {
    const name = dish?.name || '这道菜'
    
    const steps = [
      {
        text: '准备食材',
        voice: selectTemplate(tone, {
          [TONE.GENTLE]: '准备好所有食材，洗净备用～',
          [TONE.CONCISE]: '食材准备',
          [TONE.HUMOROUS]: '先把食材准备好，别等锅热了才手忙脚乱'
        })
      },
      {
        text: '处理食材',
        voice: selectTemplate(tone, {
          [TONE.GENTLE]: '将食材切配好，大小均匀',
          [TONE.CONCISE]: '切配处理',
          [TONE.HUMOROUS]: '刀工见真章，切得好看也很重要'
        })
      },
      {
        text: '热锅起油',
        voice: selectTemplate(tone, {
          [TONE.GENTLE]: '锅热后倒入适量油，中火最好',
          [TONE.CONCISE]: '热锅起油',
          [TONE.HUMOROUS]: '油温七成热，准备开炒'
        })
      },
      {
        text: '烹饪',
        voice: selectTemplate(tone, {
          [TONE.GENTLE]: '按顺序下料，翻炒均匀',
          [TONE.CONCISE]: '下料翻炒',
          [TONE.HUMOROUS]: '火候掌握好，别炒糊了'
        })
      },
      {
        text: '出锅',
        voice: selectTemplate(tone, {
          [TONE.GENTLE]: '调好味，出锅装盘～',
          [TONE.CONCISE]: '调味出锅',
          [TONE.HUMOROUS]: '完美出锅，可以开饭了！'
        })
      }
    ]
    
    return { steps }
    
  }, {
    steps: [
      { text: '准备食材', voice: '准备好所有食材' },
      { text: '处理食材', voice: '将食材切配好' },
      { text: '热锅起油', voice: '锅热后倒入适量油' },
      { text: '烹饪', voice: '按顺序下料，翻炒均匀' },
      { text: '出锅', voice: '调好味，出锅装盘' }
    ]
  })
}

// ==========================================
// 工具函数
// ==========================================

function selectTemplate(tone, templates) {
  const arr = templates[tone] || templates[TONE.GENTLE] || []
  if (!Array.isArray(arr) || arr.length === 0) return ''
  return arr[Math.floor(Math.random() * arr.length)]
}

// ==========================================
// 导出
// ==========================================

module.exports = {
  TONE,
  generateNutritionComment,
  generateDishReason,
  generateSuggestTone,
  generateReplaceTone,
  generateShoppingListTip,
  generateFeedbackPrompt,
  generateVideoScript,
  WRITER_SAFE_MODE
}