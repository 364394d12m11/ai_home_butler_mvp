// miniprogram/utils/recipes.js
// 受 cook.yunyoujun.cn 启发的极简数据结构
const RECIPES = [
  {
    id: 'tomato-egg',
    name: '西红柿炒蛋',
    emoji: '🍅',
    time: 10, spicy: 0, budget: 'low',
    tags: ['家常', '快手', '中式'],
    ingredients: ['西红柿', '鸡蛋', '葱', '食用油', '盐', '糖'],
    steps: [
      '鸡蛋加少许盐打散；番茄切块。',
      '热油炒蛋至成型盛出。',
      '下番茄翻炒出汁，加盐/糖调味。',
      '回锅下蛋翻匀，出锅前撒葱花。'
    ]
  },
  {
    id: 'potato-greenpepper',
    name: '青椒土豆丝',
    emoji: '🥔',
    time: 12, spicy: 1, budget: 'low',
    tags: ['家常', '快手', '中式'],
    ingredients: ['土豆', '青椒', '蒜', '食用油', '盐', '醋'],
    steps: [
      '土豆切丝泡水；青椒切丝；蒜切片。',
      '热油下蒜片爆香。',
      '下土豆/青椒大火快炒。',
      '加盐和少许醋翻匀出锅。'
    ]
  },
  {
    id: 'broccoli-garlic',
    name: '蒜蓉西兰花',
    emoji: '🥦',
    time: 8, spicy: 0, budget: 'low',
    tags: ['快手', '清淡', '中式'],
    ingredients: ['西兰花', '蒜', '食用油', '盐'],
    steps: [
      '西兰花掰小朵焯水捞出。',
      '油锅下蒜末小火爆香。',
      '下西兰花翻炒，加盐调味。'
    ]
  },
  {
    id: 'beef-noodle',
    name: '牛肉青菜面',
    emoji: '🍜',
    time: 15, spicy: 0, budget: 'mid',
    tags: ['主食', '快手', '中式'],
    ingredients: ['牛肉末', '青菜', '面条', '酱油', '葱', '盐', '食用油'],
    steps: [
      '煮面备用；锅中油下牛肉末炒散。',
      '加酱油、盐调味，下青菜断生。',
      '与面条拌匀出锅。'
    ]
  },
  {
    id: 'kungpao-chicken',
    name: '宫保鸡丁',
    emoji: '🍗',
    time: 18, spicy: 3, budget: 'mid',
    tags: ['下饭', '中式'],
    ingredients: ['鸡胸肉','花生米','黄瓜','干辣椒','蒜','葱','酱油','糖','醋','生粉','食用油','盐'],
    steps: [
      '鸡丁加盐/生粉腌10分钟。',
      '小火炒香干辣椒/蒜/葱与糖醋酱油。',
      '下鸡丁与黄瓜翻炒至熟，勾芡。',
      '出锅前下花生米拌匀。'
    ]
  },
  {
    id: 'pasta-salad',
    name: '意面沙拉',
    emoji: '🥗',
    time: 15, spicy: 0, budget: 'mid',
    tags: ['西式', '清爽'],
    ingredients: ['意面','生菜','圣女果','橄榄油','黑胡椒','盐'],
    steps: [
      '煮意面沥干冷却。',
      '与生菜/番茄拌匀。',
      '加橄榄油/盐/黑胡椒调味即可。'
    ]
  },
  {
    id: 'cucumber-salad',
    name: '拍黄瓜',
    emoji: '🥒',
    time: 5, spicy: 2, budget: 'low',
    tags: ['凉菜', '快手', '中式'],
    ingredients: ['黄瓜', '蒜', '醋', '生抽', '香油', '盐', '糖'],
    steps: [
      '黄瓜拍碎装盘，撒盐杀水10分钟。',
      '调汁：蒜泥+醋+生抽+香油+糖。',
      '倒掉瓜水，浇调料拌匀即可。'
    ]
  },
  {
    id: 'steamed-egg',
    name: '水蒸蛋',
    emoji: '🥚',
    time: 15, spicy: 0, budget: 'low',
    tags: ['蒸菜', '清淡', '中式'],
    ingredients: ['鸡蛋', '温水', '盐', '生抽', '香油', '葱花'],
    steps: [
      '鸡蛋打散，加等量温水和少许盐。',
      '过筛倒入碗中，盖保鲜膜扎孔。',
      '蒸锅开水蒸12分钟，关火焖2分钟。',
      '出锅淋生抽香油，撒葱花。'
    ]
  }
]

// 标签合集（用于筛选 Chips）
const ALL_TAGS = Array.from(new Set(RECIPES.flatMap(r => r.tags)))

// 使用 CommonJS 导出
module.exports = {
  RECIPES,
  ALL_TAGS
}