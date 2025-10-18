// pages/diet/index.js - V5.3完整版

// =========== V5.3 新增工具类 ===========
const { applyUIPatch, executeUndo } = require('../../utils/ui-patch')
const { undoRedoManager, applyUndoRedo } = require('../../utils/undo-redo.js')  // ← 新增这行
const { exportShoppingList } = require('../../utils/shopping-list-exporter') 

// =========== 创建实例 ===========
var datetime = require('../../utils/datetime')
const { getUserProfileV3 } = require('../../utils/storage')
const { track, EVENT_TYPES } = require('../../utils/shadow')
const { getLocationFromWX, buildFullRegionProfile } = require('../../utils/region-detector')

Page({
  data: {
    todayDate: '',
    weekday: '',
    currentIntent: 'lunch',
    intentText: '午餐',
    
    // ✅ V5.3 新增字段
    showDialog: false,
    dialogProcessing: false,
    canUndo: false,
    canRedo: false,   // 是否可以重做
    isGenerating: false,
    candidatePoolLocked: false,
    showKQI: false,  // ← 添加这行

    userRole: 'normal',
    roleConfig: {
      normal: { title: '普通家庭', icon: '🏠', actionText: '去美团买菜' },
      helper: { title: '有保姆家庭', icon: '👩‍🍳', actionText: '交给保姆采购' },
      parent: { title: '有孩子家庭', icon: '👨‍👩‍👧‍👦', actionText: '孩子口味优先' },
      health: { title: '健康调理家庭', icon: '🧑‍⚕️', actionText: '智能调理方案' }
    },

    candidateMode: false,
    currentMode: '日常',
    
    candidatePool: {
      meat: [],
      veg: [],
      soup: [],
      staple: []
    },
    
    selectedDishes: {
      meat: [],
      veg: [],
      soup: [],
      staple: []
    },
    
    selectedCount: {
      meat: 0,
      veg: 0,
      soup: 0,
      staple: 0,
      total: 0
    },

    dishViewStartTime: {},
    nutritionComment: '',
    showNutritionComment: false,
    
    shoppingList: [],
    showShoppingSheet: false,
    
    todayMenu: [],
    alternates: {},
    showAlternates: {},
    currentReplacingSlot: null,
    totalDishes: 0,
    nutritionInfo: null,
    
    layoutMode: 'detailList',
    userPreferenceMode: null,
    screenHeight: 0,
    textScale: 1.0,
    
    summaryData: [],
    walletCards: [],
    currentCardIndex: 0,
    
    tabsData: {
      selectedTab: 'all',
      tabContent: []
    },
    
    showMenuSheet: false,
    allMenuData: [],
    menuExplain: '',
    
    showTaskLayer: false,
    smartTasks: [],
    
    userDataV3: {},
    helperTips: [],
    
    userProfile: {
      activeDays: 0,
      totalActions: 0,
      layoutUsage: {},
      preferences: {}
    }
  },

  onLoad: function() {
    console.log('V5.3 饮食系统已启动')
    this.initPage()
    this.getSystemInfo()
    this.detectMealIntent()
    this.initUserRole()
  },
  
  initUserRole: function() {
    const userDataV3 = getUserProfileV3()
    const profile = userDataV3.isV3 ? userDataV3.profile : {}
    
    let role = 'normal'
    if (userDataV3.helpers?.length > 0) {
      const hasNanny = userDataV3.helpers.some(h => h.type === '保姆')
      role = hasNanny ? 'helper' : 'normal'
    } else if (profile.has_child) {
      role = 'parent'
    } else if (profile.health_goal) {
      role = 'health'
    }
    
    this.setData({ userRole: role })
    console.log(`用户角色: ${role}`)
  },
  
  detectMealIntent: function() {
    const intent = datetime.getRecommendIntent ? datetime.getRecommendIntent() : 'lunch'
    const periodText = datetime.getPeriodText ? datetime.getPeriodText() : '午餐'
    
    this.setData({
      currentIntent: intent,
      intentText: periodText
    })
    
    console.log('当前时段推荐意图:', intent, periodText)
  },

  onShow: function() {
    console.log('========== 🟡 ONSHOW开始 ==========')
    console.log('candidateMode =', this.data.candidateMode)
    console.log('candidatePoolLocked =', this.data.candidatePoolLocked)
    
    track(EVENT_TYPES.PAGE_VISIT, {}, { page: 'diet' })
    this.loadUserProfile()
    this.loadUserDataV3()
    
    // ========== 新增：启动撤销/重做检查定时器 ==========
    this.undoCheckTimer = setInterval(() => {
      this.setData({
        canUndo: undoRedoManager.canUndo(),
        canRedo: undoRedoManager.canRedo()
      })
    }, 1000)
    
    // 如果候选池已锁定，直接返回
    if (this.data.candidatePoolLocked) {
      console.log('✅ 候选池已锁定，跳过重置')
      this.setupTaskLayer()
      return
    }
    
    const cachedMenu = this.tryLoadFinalMenu()
    
    if (cachedMenu) {
      console.log('✅ 加载了缓存菜单')
      this.setupTaskLayer()
      return
    }
    
    this.setupTaskLayer()
    
    // ⚠️ 新增：检查是否需要自动生成菜单
    try {
      const autoGenerate = wx.getStorageSync('AUTO_GENERATE_MENU')
      
      if (autoGenerate && autoGenerate.timestamp) {
        // 检查标志是否在最近5秒内设置（防止重复触发）
        const timeDiff = Date.now() - autoGenerate.timestamp
        
        if (timeDiff < 5000) {
          console.log('🎯 检测到自动生成标志，开始生成菜单')
          
          // 清除标志，避免重复触发
          wx.removeStorageSync('AUTO_GENERATE_MENU')
          
          // 延迟100ms执行，确保页面渲染完成
          setTimeout(() => {
            this.generateTodayMenu()
          }, 100)
        } else {
          // 标志过期，清除
          wx.removeStorageSync('AUTO_GENERATE_MENU')
        }
      }
    } catch (e) {
      console.error('检查自动生成标志失败:', e)
    }
    
    console.log('========== 🟡 ONSHOW结束 ==========')
  },
  // 打开KQI看板
openKQI() {
  this.setData({ showKQI: true })
},

// 关闭KQI看板
closeKQI() {
  this.setData({ showKQI: false })
},

  // ========== 新增：页面隐藏时清理定时器 ==========
  onHide: function() {
    if (this.undoCheckTimer) {
      clearInterval(this.undoCheckTimer)
      this.undoCheckTimer = null
    }
  },

  tryLoadFinalMenu: function() {
    try {
      const cached = wx.getStorageSync('DIET_FINAL_MENU')
      const today = this.data.todayDate || this.getCurrentDate()
      
      if (cached && 
          cached.date === today && 
          cached.menu && 
          cached.menu.length > 0) {
        
        console.log('✅ 找到今日已选菜单缓存')
        
        this.setData({
          todayMenu: cached.menu,
          allMenuData: cached.menu,
          totalDishes: cached.menu.length,
          shoppingList: cached.shoppingList || [],
          candidateMode: false,
          showNutritionComment: false
        })
        
        return true
      }
      
      return false
      
    } catch (e) {
      console.error('加载菜单缓存失败:', e)
      return false
    }
  },
  
  onUnload: function() {
    const { dishViewStartTime, candidatePool } = this.data
    
    if (!dishViewStartTime || Object.keys(dishViewStartTime).length === 0) {
      return
    }
    
    Object.keys(dishViewStartTime).forEach(dishId => {
      let dish = null
      for (const type of ['meat', 'veg', 'soup', 'staple']) {
        const pool = candidatePool[type] || []
        dish = pool.find(d => d.id === dishId)
        if (dish) break
      }
      
      if (dish) {
        this.onDishViewEnd(dishId, dish)
      }
    })
    
    console.log('页面卸载，已清理浏览记录')
  },

  onDishViewStart: function(e) {
    const { dishId } = e.currentTarget.dataset
    
    if (!dishId) return
    
    const startTime = Date.now()
    
    const dishViewStartTime = this.data.dishViewStartTime || {}
    dishViewStartTime[dishId] = startTime
    
    this.setData({ dishViewStartTime })
  },

  onDishViewEnd: function(dishId, dish) {
    if (!dishId || !dish) return
    
    const dishViewStartTime = this.data.dishViewStartTime || {}
    const startTime = dishViewStartTime[dishId]
    
    if (!startTime) return
    
    const dwellTime = Date.now() - startTime
    
    if (dwellTime >= 1000) {
      console.log('浏览时长:', dish.name, dwellTime + 'ms')
    }
    
    delete dishViewStartTime[dishId]
    this.setData({ dishViewStartTime })
  },

  loadUserDataV3: function() {
    const userDataV3 = getUserProfileV3()
    this.setData({ userDataV3 })
    console.log('V3.0用户数据:', userDataV3)
  },

  getSystemInfo: function() {
    var self = this
    wx.getSystemInfo({
      success: function(res) {
        self.setData({
          screenHeight: res.windowHeight,
          textScale: res.fontSizeSetting || 1.0
        })
      }
    })
  },

  initPage: function() {
    var today = new Date()
    this.setData({
      todayDate: datetime.formatDateYMD ? datetime.formatDateYMD(today) : this.formatDate(today),
      weekday: datetime.weekdayCN ? datetime.weekdayCN(today) : this.getWeekday(today)
    })
  },

  formatDate: function(date) {
    var year = date.getFullYear()
    var month = (date.getMonth() + 1).toString().padStart(2, '0')
    var day = date.getDate().toString().padStart(2, '0')
    return year + '-' + month + '-' + day
  },

  getWeekday: function(date) {
    var days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return days[date.getDay()]
  },

  loadUserProfile: function() {
    try {
      var profile = wx.getStorageSync('USER_PROFILE') || {
        activeDays: 0,
        totalActions: 0,
        layoutUsage: {},
        preferences: {},
        lastActiveDate: null
      }

      var today = this.data.todayDate
      if (profile.lastActiveDate !== today) {
        profile.activeDays += 1
        profile.lastActiveDate = today
        wx.setStorageSync('USER_PROFILE', profile)
      }

      var preferredMode = this.getUserPreferredLayout(profile.layoutUsage)
      
      this.setData({ 
        userProfile: profile,
        userPreferenceMode: preferredMode
      })
    } catch (e) {
      console.error('加载用户画像失败:', e)
    }
  },

  getUserPreferredLayout: function(layoutUsage) {
    if (!layoutUsage || Object.keys(layoutUsage).length === 0) return null
    
    var total = 0
    var maxUsage = 0
    var preferredMode = null
    
    for (var mode in layoutUsage) {
      total += layoutUsage[mode]
      if (layoutUsage[mode] > maxUsage) {
        maxUsage = layoutUsage[mode]
        preferredMode = mode
      }
    }
    
    return (maxUsage / total >= 0.7) ? preferredMode : null
  },

  generateTodayMenu: function() {
    console.log('========== 🟢 generateTodayMenu 开始 ==========')
    
    const self = this
    
    // 防止重复调用
    if (this.data.isGenerating) {
      console.log('⚠️ 正在生成中，请勿重复点击')
      return
    }
    
    console.log('1️⃣ 设置 isGenerating = true')
    this.setData({ isGenerating: true })
    
    const mode = this.data.currentMode || '日常'
    
    console.log('2️⃣ 显示 Loading')
    wx.showLoading({ title: `正在生成${mode}菜单...`, mask: true })
    
    const userDataV3 = this.data.userDataV3 || {}
    
    console.log('3️⃣ 开始获取位置')
    
    getLocationFromWX().then(location => {
      console.log('4️⃣ 位置获取成功:', location)
      
      const regionProfile = buildFullRegionProfile(location)
      console.log('5️⃣ 区域画像:', regionProfile)
  
      const requestData = {
        date: self.data.todayDate,
        people: {
          adults: userDataV3.family?.adults || 1,
          kids: userDataV3.family?.kids || 0,
          elders: userDataV3.family?.elders || 0
        },
        budget: userDataV3.dietPref?.budget || '实惠',
        mode: mode,
        dietPref: userDataV3.dietPref?.preferences || [],
        weather: self.getWeatherData(),
        solarTerm: self.getSolarTermData(),
        tone: userDataV3.profile?.ai_tone || '温柔',
        recentMenus: self.getRecentDishes(),
        healthGoals: userDataV3.health_goals || [],
        allergies: userDataV3.allergies || [],
        regionProfile: regionProfile
      }
      
      console.log('6️⃣ 准备调用云函数，参数:', requestData)
      
      wx.cloud.callFunction({
        name: 'dietRecommend',
        data: requestData,
        success: function(res) {
          console.log('========== 🔴 SUCCESS开始 ==========')
          
          wx.hideLoading()
          self.setData({ isGenerating: false })
          
          console.log('✅ 云函数返回:', res.result)
          
          if (!res.result || !res.result.ok) {
            console.log('❌ 云函数返回失败')
            wx.showToast({ title: '生成失败', icon: 'none' })
            return
          }
          
          const { candidatePool } = res.result
          
          if (!candidatePool) {
            console.warn('❌ 候选池为空')
            return
          }
          
          const normalizedPool = {
            meat: candidatePool.meat || [],
            veg: candidatePool.veg || [],
            soup: candidatePool.soup || [],
            staple: candidatePool.staple || []
          }
        
          console.log('✅ 候选池:', {
            荤: normalizedPool.meat.length,
            素: normalizedPool.veg.length,
            汤: normalizedPool.soup.length,
            主食: normalizedPool.staple.length
          })
          
          console.log('📝 准备 setData...')
          
          self.setData({
            candidatePool: normalizedPool,
            selectedDishes: { meat: [], veg: [], soup: [], staple: [] },
            selectedCount: { meat: 0, veg: 0, soup: 0, staple: 0, total: 0 },
            candidateMode: true,
            candidatePoolLocked: true,
            todayMenu: [],
            allMenuData: [],
            showNutritionComment: false
          })
          
          console.log('✅ setData完成')
          console.log('candidateMode =', self.data.candidateMode)
          console.log('meat数量 =', self.data.candidatePool.meat.length)
          
          wx.showToast({
            title: '候选池已生成',
            icon: 'success'
          })
          
          console.log('========== 🔴 SUCCESS结束 ==========')
        },
        fail: function(err) {
          console.log('========== 🔴 FAIL触发 ==========')
          console.error('❌ 云函数失败:', err)
          
          wx.hideLoading()
          self.setData({ isGenerating: false })
          
          wx.showModal({
            title: '提示',
            content: '生成菜单失败: ' + (err.errMsg || '未知错误'),
            confirmText: '知道了'
          })
          
          console.log('========== 🔴 FAIL结束 ==========')
        }
      })
      
      console.log('7️⃣ 云函数调用已发起')
      
    }).catch(err => {
      console.log('========== ❌ CATCH触发 ==========')
      console.error('❌ 获取位置失败:', err)
      
      wx.hideLoading()
      self.setData({ isGenerating: false })
      
      wx.showToast({
        title: '获取位置失败',
        icon: 'none'
      })
      
      console.log('========== ❌ CATCH结束 ==========')
    })
    
    console.log('========== 🟢 generateTodayMenu 结束 ==========')
  },

  switchMode: function(e) {
    const mode = e.currentTarget.dataset.mode
    
    this.setData({ currentMode: mode })
    
    wx.showToast({
      title: `已切换到${mode}模式`,
      icon: 'none',
      duration: 1500
    })
    
    console.log('切换模式:', mode)
  },

  toggleDishSelection(e) {
    const { type, dishId } = e.currentTarget.dataset
    
    if (!type || !dishId) {
      console.warn('缺少必要参数')
      return
    }
    
    // 深拷贝整个 candidatePool
    const candidatePool = JSON.parse(JSON.stringify(this.data.candidatePool))
    
    // 找到目标菜品
    const dish = candidatePool[type].find(d => d.id === dishId)
    
    if (!dish) {
      console.warn('未找到菜品:', dishId)
      return
    }
    
    // 切换选中状态
    dish.selected = !dish.selected
    
    // 强制刷新整个 candidatePool
    this.setData({ candidatePool })
    
    // 重新计算选中数量
    this.updateSelectedCount()
  },

  // 计算选中数量
updateSelectedCount() {
  const { candidatePool } = this.data
  
  const count = {
    meat: 0,
    veg: 0,
    soup: 0,
    staple: 0,
    total: 0
  }
  
  // 遍历候选池，统计选中的菜品
  Object.keys(candidatePool).forEach(type => {
    const dishes = candidatePool[type] || []
    count[type] = dishes.filter(d => d.selected).length
  })
  
  count.total = count.meat + count.veg + count.soup + count.staple
  
  // 同步更新 selectedDishes（ID数组）
  const selectedDishes = {
    meat: candidatePool.meat.filter(d => d.selected).map(d => d.id),
    veg: candidatePool.veg.filter(d => d.selected).map(d => d.id),
    soup: candidatePool.soup.filter(d => d.selected).map(d => d.id),
    staple: candidatePool.staple.filter(d => d.selected).map(d => d.id)
  }
  
  this.setData({ 
    selectedCount: count,
    selectedDishes: selectedDishes
  })
  
  console.log('✅ 已选菜品:', count)
},
  
  getDishById: function(type, dishId) {
    const pool = this.data.candidatePool[type] || []
    return pool.find(d => d.id === dishId)
  },

  getIngredientsForDish: function(dishName) {
    const ingredientMap = {
      '番茄鸡蛋': [
        { name: '番茄', category: '蔬菜', amount: '3个' },
        { name: '鸡蛋', category: '蛋类', amount: '4个' }
      ],
      '宫保鸡丁': [
        { name: '鸡胸肉', category: '肉类', amount: '300g' },
        { name: '花生米', category: '坚果', amount: '100g' }
      ],
      '麻婆豆腐': [
        { name: '嫩豆腐', category: '豆制品', amount: '1盒' },
        { name: '肉末', category: '肉类', amount: '100g' }
      ],
      '红烧肉': [
        { name: '五花肉', category: '肉类', amount: '500g' },
        { name: '冰糖', category: '调料', amount: '适量' }
      ]
    }
    
    return ingredientMap[dishName] || [
      { name: dishName + '食材', category: '其他', amount: '适量' }
    ]
  },

  showShoppingList: function() {
    const { shoppingList } = this.data
    
    this.setData({ 
      showShoppingSheet: true
    })
    
    if (shoppingList.length > 0) {
      wx.showToast({
        title: '购物清单已生成',
        icon: 'none',
        duration: 2000
      })
    }
  },

  closeShoppingSheet: function() {
    this.setData({ showShoppingSheet: false })
  },

  toggleShoppingItem: function(e) {
    // ⚠️ 阻止事件冒泡
    if (e && e.stopPropagation) {
      e.stopPropagation()
    }
    
    const index = e.currentTarget.dataset.index
    const shoppingList = this.data.shoppingList
    
    if (!shoppingList[index]) {
      console.warn('购物清单项不存在:', index)
      return
    }
    
    // 切换选中状态
    shoppingList[index].checked = !shoppingList[index].checked
    
    this.setData({ shoppingList })
    
    console.log('✅ 购物清单项切换:', shoppingList[index].name, shoppingList[index].checked)
  },

  handleRoleAction: function() {
    // ✅ 修复：如果没有菜单，先生成
    if (!this.data.todayMenu || this.data.todayMenu.length === 0) {
      this.generateTodayMenu()
      return
    }
    
    const { userRole } = this.data
    
    switch (userRole) {
      case 'helper':
        this.syncToHelper()
        break
      case 'parent':
        this.optimizeForKids()
        break
      case 'health':
        this.applyHealthFilter()
        break
      default:
        this.goBuyGroceries()
    }
  },

  syncToHelper: function() {
    wx.showModal({
      title: '同步到保姆',
      content: '已将今日菜单和购物清单同步到保姆账号，她会提前准备食材和预处理工作。',
      showCancel: false,
      confirmText: '好的',
      success: () => {
        wx.showToast({ title: '已同步给保姆', icon: 'success' })
        track(EVENT_TYPES.ROLE_ACTION, { role: 'helper', action: 'sync_to_helper' })
      }
    })
  },

  optimizeForKids: function() {
    wx.showModal({
      title: '孩子口味优先',
      content: '已根据儿童喜好调整菜单，减少辛辣调料，增加营养密度，口感更适合孩子。',
      showCancel: false,
      confirmText: '很棒',
      success: () => {
        this.regenerateMenu()
        wx.showToast({ title: '已优化儿童菜单', icon: 'success' })
        track(EVENT_TYPES.ROLE_ACTION, { role: 'parent', action: 'optimize_for_kids' })
      }
    })
  },

  applyHealthFilter: function() {
    const profile = this.data.userDataV3.profile || {}
    const goal = profile.health_goal || '健康饮食'
    
    wx.showModal({
      title: '智能健康调理',
      content: `已根据您的${goal}目标，智能调整菜单搭配、营养配比和烹饪方式。`,
      showCancel: false,
      confirmText: '继续执行',
      success: () => {
        this.regenerateMenu()
        wx.showToast({ title: '健康方案已应用', icon: 'success' })
        track(EVENT_TYPES.ROLE_ACTION, { role: 'health', action: 'apply_health_filter' })
      }
    })
  },

  goBuyGroceries: function() {
    const { shoppingList } = this.data
    
    if (shoppingList.length === 0) {
      wx.showToast({ title: '购物清单为空', icon: 'none' })
      return
    }
    
    const keywords = shoppingList.slice(0, 5).map(item => item.name).join(' ')
    
    wx.showModal({
      title: '🛒 去美团买菜',
      content: `即将跳转到美团买菜，帮您搜索今日所需食材：\n\n${keywords}`,
      confirmText: '去买菜',
      cancelText: '稍后再说',
      success: (res) => {
        if (res.confirm) {
          this.jumpToMeituan(keywords)
        }
      }
    })
  },

  jumpToMeituan: function(keywords) {
    const self = this
    wx.showLoading({ title: '正在跳转...', mask: true })
    
    wx.navigateToMiniProgram({
      appId: 'wx1f7b7f5a1f22bbd1',
      path: `pages/home/index?keyword=${encodeURIComponent(keywords)}`,
      envVersion: 'release',
      success: () => {
        wx.hideLoading()
        console.log('跳转美团买菜成功')
      },
      fail: (err) => {
        wx.hideLoading()
        console.log('跳转失败，使用备用方案:', err)
        
        wx.setClipboardData({
          data: keywords,
          success: () => {
            wx.showModal({
              title: '跳转失败',
              content: `关键词"${keywords}"已复制到剪贴板。\n\n请手动打开美团买菜搜索。`,
              confirmText: '知道了',
              showCancel: false
            })
          },
          fail: () => {
            wx.showModal({
              title: '跳转失败',
              content: '请手动打开美团买菜，搜索以下食材：\n\n' + keywords,
              confirmText: '知道了',
              showCancel: false
            })
          }
        })
      }
    })
  },

  copyShoppingListFallback: function() {
    const { shoppingList } = this.data
    const listText = shoppingList.map(item => 
      `${item.name} ${item.amount || ''}`
    ).join('\n')
    
    wx.setClipboardData({
      data: listText,
      success: () => {
        wx.showModal({
          title: '已复制购物清单',
          content: '购物清单已复制到剪贴板，您可以手动打开美团买菜搜索购买。',
          showCancel: false,
          confirmText: '知道了'
        })
      }
    })
  },

  calculateDishCount: function(helpers) {
    const hasNanny = helpers.some(h => h.type === '保姆')
    const hasCleaner = helpers.some(h => h.type === '钟点工')
    
    if (hasNanny) return 4
    if (hasCleaner) return 3
    return 2
  },

  showHelperTips: function(helpers, menu) {
    if (helpers.length === 0) return
    
    const tips = []
    helpers.forEach(helper => {
      if (helper.type === '保姆') {
        tips.push('炖菜可以提前准备，交给保姆就好')
      } else if (helper.type === '钟点工') {
        tips.push('洗菜切菜的部分，钟点工能帮上忙')
      } else if (helper.type === '司机') {
        tips.push('食材采购可以让司机顺便带回来')
      }
    })
    
    if (tips.length > 0) {
      setTimeout(() => {
        wx.showToast({
          title: tips[0],
          icon: 'none',
          duration: 2000
        })
      }, 1000)
    }
  },

  calculateTotalDishes: function(menu) {
    var total = 0
    for (var i = 0; i < menu.length; i++) {
      total += menu[i].dishes.length
    }
    return total
  },

  decideLayoutMode: function() {
    var mode = 'detailList'
    var totalDishes = this.data.totalDishes
    var screenHeight = this.data.screenHeight
    var textScale = this.data.textScale
    var userPref = this.data.userPreferenceMode
    
    if (userPref) {
      mode = userPref
    } else {
      if (totalDishes <= 4 && screenHeight >= 720 && textScale <= 1.1) {
        mode = 'detailList'
      } else if (totalDishes >= 5 && screenHeight < 720) {
        mode = 'summary'
      } else {
        mode = 'wallet'
      }
    }
    
    this.setData({ layoutMode: mode })
    this.prepareLayoutData(mode)
    this.recordLayoutUsage(mode)
  },

  prepareLayoutData: function(mode) {
    var menu = this.data.todayMenu
    
    switch (mode) {
      case 'summary':
        this.prepareSummaryData(menu)
        break
      case 'wallet':
        this.prepareWalletData(menu)
        break
      case 'tabs':
        this.prepareTabsData(menu)
        break
      default:
        break
    }
  },

  prepareSummaryData: function(menu) {
    const summaryData = []
    
    if (!Array.isArray(menu)) {
      console.warn('prepareSummaryData: menu不是数组', menu)
      return
    }
    
    menu.forEach((item, index) => {
      if (!item) return
      
      let meal = item
      let dishes = []
      
      if (item.dishes && Array.isArray(item.dishes)) {
        dishes = item.dishes
      } else if (item.name) {
        meal = {
          name: item.course || '主菜',
          dishes: [item]
        }
        dishes = [item]
      }
      
      if (dishes.length === 0) return
      
      const dishNames = []
      let totalTime = 0
      
      dishes.slice(0, 2).forEach(dish => {
        if (dish && dish.name) {
          dishNames.push(dish.name)
          totalTime += (dish.time || dish.minutes || 0)
        }
      })
      
      let displayText = dishNames.join('、')
      if (dishes.length > 2) {
        displayText += ' ...'
      }
      
      summaryData.push({
        mealName: meal.name || `菜品${index + 1}`,
        dishText: displayText,
        totalTime: totalTime,
        totalDishes: dishes.length,
        section: meal.name || `菜品${index + 1}`
      })
    })
    
    this.setData({ summaryData: summaryData })
  },

  prepareWalletData: function(menu) {
    const walletCards = []
    
    if (!Array.isArray(menu)) {
      console.warn('prepareWalletData: menu不是数组', menu)
      return
    }
    
    menu.forEach((item, index) => {
      if (!item) return
      
      let meal = item
      let dishes = []
      
      if (item.dishes && Array.isArray(item.dishes)) {
        dishes = item.dishes
      } else if (item.name) {
        meal = {
          name: item.course || '主菜',
          dishes: [item],
          people: 2
        }
        dishes = [item]
      }
      
      if (dishes.length === 0) return
      
      let totalTime = 0
      const displayDishes = dishes.slice(0, 2)
      
      dishes.forEach(dish => {
        totalTime += (dish.time || dish.minutes || 0)
      })
      
      walletCards.push({
        mealName: meal.name || `菜品${index + 1}`,
        people: meal.people || 2,
        dishes: displayDishes,
        totalTime: totalTime,
        hasMore: dishes.length > 2,
        totalDishes: dishes.length
      })
    })
    
    this.setData({ 
      walletCards: walletCards,
      currentCardIndex: 0
    })
  },

  prepareTabsData: function(menu) {
    if (!Array.isArray(menu)) {
      console.warn('prepareTabsData: menu不是数组', menu)
      return
    }
    
    const organizedMenu = []
    
    menu.forEach(item => {
      if (!item) return
      
      if (item.dishes && Array.isArray(item.dishes)) {
        organizedMenu.push(item)
      } else if (item.name) {
        const course = item.course || '主菜'
        let existingGroup = organizedMenu.find(group => group.name === course)
        
        if (!existingGroup) {
          existingGroup = {
            name: course,
            dishes: []
          }
          organizedMenu.push(existingGroup)
        }
        
        existingGroup.dishes.push(item)
      }
    })
    
    this.setData({
      'tabsData.selectedTab': 'all',
      'tabsData.tabContent': organizedMenu
    })
  },

  recordLayoutUsage: function(mode) {
    var profile = this.data.userProfile
    if (!profile.layoutUsage) profile.layoutUsage = {}
    
    profile.layoutUsage[mode] = (profile.layoutUsage[mode] || 0) + 1
    
    try {
      wx.setStorageSync('USER_PROFILE', profile)
      this.setData({ userProfile: profile })
    } catch (e) {
      console.error('保存布局使用记录失败:', e)
    }
  },

  switchLayoutMode: function(e) {
    var mode = e.currentTarget.dataset.mode
    this.setData({ layoutMode: mode })
    this.prepareLayoutData(mode)
    this.recordLayoutUsage(mode)
    
    var profile = this.data.userProfile
    profile.manualLayoutSwitch = mode
    this.setData({ 
      userProfile: profile,
      userPreferenceMode: mode
    })
    
    wx.setStorageSync('USER_PROFILE', profile)
  },

  onSummaryRowTap: function(e) {
    var section = e.currentTarget.dataset.section
    this.expandMenuSheet()
  },

  onSummaryRowLongPress: function(e) {
    var section = e.currentTarget.dataset.section
    var self = this
    
    wx.showModal({
      title: '替换整餐',
      content: '为' + section + '换两道菜？',
      confirmText: '换',
      cancelText: '取消',
      success: function(res) {
        if (res.confirm) {
          self.replaceWholeMeal(section)
        }
      }
    })
  },

  onWalletCardChange: function(e) {
    this.setData({
      currentCardIndex: e.detail.current
    })
  },

  onWalletCardTap: function(e) {
    this.expandMenuSheet()
  },

  onTabChange: function(e) {
    var tab = e.currentTarget.dataset.tab
    var menu = this.data.todayMenu
    var content = []
    
    if (tab === 'all') {
      content = menu
    } else if (tab === 'lunch') {
      content = menu.filter(function(meal) { return meal.name === '午餐' })
    } else if (tab === 'dinner') {
      content = menu.filter(function(meal) { return meal.name === '晚餐' })
    }
    
    this.setData({
      'tabsData.selectedTab': tab,
      'tabsData.tabContent': content
    })
  },

  regenerateMenu: function() {
    const self = this
    this.recordUserAction('regenerate_menu')
    
    wx.showLoading({ title: '换一换...', mask: true })
    
    const userDataV3 = this.data.userDataV3 || {}
    const requestData = {
      date: this.data.todayDate,
      people: this.data.currentPeople || 2,
      budget: userDataV3.dietPref?.budget || '实惠',
      dietPref: userDataV3.dietPref?.preferences || [],
      weather: this.getWeatherData(),
      solarTerm: this.getSolarTermData(),
      tone: userDataV3.profile?.ai_tone || '温柔',
      recentMenus: this.getRecentDishes()
    }
    
    wx.cloud.callFunction({
      name: 'dietRecommend',
      data: requestData,
      success: function(res) {
        wx.hideLoading()
        
        if (!res.result || !res.result.ok) {
          const errorMsg = res.result?.err || '生成菜单失败'
          wx.showToast({
            title: errorMsg,
            icon: 'none',
            duration: 2000
          })
          return
        }
        
        const { 
          menu = [], 
          shoppingList = [], 
          rationale = '', 
          alternates = {},
          nutrition = null
        } = res.result
        
        if (menu.length === 0) {
          wx.showToast({
            title: '没有合适的菜品',
            icon: 'none',
            duration: 2000
          })
          return
        }
        
        self.setData({ 
          todayMenu: self.formatMenuForDisplay(menu),
          alternates: alternates,
          allMenuData: menu,
          totalDishes: menu.length,
          shoppingList: shoppingList,
          menuExplain: rationale,
          nutritionInfo: nutrition || {}
        })
        
        self.saveToHistory(menu)
        self.decideLayoutMode()
        
        if (nutrition && nutrition.actual && nutrition.target) {
          self.showNutritionTip(nutrition)
        }
        
        wx.showToast({ 
          title: '换一换完成', 
          icon: 'success', 
          duration: 1500 
        })
      },
      fail: function(err) {
        console.error('换一换云函数失败:', err)
        wx.hideLoading()
        
        let errorMsg = '换一换失败'
        if (err.errMsg?.includes('timeout')) {
          errorMsg = '网络超时，请重试'
        } else if (err.errMsg?.includes('permission')) {
          errorMsg = '权限不足，请检查配置'
        }
        
        wx.showToast({ 
          title: errorMsg, 
          icon: 'none',
          duration: 2000
        })
      }
    })
  },

  replaceCategory: function(e) {
    const type = e.currentTarget.dataset.type
    
    if (!this.data.candidatePool || Object.keys(this.data.candidatePool).length === 0) {
      wx.showToast({ 
        title: '请先生成菜单', 
        icon: 'none',
        duration: 2000
      })
      return
    }
    
    wx.showLoading({ title: '换一换...', mask: true })
    
    const self = this
    const requestData = this.buildCurrentContext()
    requestData.excludeDishes = this.getSelectedDishNames()
    
    wx.cloud.callFunction({
      name: 'dietRecommend',
      data: requestData,
      success: function(res) {
        wx.hideLoading()
        
        if (res.result && res.result.ok && res.result.candidatePool) {
          const { candidatePool } = res.result
          
          self.setData({
            [`candidatePool.${type}`]: candidatePool[type] || []
          })
          
          wx.showToast({
            title: '已换一批新的',
            icon: 'success',
            duration: 1500
          })
        } else {
          wx.showToast({ 
            title: '换一换失败', 
            icon: 'none',
            duration: 2000
          })
        }
      },
      fail: function(err) {
        console.error('换一换失败:', err)
        wx.hideLoading()
        wx.showToast({ 
          title: '换一换失败', 
          icon: 'none',
          duration: 2000
        })
      }
    })
  },

  confirmSelection: function() {
    const { candidatePool, selectedDishes } = this.data
    
    console.log('🔍 开始确认选择')
    
    const selectedMeat = (candidatePool.meat || []).filter(d => (selectedDishes.meat || []).includes(d.id))
    const selectedVeg = (candidatePool.veg || []).filter(d => (selectedDishes.veg || []).includes(d.id))
    const selectedSoup = (candidatePool.soup || []).filter(d => (selectedDishes.soup || []).includes(d.id))
    const selectedStaple = (candidatePool.staple || []).filter(d => (selectedDishes.staple || []).includes(d.id))
    
    const finalMenu = [...selectedMeat, ...selectedVeg, ...selectedSoup, ...selectedStaple]
    
    if (finalMenu.length === 0) {
      wx.showToast({ 
        title: '请至少选择一道菜', 
        icon: 'none',
        duration: 2000
      })
      return
    }
    
    const peopleCount = this.data.userDataV3?.family?.adults || 2
    const shoppingList = this.generateShoppingListV2(finalMenu, peopleCount)
    
    // ✅ 新增：按分类整理最终菜单
    const finalMenuByCategory = {
      meat: selectedMeat,
      veg: selectedVeg,
      soup: selectedSoup,
      staple: selectedStaple
    }
    
    try {
      wx.setStorageSync('DIET_FINAL_MENU', {
        date: this.data.todayDate,
        menu: finalMenu,
        shoppingList: shoppingList,
        timestamp: Date.now()
      })
    } catch (e) {
      console.error('保存菜单失败:', e)
    }
    
    this.setData({
      todayMenu: finalMenu,
      allMenuData: finalMenu,
      finalMenuByCategory: finalMenuByCategory,  // ← 新增分类数据
      totalDishes: finalMenu.length,
      shoppingList: shoppingList,
      candidateMode: false,
      candidatePoolLocked: false,
      showNutritionComment: true
    })
    
    this.saveToHistory(finalMenu)
    
    wx.showToast({
      title: '菜单生成完成',
      icon: 'success',
      duration: 1500
    })
  },

  backToCandidates: function() {
    this.setData({
      candidateMode: true,
      candidatePoolLocked: true,  // ← 重新锁定
      showNutritionComment: false
    })
  },

  getSelectedDishNames: function() {
    const { candidatePool, selectedDishes } = this.data
    const names = []
    
    if (!candidatePool || !selectedDishes) {
      return names
    }
    
    Object.keys(selectedDishes).forEach(type => {
      const ids = selectedDishes[type]
      const dishes = candidatePool[type] || []
      const filtered = dishes.filter(d => ids.includes(d.id))
      names.push(...filtered.map(d => d.name))
    })
    
    return names
  },

  buildCurrentContext: function() {
    const userDataV3 = this.data.userDataV3 || {}
    
    return {
      date: this.data.todayDate,
      people: {
        adults: userDataV3.family?.adults || 1,
        kids: userDataV3.family?.kids || 0,
        elders: userDataV3.family?.elders || 0
      },
      budget: userDataV3.dietPref?.budget || '实惠',
      mode: this.data.currentMode || '日常',
      dietPref: userDataV3.dietPref?.preferences || [],
      weather: this.getWeatherData(),
      solarTerm: this.getSolarTermData(),
      tone: userDataV3.profile?.ai_tone || '温柔',
      recentMenus: this.getRecentDishes(),
      healthGoals: userDataV3.health_goals || [],
      allergies: userDataV3.allergies || []
    }
  },

  replaceWholeMeal: function(section) {
    this.recordUserAction('replace_whole_meal', { section: section })
    wx.showToast({ title: '正在为' + section + '换菜...', icon: 'loading' })
    
    var self = this
    setTimeout(function() {
      self.generateTodayMenu()
      wx.showToast({ title: '已为' + section + '换好新菜', icon: 'success' })
    }, 1000)
  },

  setAsPreset: function(e) {
    var section = e.currentTarget.dataset.section
    this.recordUserAction('set_preset', { section: section })
    wx.showToast({ title: '已设为常用', icon: 'success' })
  },

  expandMenuSheet: function() {
    this.recordUserAction('menu_expand_sheet')
    this.setData({ showMenuSheet: true })
  },

  closeMenuSheet: function() {
    this.setData({ showMenuSheet: false })
  },

  onSheetMaskTap: function() {
    this.closeMenuSheet()
  },

  onSheetContentTap: function() {
  },

  replaceSingleDish: function(e) {
    var dishId = e.currentTarget.dataset.dishId
      // ========== 新增：记录撤销前的状态 ==========
  const beforeState = {
    candidatePool: JSON.parse(JSON.stringify(this.data.candidatePool))  // 深拷贝
  }
    var section = e.currentTarget.dataset.section
    this.recordUserAction('menu_replace_one', { dishId: dishId, section: section, from: 'sheet' })
    track(EVENT_TYPES.MENU_REPLACE_ONE, { dish_id: dishId, section: section })
    
    wx.showToast({ 
      title: '换菜功能开发中', 
      icon: 'none' 
    })
      // ========== 新增：记录撤销后的状态 ==========
  const afterState = {
    candidatePool: JSON.parse(JSON.stringify(this.data.candidatePool))
  }
  
  // ========== 新增：保存到撤销栈 ==========
  undoRedoManager.pushAction({
    token: `replace_${dishId}_${Date.now()}`,  // 唯一标识
    type: 'replaceDish',
    before: beforeState,
    after: afterState
  })
  
  // ========== 新增：显示撤销提示 ==========
  wx.showToast({ 
    title: '已替换（10秒内可撤销）', 
    icon: 'none',
    duration: 2000
  })
  },

  openShoppingList: function() {
    this.recordUserAction('menu_open_shopping_list')
    this.showShoppingList()
  },

  markMenuComplete: function() {
    this.recordUserAction('menu_complete')
    track(EVENT_TYPES.MENU_COMPLETE, { 
      dish_count: this.data.totalDishes 
    })
    
    wx.showToast({ 
      title: '今天做得不错！', 
      icon: 'success',
      duration: 1500
    })
  },

  setupTaskLayer: function() {
    var self = this
    setTimeout(function() {
      self.setData({ showTaskLayer: true })
      self.generateSmartTasks()
    }, 1000)
  },

  generateSmartTasks: function() {
    const { userRole, shoppingList } = this.data
    let tasks = []
    
    if (userRole === 'helper') {
      tasks = [
        {
          icon: '👩‍🍳',
          title: '保姆协作',
          desc: '食材准备中',
          action: '查看状态',
          tap: 'checkHelperStatus'
        }
      ]
    } else {
      tasks = [
        {
          icon: '🛒',
          title: '采购进度',
          desc: `${shoppingList.filter(item => item.checked).length} / ${shoppingList.length}`,
          action: '去补齐',
          tap: 'showShoppingList'
        }
      ]
    }
    
    tasks.push({
      icon: '🌙',
      title: '晚间定制',
      desc: '20:00–23:00 自动生成',
      action: '查看',
      tap: 'openCustomize'
    })
    
    this.setData({ smartTasks: tasks })
  },

  handleTaskAction: function(e) {
    var action = e.currentTarget.dataset.action
    
    if (action === 'showShoppingList') {
      this.showShoppingList()
    } else {
      wx.showToast({ title: action + '功能开发中', icon: 'none' })
    }
  },

  recordUserAction: function(actionType, data) {
    data = data || {}
    console.log('用户行为:', actionType, data)
  },

  getRecentDishes: function() {
    try {
      const history = wx.getStorageSync('MENU_HISTORY') || []
      const recent = []
      
      history.forEach(item => {
        if (item.dishes) {
          item.dishes.forEach(dish => {
            if (dish.id && !recent.includes(dish.id)) {
              recent.push(dish.id)
            }
          })
        }
      })
      
      return recent.slice(0, 12)
    } catch (e) {
      return []
    }
  },

  formatMealPlan: function(mealPlan) {
    const result = []
    const meals = ['breakfast', 'lunch', 'dinner']
    
    meals.forEach(meal => {
      if (mealPlan[meal]) {
        result.push({
          name: mealPlan[meal].name,
          dishes: mealPlan[meal].dishes,
          people: mealPlan[meal].people.adults
        })
      }
    })
    
    return result
  },

  saveToHistory: function(menu) {
    try {
      const history = wx.getStorageSync('MENU_HISTORY') || []
      
      const today = {
        date: this.data.todayDate,
        dishes: this.extractAllDishes(menu),
        timestamp: Date.now(),
        role: this.data.userRole
      }
      
      history.unshift(today)
      
      const filtered = history.filter((item, idx) => {
        const daysDiff = (Date.now() - item.timestamp) / 86400000
        return daysDiff < 7
      })
      
      wx.setStorageSync('MENU_HISTORY', filtered.slice(0, 20))
    } catch (e) {
      console.error('保存历史失败:', e)
    }
  },

  extractAllDishes: function(menu) {
    const dishes = []
    
    if (!Array.isArray(menu)) {
      console.warn('extractAllDishes: menu不是数组', menu)
      return dishes
    }
    
    menu.forEach(item => {
      if (!item) return
      
      if (item.dishes && Array.isArray(item.dishes)) {
        item.dishes.forEach(dish => {
          if (dish) dishes.push(dish)
        })
      } else if (item.name) {
        dishes.push(item)
      }
    })
    
    return dishes
  },

  fallbackToLocalEngine: function(ctx) {
    const self = this
    
    console.log('使用本地兜底引擎')
    
    try {
      const safeCtx = {
        date: ctx.date || self.data.todayDate,
        people: ctx.people || 2,
        budget: ctx.budget || '实惠',
        dietPref: Array.isArray(ctx.dietPref) ? ctx.dietPref : [],
        weather: ctx.weather || { temp: '20', text: '晴' },
        solarTerm: ctx.solarTerm || '',
        aiTone: ctx.aiTone || '温柔',
        recentMenus: Array.isArray(ctx.recentMenus) ? ctx.recentMenus : []
      }
      
      const fallbackMenu = [
        {
          name: '西红柿鸡蛋',
          course: '主菜',
          reason: '经典家常菜，简单易做',
          ingredients: [
            { name: '西红柿', qty: '3个' },
            { name: '鸡蛋', qty: '4个' }
          ],
          time: 8
        },
        {
          name: '清炒小白菜',
          course: '配菜', 
          reason: '清淡爽口，营养均衡',
          ingredients: [
            { name: '小白菜', qty: '500g' },
            { name: '蒜', qty: '2瓣' }
          ],
          time: 5
        }
      ]
      
      const shoppingList = this.generateShoppingListV2(fallbackMenu, 2)
      
      self.setData({ 
        todayMenu: self.formatMenuForDisplay(fallbackMenu),
        allMenuData: fallbackMenu,
        totalDishes: fallbackMenu.length,
        shoppingList: shoppingList,
        menuExplain: '本地推荐，营养搭配均衡',
        nutritionInfo: {}
      })
      
      self.saveToHistory(fallbackMenu)
      
      wx.showToast({ 
        title: '已生成离线菜单', 
        icon: 'success',
        duration: 2000
      })
      
      self.decideLayoutMode()
      
    } catch (e) {
      console.error('本地引擎失败:', e)
    } finally {
      wx.hideLoading()
    }
  },

  getWeatherData: function() {
    return { temp: '20', text: '晴', code: 'clear' }
  },

  getSolarTermData: function() {
    try {
      const solarTerm = wx.getStorageSync('CURRENT_SOLAR_TERM') || ''
      return solarTerm
    } catch (e) {
      return ''
    }
  },

  formatMenuForDisplay: function(menu) {
    return menu.map((dish, index) => ({
      id: `menu-${index}`,
      name: dish.name,
      course: dish.course || '主菜',
      reason: dish.reason || '营养搭配均衡',
      ingredients: dish.ingredients || [],
      time: dish.time || 0,
      tags: dish.tags || [],
      emoji: this.getEmojiForDish(dish.name),
      costLabel: this.getCostLabel(dish)
    }))
  },

  getEmojiForDish: function(name) {
    const emojiMap = {
      '西红柿': '🍅', '鸡蛋': '🥚', '白菜': '🥬', '豆腐': '🧈',
      '鸡肉': '🍗', '牛肉': '🥩', '鱼': '🐟', '虾': '🦐',
      '汤': '🍲', '粥': '🍚', '面': '🍜'
    }
    
    for (const [key, emoji] of Object.entries(emojiMap)) {
      if (name.includes(key)) {
        return emoji
      }
    }
    
    return '🍽️'
  },

  getCostLabel: function(dish) {
    const ingredients = dish.ingredients || []
    if (ingredients.some(ing => /牛肉|海鲜/.test(ing.name))) {
      return '精致'
    }
    if (ingredients.some(ing => /鸡蛋|豆腐|白菜/.test(ing.name))) {
      return '实惠'
    }
    return '小资'
  },

  showNutritionTip: function(nutrition) {
    if (!nutrition || !nutrition.comment) return
    
    setTimeout(() => {
      wx.showToast({
        title: nutrition.comment,
        icon: 'none',
        duration: 3000
      })
    }, 1500)
  },

  tryLoadHomeMenuCache: function() {
    return false
  },

  getCurrentDate: function() {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  generateShoppingListV2: function(menu, peopleCount) {
    const bag = {}
    const k = Math.max(1, peopleCount / 2)
    
    menu.forEach(dish => {
      if (!dish || !dish.ingredients) return
      
      const ingredients = dish.ingredients
      let allIngredients = []
      
      if (ingredients.main || ingredients.aux || ingredients.seasoning) {
        allIngredients = [
          ...(ingredients.main || []),
          ...(ingredients.aux || []),
          ...(ingredients.seasoning || [])
        ]
      } else if (Array.isArray(ingredients)) {
        allIngredients = ingredients
      }
      
      allIngredients.forEach(item => {
        if (!item) return
        
        let name, qty
        if (typeof item === 'object' && item.name) {
          name = item.name
          qty = this.parseQuantity(item.qty || '1')
        } else if (typeof item === 'string') {
          const parts = item.split(/\s+/)
          name = parts[0] || '未知食材'
          qty = this.parseQuantity(parts[1] || '1')
        } else {
          return
        }
        
        bag[name] = (bag[name] || 0) + qty * k
      })
    })
    
    return Object.keys(bag).map(name => ({
      name: name,
      qty: Math.round(bag[name] * 10) / 10,
      checked: false,
      category: '食材'
    }))
  },

  parseQuantity: function(qtyStr) {
    if (!qtyStr) return 1
    const numMatch = String(qtyStr).match(/(\d+\.?\d*)/)
    return numMatch ? parseFloat(numMatch[1]) : 1
  },

    // =========== V5.3 新增方法 ===========
  
    handleOpenDialog() {
      // 防抖：500ms 内只能触发一次
      if (this._dialogOpening) {
        console.log('⚠️ 防抖拦截重复点击')
        return
      }
      
      this._dialogOpening = true
      
      console.log('========== 打开Dialog ==========')
      this.setData({ showDialog: true })
      
      // 500ms 后解除锁定
      setTimeout(() => {
        this._dialogOpening = false
      }, 500)
    },
    
    handleCloseDialog() {
      this.setData({ showDialog: false })
    },
    
    async handleDialogSend(e) {
      const { modality, payload } = e.detail
      this.setData({ dialogProcessing: true })
      
      try {
        const res = await wx.cloud.callFunction({
          name: 'aiRouter',
          data: {
            modality: modality,
            payload: payload,
            context: {
              page: 'diet',
              selectedDishes: this.data.selectedDishes,
              candidatePool: this.data.candidatePool
            }
          }
        })
        
        if (res.result && res.result.ui_patch) {
          applyUIPatch(this, res.result.ui_patch)
          this.checkUndoAvailable()
        }
        
      } catch (err) {
        console.error('对话失败:', err)
        wx.showToast({ title: '处理失败', icon: 'none' })
      } finally {
        this.setData({ dialogProcessing: false })
      }
    },
    
    async handleUndo() {
      const success = await executeUndo(this)
      if (success) {
        this.checkUndoAvailable()
      }
    },
    
    checkUndoAvailable() {
      try {
        const undoData = wx.getStorageSync('UNDO_TOKEN')
        const canUndo = undoData && (Date.now() < undoData.expiresAt)
        this.setData({ canUndo })
      } catch (e) {
        this.setData({ canUndo: false })
      }
    },
    
    async handleExport() {
      wx.showLoading({ title: '生成中...' })
      
      try {
        const ingredients = this.getSelectedIngredients()
        
        if (!ingredients || ingredients.length === 0) {
          wx.showToast({ title: '请先选择菜品', icon: 'none' })
          return
        }
        
        const result = await exportShoppingList(ingredients, {
          format: 'both',
          size: { width: 1080, height: 1920 }
        })
        
        if (result.imagePath) {
          wx.previewImage({
            urls: [result.imagePath],
            current: result.imagePath
          })
        }
        
        if (result.text) {
          wx.setClipboardData({
            data: result.text,
            success: () => {
              wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
            }
          })
        }
        
      } catch (err) {
        console.error('导出失败:', err)
        wx.showToast({ title: '导出失败', icon: 'none' })
      } finally {
        wx.hideLoading()
      }
    },
     // ========== 新增：撤销功能 ==========
  handleUndo() {
    if (!undoRedoManager.canUndo()) {
      wx.showToast({ title: '没有可撤销的操作', icon: 'none' })
      return
    }
    
    const action = undoRedoManager.undo()
    if (action) {
      applyUndoRedo(this, action, 'undo')
    }
  },
  
  // ========== 新增：重做功能 ==========
  handleRedo() {
    if (!undoRedoManager.canRedo()) {
      wx.showToast({ title: '没有可重做的操作', icon: 'none' })
      return
    }
    
    const action = undoRedoManager.redo()
    if (action) {
      applyUndoRedo(this, action, 'redo')
    }
  },
    getSelectedIngredients() {
      const { candidatePool, selectedDishes } = this.data
      const ingredients = []
      
      // 遍历所有类型（meat, veg, soup, staple）
      Object.keys(selectedDishes || {}).forEach(type => {
        const dishIds = selectedDishes[type] || []  // 获取选中的菜品 ID 列表
        const pool = candidatePool[type] || []      // 获取该类型的候选池
        
        // 根据 ID 找到完整的菜品对象
        dishIds.forEach(dishId => {
          const dish = pool.find(d => d.id === dishId)
          
          if (dish && dish.ingredients) {
            // 提取食材
            let allIngredients = []
            
            if (dish.ingredients.main || dish.ingredients.aux) {
              // 新格式：{ main: [...], aux: [...], seasoning: [...] }
              allIngredients = [
                ...(dish.ingredients.main || []),
                ...(dish.ingredients.aux || []),
                ...(dish.ingredients.seasoning || [])
              ]
            } else if (Array.isArray(dish.ingredients)) {
              // 旧格式：直接是数组
              allIngredients = dish.ingredients
            }
            
            ingredients.push(...allIngredients)
          }
        })
      })
      
      // 去重合并
      const merged = {}
      ingredients.forEach(item => {
        const name = typeof item === 'string' ? item : (item.name || '未知')
        const amount = typeof item === 'object' ? (item.amount || item.qty || 1) : 1
        
        if (merged[name]) {
          // 如果是数字，累加；如果是字符串（如 "3个"），保留第一个
          if (typeof merged[name].amount === 'number' && typeof amount === 'number') {
            merged[name].amount += amount
          }
        } else {
          merged[name] = { 
            name: name, 
            amount: amount,
            category: typeof item === 'object' ? item.category : '食材'
          }
        }
      })
      
      return Object.values(merged)
    },
    // 在 Page({}) 的最后一个方法后面加上：

goToDietSettings: function() {
  wx.navigateTo({
    url: '/pages/diet/taste-setup/index'
  })
}
})