// miniprogram/pages/diet/seed.js - V4.3扩充版
export default [
  {
    id: 'seed-1',
    title: '蒜香西兰花', // 保留原字段
    name: '蒜香西兰花', // 新增：配合menu-engine
    cover: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?q=80&w=1200&auto=format&fit=crop',
    desc: '清爽解腻，10分钟出餐',
    tags: ['家常', '快手', '素菜', '清淡', '低油'],
    minutes: 10,
    time: 10, // 新增：配合评分算法
    difficulty: 1,
    course: '配菜', // 新增：主菜/配菜/汤品
    budget: '实惠', // 新增：实惠/小资/精致
    protein: '素', // 新增：素/荤/混合
    ingredients: [
      { name: '西兰花', qty: '1棵' },
      { name: '大蒜', qty: '4瓣' },
      { name: '盐', qty: '1/2勺' },
      { name: '橄榄油', qty: '1勺' }
    ],
    steps: ['西兰花掰小朵，开水加盐焯1分钟，过凉控水。', '蒜拍碎下油，小火炸香。', '下西兰花大火翻炒30秒，盐+少许水抛锅出。']
  },
  {
    id: 'seed-2',
    title: '番茄牛腩',
    name: '番茄牛腩',
    cover: 'https://images.unsplash.com/photo-1604908554027-7746a9b6d9a9?q=80&w=1200&auto=format&fit=crop',
    desc: '番茄的鲜甜包裹牛腩，浓郁下饭',
    tags: ['家常', '下饭', '荤菜', '炖', '暖胃'],
    minutes: 90,
    time: 90,
    difficulty: 2,
    course: '主菜',
    budget: '小资',
    protein: '荤',
    ingredients: [
      { name: '牛腩', qty: '600g' },
      { name: '番茄', qty: '3个' },
      { name: '洋葱', qty: '半个' },
      { name: '姜片', qty: '3片' },
      { name: '盐', qty: '1勺' }
    ],
    steps: ['牛腩冷水下锅去血沫', '番茄划十字烫去皮切块', '炒香洋葱姜片，下牛腩番茄，加热水没过，小火70分钟', '收汁调味出']
  },
  {
    id: 'seed-3',
    title: '可可布朗尼',
    name: '可可布朗尼',
    cover: 'https://images.unsplash.com/photo-1606313564200-5b3e6a2c2d49?q=80&w=1200&auto=format&fit=crop',
    desc: '简单好做的巧克力甜点',
    tags: ['甜品', '烘焙'],
    minutes: 35,
    time: 35,
    difficulty: 2,
    course: '主菜',
    budget: '精致',
    protein: '混合',
    ingredients: [
      { name: '黑巧克力', qty: '120g' },
      { name: '黄油', qty: '80g' },
      { name: '鸡蛋', qty: '2个' },
      { name: '低筋面粉', qty: '60g' },
      { name: '可可粉', qty: '20g' },
      { name: '糖', qty: '60g' }
    ],
    steps: ['隔水融化巧克力黄油', '蛋糖打散，加入巧克力液拌匀', '筛入粉类拌匀，模具倒入，170°C 25分钟']
  },
  
  // 新增菜品 - 让推荐算法有足够数据
  {
    id: 'seed-4',
    title: '西红柿鸡蛋',
    name: '西红柿鸡蛋',
    cover: '',
    desc: '经典家常菜，酸甜开胃',
    tags: ['家常', '快手', '下饭', '酸甜'],
    minutes: 8,
    time: 8,
    difficulty: 1,
    course: '主菜',
    budget: '实惠',
    protein: '混合',
    ingredients: [
      { name: '西红柿', qty: '3个' },
      { name: '鸡蛋', qty: '4个' },
      { name: '葱花', qty: '适量' },
      { name: '盐', qty: '适量' },
      { name: '糖', qty: '1勺' }
    ],
    steps: ['鸡蛋打散炒熟盛起', '西红柿去皮切块下锅炒出汁', '倒入鸡蛋翻炒，调味出锅']
  },
  {
    id: 'seed-5',
    title: '银耳莲子汤',
    name: '银耳莲子汤',
    cover: '',
    desc: '清润养颜，温润如玉',
    tags: ['汤', '清淡', '润肺', '护嗓'],
    minutes: 60,
    time: 60,
    difficulty: 1,
    course: '汤品',
    budget: '实惠',
    protein: '素',
    ingredients: [
      { name: '银耳', qty: '1朵' },
      { name: '莲子', qty: '50g' },
      { name: '冰糖', qty: '适量' },
      { name: '枸杞', qty: '10粒' }
    ],
    steps: ['银耳泡发撕小朵', '莲子去芯', '所有食材炖煮50分钟至胶质出']
  },
  {
    id: 'seed-6',
    title: '宫保鸡丁',
    name: '宫保鸡丁',
    cover: '',
    desc: '麻辣鲜香，下饭神器',
    tags: ['川菜', '下饭', '香辣', '高蛋白'],
    minutes: 15,
    time: 15,
    difficulty: 2,
    course: '主菜',
    budget: '小资',
    protein: '荤',
    ingredients: [
      { name: '鸡胸肉', qty: '300g' },
      { name: '花生米', qty: '100g' },
      { name: '干辣椒', qty: '6个' },
      { name: '花椒', qty: '适量' },
      { name: '蒜', qty: '3瓣' }
    ],
    steps: ['鸡肉切丁腌制', '花生米炸酥', '爆炒鸡丁，下调料和花生米']
  },
  {
    id: 'seed-7',
    title: '清炒小白菜',
    name: '清炒小白菜',
    cover: '',
    desc: '清香爽口，解腻必备',
    tags: ['素菜', '清淡', '快手', '低油'],
    minutes: 5,
    time: 5,
    difficulty: 1,
    course: '配菜',
    budget: '实惠',
    protein: '素',
    ingredients: [
      { name: '小白菜', qty: '500g' },
      { name: '蒜', qty: '2瓣' },
      { name: '盐', qty: '适量' },
      { name: '生抽', qty: '适量' }
    ],
    steps: ['小白菜洗净切段', '蒜爆香', '下白菜大火快炒调味']
  },
  {
    id: 'seed-8',
    title: '紫菜蛋花汤',
    name: '紫菜蛋花汤',
    cover: '',
    desc: '鲜美清香，暖胃又简单',
    tags: ['汤', '快手', '暖胃', '清淡'],
    minutes: 8,
    time: 8,
    difficulty: 1,
    course: '汤品',
    budget: '实惠',
    protein: '混合',
    ingredients: [
      { name: '紫菜', qty: '10g' },
      { name: '鸡蛋', qty: '2个' },
      { name: '香菜', qty: '适量' },
      { name: '盐', qty: '适量' },
      { name: '香油', qty: '几滴' }
    ],
    steps: ['紫菜洗净', '水开下紫菜煮3分钟', '蛋液打散倒入搅成蛋花', '调味撒香菜']
  },
  {
    id: 'seed-9',
    title: '红烧肉',
    name: '红烧肉',
    cover: '',
    desc: '肥而不腻，入口即化',
    tags: ['家常', '下饭', '荤菜', '炖', '高热量'],
    minutes: 80,
    time: 80,
    difficulty: 2,
    course: '主菜',
    budget: '小资',
    protein: '荤',
    ingredients: [
      { name: '五花肉', qty: '500g' },
      { name: '冰糖', qty: '30g' },
      { name: '生抽', qty: '2勺' },
      { name: '老抽', qty: '1勺' },
      { name: '料酒', qty: '2勺' }
    ],
    steps: ['五花肉切块焯水', '炒糖色', '下肉块上色', '加调料和水炖60分钟', '大火收汁']
  },
  {
    id: 'seed-10',
    title: '凉拌黄瓜',
    name: '凉拌黄瓜',
    cover: '',
    desc: '清脆爽口，夏日必备',
    tags: ['凉菜', '清爽', '快手', '低油'],
    minutes: 5,
    time: 5,
    difficulty: 1,
    course: '配菜',
    budget: '实惠',
    protein: '素',
    ingredients: [
      { name: '黄瓜', qty: '2根' },
      { name: '蒜', qty: '2瓣' },
      { name: '醋', qty: '2勺' },
      { name: '生抽', qty: '1勺' },
      { name: '香油', qty: '适量' }
    ],
    steps: ['黄瓜拍碎腌制10分钟', '蒜蓉调汁', '拌匀装盘']
  }
]