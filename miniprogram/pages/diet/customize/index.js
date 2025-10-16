// miniprogram/pages/diet/customize/index.js - 完全修复版
const { formatDateYMD, weekdayCN } = require('../../../utils/datetime')
const { RECIPES } = require('../../../utils/recipes')

Page({
  data: {
    currentStep: 1,
    
    // 步骤1：就餐参数
    mealParams: {
      adults: 2,
      kids: 0,
      breakfast: false,
      lunch: true,
      dinner: true,
      dishCount: 3
    },
    
    // 步骤2：菜品选择
    activeMeal: 'lunch',
    candidateDishes: {
      breakfast: [],
      lunch: [],
      dinner: []
    },
    selectedDishes: {
      breakfast: [],
      lunch: [],
      dinner: []
    },
    
    // 步骤3：采购清单
    shoppingList: [],
    shoppingCategories: [],
    excludedItems: [],
    estimatedCost: 0,
    
    // 步骤4：分派执行
    purchaseMethod: 'self',
    assignee: 'nanny',
    platform: 'meituan',
    
    // 辅助数据
    tomorrowDate: '',
    canGoNext: false,
    allMealsSelected: false,
    totalMeals: 0,
    totalDishes: 0,
    assigneeName: '',
    platformName: '',
    activeMealName: '午餐'
  },

  onLoad() {
    this.initData()
    this.validateStep1()
  },

  // 初始化数据
  initData() {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    this.setData({
      tomorrowDate: formatDateYMD(tomorrow),
      activeMeal: this.getFirstActiveMeal()
    }, () => {
      this.updateActiveMealName()
    })
  },

  // 获取第一个激活的用餐
  getFirstActiveMeal() {
    const { mealParams } = this.data
    if (mealParams.breakfast) return 'breakfast'
    if (mealParams.lunch) return 'lunch'
    if (mealParams.dinner) return 'dinner'
    return 'lunch'
  },

  // ============ 步骤导航 ============
  
  jumpToStep(e) {
    const step = parseInt(e.currentTarget.dataset.step)
    if (step <= this.data.currentStep) {
      this.setData({ currentStep: step })
    }
  },

  nextStep() {
    const { currentStep } = this.data
    if (currentStep < 4) {
      if (currentStep === 1) this.generateDishCandidates()
      if (currentStep === 2) this.generateShoppingList()
      if (currentStep === 3) this.updateAssigneeInfo()
      
      this.setData({ currentStep: currentStep + 1 })
    }
  },

  prevStep() {
    const { currentStep } = this.data
    if (currentStep > 1) {
      this.setData({ currentStep: currentStep - 1 })
    }
  },

  // ============ 步骤1：就餐参数 ============
  
  changeCount(e) {
    const { type, delta } = e.currentTarget.dataset
    const { mealParams } = this.data
    const newValue = Math.max(0, mealParams[type] + parseInt(delta))
    
    this.setData({
      [`mealParams.${type}`]: newValue
    }, () => {
      this.validateStep1()
    })
  },

  toggleMeal(e) {
    const meal = e.currentTarget.dataset.meal
    const currentValue = this.data.mealParams[meal]
    
    this.setData({
      [`mealParams.${meal}`]: !currentValue
    }, () => {
      this.validateStep1()
      if (!this.data.mealParams[this.data.activeMeal]) {
        const newActiveMeal = this.getFirstActiveMeal()
        this.setData({ activeMeal: newActiveMeal }, () => {
          this.updateActiveMealName()
        })
      }
    })
  },

  setDishCount(e) {
    const count = parseInt(e.currentTarget.dataset.count)
    this.setData({
      'mealParams.dishCount': count
    }, () => {
      this.validateStep1()
    })
  },

  validateStep1() {
    const { mealParams } = this.data
    const hasPeople = mealParams.adults + mealParams.kids > 0
    const hasMeals = mealParams.breakfast || mealParams.lunch || mealParams.dinner
    const hasDishCount = mealParams.dishCount > 0
    
    this.setData({
      canGoNext: hasPeople && hasMeals && hasDishCount
    })
  },

  // ============ 步骤2：菜品选择 ============
  
  switchMeal(e) {
    const meal = e.currentTarget.dataset.meal
    this.setData({ activeMeal: meal }, () => {
      this.updateActiveMealName()
    })
  },

// 生成菜品候选 - 兼容版本，不使用async/await
generateDishCandidates() {
  wx.showLoading({ title: '智能推荐中...', mask: true })
  
  try {
    // 确保 RECIPES 可用
    if (!RECIPES || RECIPES.length === 0) {
      wx.hideLoading()
      wx.showToast({ title: '菜谱数据不可用', icon: 'none' })
      return
    }
    
    const { mealParams } = this.data
    
    // 生成基础菜品数据
    const allDishes = RECIPES.map(recipe => ({
      id: recipe.id,
      name: recipe.name,
      emoji: recipe.emoji || '🍽️',
      time: recipe.time,
      cost: this.mapBudgetToCost(recipe.budget),
      costLabel: this.getCostLabel(recipe.budget),
      tags: recipe.tags || [],
      ingredients: recipe.ingredients || [],
      selected: false
    }))
    
    // 为每个餐次初始化数据
    const candidateDishes = {
      breakfast: [],
      lunch: [],
      dinner: []
    }
    const selectedDishes = {
      breakfast: [],
      lunch: [],
      dinner: []
    }
    
    // 为激活的餐次设置候选菜品
    if (mealParams.breakfast) {
      candidateDishes.breakfast = JSON.parse(JSON.stringify(allDishes)) // 深拷贝
    }
    if (mealParams.lunch) {
      candidateDishes.lunch = JSON.parse(JSON.stringify(allDishes))
    }
    if (mealParams.dinner) {
      candidateDishes.dinner = JSON.parse(JSON.stringify(allDishes))
    }
    
    this.setData({
      candidateDishes: candidateDishes,
      selectedDishes: selectedDishes
    }, () => {
      this.updateCanGoNext()
      wx.hideLoading()
    })
    
  } catch (e) {
    wx.hideLoading()
    console.error('生成推荐失败:', e)
    wx.showToast({ title: '生成失败，请重试', icon: 'none' })
  }
},

  mapBudgetToCost(budget) {
    const map = { low: 'L', mid: 'M', high: 'H' }
    return map[budget] || 'M'
  },

  getCostLabel(budget) {
    const map = { low: '实惠', mid: '中等', high: '高档' }
    return map[budget] || '中等'
  },

  // 菜品选择逻辑 - 完全重写
  toggleDish(e) {
    const dish = e.currentTarget.dataset.dish
    const { activeMeal, mealParams, selectedDishes } = this.data
    
    const currentSelected = selectedDishes[activeMeal] || []
    const selectedIndex = currentSelected.findIndex(d => d.id === dish.id)
    
    let newSelected = []
    
    if (selectedIndex >= 0) {
      // 取消选择
      newSelected = currentSelected.filter(d => d.id !== dish.id)
    } else {
      // 添加选择
      if (currentSelected.length >= mealParams.dishCount) {
        wx.showToast({ 
          title: `${this.data.activeMealName}最多选择${mealParams.dishCount}道菜`, 
          icon: 'none' 
        })
        return
      }
      newSelected = [...currentSelected, { ...dish, selected: true }]
    }
    
    this.setData({
      [`selectedDishes.${activeMeal}`]: newSelected
    }, () => {
      this.updateCanGoNext()
    })
  },

  // 更新是否可以进入下一步 - 新增函数
  updateCanGoNext() {
    const { mealParams, selectedDishes } = this.data
    
    let canGoNext = true
    
    // 检查每个激活的餐次是否选够菜品
    if (mealParams.breakfast) {
      const breakfastCount = selectedDishes.breakfast ? selectedDishes.breakfast.length : 0
      if (breakfastCount < mealParams.dishCount) {
        canGoNext = false
      }
    }
    if (mealParams.lunch) {
      const lunchCount = selectedDishes.lunch ? selectedDishes.lunch.length : 0
      if (lunchCount < mealParams.dishCount) {
        canGoNext = false
      }
    }
    if (mealParams.dinner) {
      const dinnerCount = selectedDishes.dinner ? selectedDishes.dinner.length : 0
      if (dinnerCount < mealParams.dishCount) {
        canGoNext = false
      }
    }
    
    this.setData({ 
      allMealsSelected: canGoNext,
      canGoNext: canGoNext 
    })
  },

  // 简化重新生成菜品
  regenerateDishes() {
    const { activeMeal } = this.data
    
    wx.showLoading({ title: '重新推荐...', mask: true })
    
    setTimeout(() => {
      // 重新打乱菜品顺序
      const shuffledRecipes = [...RECIPES].sort(() => Math.random() - 0.5)
      const newCandidates = shuffledRecipes.map(recipe => ({
        id: recipe.id,
        name: recipe.name,
        emoji: recipe.emoji || '🍽️',
        time: recipe.time,
        cost: this.mapBudgetToCost(recipe.budget),
        costLabel: this.getCostLabel(recipe.budget),
        tags: recipe.tags || [],
        ingredients: recipe.ingredients || [],
        selected: false
      }))
      
      this.setData({
        [`candidateDishes.${activeMeal}`]: newCandidates
      })
      
      wx.hideLoading()
    }, 500)
  },

  // 简化的选择检查
  checkAllMealsSelected() {
    this.updateCanGoNext()
  },

  updateActiveMealName() {
    const mealNames = {
      breakfast: '早餐',
      lunch: '午餐', 
      dinner: '晚餐'
    }
    this.setData({
      activeMealName: mealNames[this.data.activeMeal] || '午餐'
    })
  },

  // ============ 步骤3：采购清单 ============
  
  generateShoppingList() {
    const { selectedDishes, mealParams } = this.data
    const allIngredients = new Map()
    
    // 收集所有食材
    Object.keys(selectedDishes).forEach(meal => {
      if (mealParams[meal] && selectedDishes[meal]) {
        selectedDishes[meal].forEach(dish => {
          if (dish.ingredients) {
            dish.ingredients.forEach(ingredient => {
              const count = allIngredients.get(ingredient) || 0
              allIngredients.set(ingredient, count + 1)
            })
          }
        })
      }
    })
    
    // 模拟库存扣除
    const excludedItems = ['食用油', '盐', '糖']
    const shoppingItems = []
    let totalCost = 0
    
    allIngredients.forEach((count, ingredient) => {
      if (!excludedItems.includes(ingredient)) {
        const price = this.estimatePrice(ingredient)
        shoppingItems.push({
          name: ingredient,
          spec: this.getDefaultSpec(ingredient),
          price: price,
          category: this.getIngredientCategory(ingredient)
        })
        totalCost += price
      }
    })
    
    // 按类别分组
    const categories = this.groupByCategory(shoppingItems)
    
    this.setData({
      shoppingList: shoppingItems,
      shoppingCategories: categories,
      excludedItems: excludedItems,
      estimatedCost: totalCost
    })
  },

  estimatePrice(ingredient) {
    const priceMap = {
      '西红柿': 8, '鸡蛋': 12, '土豆': 6, '青椒': 10,
      '蒜': 15, '葱': 5, '鸡胸肉': 25, '花生米': 18,
      '黄瓜': 8, '干辣椒': 20, '生抽': 12, '醋': 8
    }
    return priceMap[ingredient] || 10
  },

  getDefaultSpec(ingredient) {
    const specMap = {
      '西红柿': '500g', '鸡蛋': '10个', '土豆': '500g',
      '青椒': '300g', '蒜': '1头', '葱': '1把',
      '鸡胸肉': '500g', '花生米': '200g'
    }
    return specMap[ingredient] || '1份'
  },

  getIngredientCategory(ingredient) {
    const categoryMap = {
      '西红柿': '蔬菜', '土豆': '蔬菜', '青椒': '蔬菜', '黄瓜': '蔬菜',
      '鸡蛋': '蛋类', '鸡胸肉': '肉类', '花生米': '坚果',
      '蒜': '调料', '葱': '调料', '生抽': '调料', '醋': '调料'
    }
    return categoryMap[ingredient] || '其他'
  },

  groupByCategory(items) {
    const groups = {}
    items.forEach(item => {
      if (!groups[item.category]) {
        groups[item.category] = []
      }
      groups[item.category].push(item)
    })
    
    return Object.keys(groups).map(category => ({
      name: category,
      items: groups[category]
    }))
  },

  removeShoppingItem(e) {
    const item = e.currentTarget.dataset.item
    const { shoppingList, estimatedCost } = this.data
    
    const newList = shoppingList.filter(i => i.name !== item.name)
    const newCost = estimatedCost - item.price
    
    this.setData({
      shoppingList: newList,
      estimatedCost: newCost,
      shoppingCategories: this.groupByCategory(newList)
    })
  },

  // ============ 步骤4：分派执行 ============
  
  setPurchaseMethod(e) {
    const method = e.currentTarget.dataset.method
    this.setData({ purchaseMethod: method }, () => {
      this.updateAssigneeInfo()
    })
  },

  setAssignee(e) {
    const assignee = e.currentTarget.dataset.assignee
    this.setData({ assignee }, () => {
      this.updateAssigneeInfo()
    })
  },

  setPlatform(e) {
    const platform = e.currentTarget.dataset.platform
    this.setData({ platform }, () => {
      this.updateAssigneeInfo()
    })
  },

  updateAssigneeInfo() {
    const { purchaseMethod, assignee, platform, mealParams } = this.data
    
    let assigneeName = ''
    let platformName = ''
    let totalMeals = 0
    let totalDishes = 0
    
    // 计算餐次和菜数
    if (mealParams.breakfast) totalMeals++
    if (mealParams.lunch) totalMeals++
    if (mealParams.dinner) totalMeals++
    totalDishes = totalMeals * mealParams.dishCount
    
    // 确定执行人
    if (purchaseMethod === 'self') {
      assigneeName = '我自己'
    } else if (purchaseMethod === 'staff') {
      assigneeName = assignee === 'nanny' ? '阿姨' : '司机'
    } else if (purchaseMethod === 'online') {
      assigneeName = '线上配送'
      platformName = platform === 'meituan' ? '美团买菜' : '京东到家'
    }
    
    this.setData({
      assigneeName,
      platformName,
      totalMeals,
      totalDishes
    })
  },

  // ============ 导出功能 ============
  
  exportAsImage() {
    wx.showToast({ title: '图片已保存', icon: 'success' })
  },

  copyShoppingList() {
    const { shoppingList } = this.data
    const text = shoppingList.map(item => `• ${item.name} ${item.spec}`).join('\n')
    const content = `🛒 明日采购清单\n\n${text}\n\n——来自AI家庭管家`
    
    wx.setClipboardData({
      data: content,
      success: () => {
        wx.showToast({ title: '清单已复制', icon: 'success' })
      }
    })
  },

  jumpToPlatform() {
    const { platform } = this.data
    wx.showModal({
      title: '跳转提示',
      content: `即将跳转到${this.data.platformName}`,
      confirmText: '确定',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ title: '功能开发中', icon: 'none' })
        }
      }
    })
  },

// 完成定制 - 兼容版本
finishCustomization() {
  wx.showLoading({ title: '保存中...', mask: true })
  
  const menuData = {
    date: this.data.tomorrowDate,
    meals: this.data.selectedDishes,
    shoppingList: this.data.shoppingList,
    assignee: this.data.assigneeName,
    createdAt: new Date()
  }
  
  // 模拟保存过程，使用setTimeout代替async/await
  setTimeout(() => {
    wx.hideLoading()
    wx.showToast({ title: '定制完成', icon: 'success' })
    
    setTimeout(() => {
      wx.navigateBack()
    }, 1500)
  }, 1500)
},
})