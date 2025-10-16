// miniprogram/pages/diet/modify-today/index.js
const { formatDateYMD, weekdayCN } = require('../../../utils/datetime')
const { RECIPES } = require('../../../utils/recipes')

Page({
  data: {
    todayDate: '',
    weekday: '',
    
    // 当前菜单
    currentMenu: [],
    
    // 候选菜品
    candidateDishes: [],
    showCandidates: false,
    targetMealIndex: -1, // 正在替换的餐次索引
    targetDishIndex: -1, // 正在替换的菜品索引
    
    // 调整选项
    portionOptions: [
      { adults: 1, kids: 0, label: '1位成人' },
      { adults: 2, kids: 0, label: '2位成人' },
      { adults: 2, kids: 1, label: '2大1小' },
      { adults: 2, kids: 2, label: '2大2小' },
      { adults: 3, kids: 0, label: '3位成人' },
      { adults: 4, kids: 0, label: '4位成人' }
    ],
    
    // 过滤选项
    filterOptions: {
      cuisine: 'all', // all/中式/西式/日式
      time: 'all',    // all/quick(<=15min)/normal
      cost: 'all'     // all/L/M/H
    },
    
    // 界面状态
    hasChanges: false,
    saving: false
  },

  onLoad() {
    this.initPage()
    this.loadCurrentMenu()
  },

  // 初始化页面
  initPage() {
    const today = new Date()
    this.setData({
      todayDate: formatDateYMD(today),
      weekday: weekdayCN(today)
    })
  },

  // 加载当前菜单
  async loadCurrentMenu() {
    try {
      // 模拟加载今日菜单（实际应从云端获取）
      const mockMenu = [
        {
          name: '午餐',
          people: { adults: 2, kids: 0 },
          dishes: [
            { id: 'tomato-egg', name: '西红柿炒蛋', time: 10, cost: 'L', costLabel: '实惠', locked: false },
            { id: 'broccoli-garlic', name: '蒜蓉西兰花', time: 8, cost: 'L', costLabel: '实惠', locked: false }
          ]
        },
        {
          name: '晚餐',
          people: { adults: 2, kids: 0 },
          dishes: [
            { id: 'kungpao-chicken', name: '宫保鸡丁', time: 18, cost: 'M', costLabel: '中等', locked: false },
            { id: 'potato-greenpepper', name: '青椒土豆丝', time: 12, cost: 'L', costLabel: '实惠', locked: false }
          ]
        }
      ]
      
      this.setData({ currentMenu: mockMenu })
      
    } catch (e) {
      wx.showToast({ title: '加载菜单失败', icon: 'none' })
    }
  },

  // 调整就餐人数
  adjustPortion(e) {
    const { mealIndex } = e.currentTarget.dataset
    const { portionOptions } = this.data
    
    wx.showActionSheet({
      itemList: portionOptions.map(option => option.label),
      success: (res) => {
        const selectedOption = portionOptions[res.tapIndex]
        const menu = [...this.data.currentMenu]
        menu[mealIndex].people = { adults: selectedOption.adults, kids: selectedOption.kids }
        
        this.setData({ 
          currentMenu: menu,
          hasChanges: true 
        })
      }
    })
  },

  // 锁定/解锁菜品
  toggleDishLock(e) {
    const { mealIndex, dishIndex } = e.currentTarget.dataset
    const menu = [...this.data.currentMenu]
    menu[mealIndex].dishes[dishIndex].locked = !menu[mealIndex].dishes[dishIndex].locked
    
    this.setData({ 
      currentMenu: menu,
      hasChanges: true 
    })
    
    const dish = menu[mealIndex].dishes[dishIndex]
    const action = dish.locked ? '锁定' : '解锁'
    wx.showToast({ title: `${dish.name} 已${action}`, icon: 'success' })
  },

  // 替换菜品
  replaceDish(e) {
    const { mealIndex, dishIndex } = e.currentTarget.dataset
    const dish = this.data.currentMenu[mealIndex].dishes[dishIndex]
    
    if (dish.locked) {
      wx.showToast({ title: '该菜品已锁定', icon: 'none' })
      return
    }
    
    this.setData({
      targetMealIndex: mealIndex,
      targetDishIndex: dishIndex
    })
    
    this.generateCandidates(dish)
  },

  // 生成候选菜品
  async generateCandidates(currentDish) {
    wx.showLoading({ title: '智能推荐中...', mask: true })
    
    try {
      // 模拟调性驱动推荐
      const tasteProfile = wx.getStorageSync('TASTE_PROFILE') || {}
      const { filterOptions } = this.data
      
      let candidates = RECIPES.map(recipe => ({
        id: recipe.id,
        name: recipe.name,
        emoji: recipe.emoji || '🍽️',
        time: recipe.time,
        cost: this.mapBudgetToCost(recipe.budget),
        costLabel: this.getCostLabel(recipe.budget),
        tags: recipe.tags || [],
        ingredients: recipe.ingredients || []
      }))
      
      // 排除当前菜品
      candidates = candidates.filter(c => c.id !== currentDish.id)
      
      // 应用过滤器
      candidates = this.applyFilters(candidates, filterOptions)
      
      // 按调性排序
      candidates = this.sortByPreference(candidates, tasteProfile)
      
      // 取前8个候选
      candidates = candidates.slice(0, 8)
      
      this.setData({
        candidateDishes: candidates,
        showCandidates: true
      })
      
    } catch (e) {
      wx.showToast({ title: '推荐失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 应用过滤器
  applyFilters(dishes, filters) {
    let filtered = dishes
    
    // 菜系过滤
    if (filters.cuisine !== 'all') {
      filtered = filtered.filter(dish => dish.tags.includes(filters.cuisine))
    }
    
    // 时间过滤
    if (filters.time === 'quick') {
      filtered = filtered.filter(dish => dish.time <= 15)
    }
    
    // 成本过滤
    if (filters.cost !== 'all') {
      filtered = filtered.filter(dish => dish.cost === filters.cost)
    }
    
    return filtered
  },

  // 按偏好排序
  sortByPreference(dishes, profile) {
    return dishes.sort((a, b) => {
      let scoreA = 0, scoreB = 0
      
      // 消费层级权重
      if (profile.consumptionLevel === 'budget') {
        scoreA += a.cost === 'L' ? 3 : (a.cost === 'M' ? 1 : -1)
        scoreB += b.cost === 'L' ? 3 : (b.cost === 'M' ? 1 : -1)
      } else if (profile.consumptionLevel === 'luxury') {
        scoreA += a.cost === 'H' ? 3 : (a.cost === 'M' ? 1 : -1)
        scoreB += b.cost === 'H' ? 3 : (b.cost === 'M' ? 1 : -1)
      }
      
      // 时间偏好权重
      scoreA += a.time <= 15 ? 2 : 0
      scoreB += b.time <= 15 ? 2 : 0
      
      return scoreB - scoreA
    })
  },

  mapBudgetToCost(budget) {
    const map = { low: 'L', mid: 'M', high: 'H' }
    return map[budget] || 'M'
  },

  getCostLabel(budget) {
    const map = { low: '实惠', mid: '中等', high: '高档' }
    return map[budget] || '中等'
  },

  // 设置过滤器
  setFilter(e) {
    const { type, value } = e.currentTarget.dataset
    this.setData({
      [`filterOptions.${type}`]: value
    })
    
    // 如果候选列表已打开，重新生成
    if (this.data.showCandidates && this.data.targetMealIndex >= 0) {
      const currentDish = this.data.currentMenu[this.data.targetMealIndex].dishes[this.data.targetDishIndex]
      this.generateCandidates(currentDish)
    }
  },

  // 选择候选菜品
  selectCandidate(e) {
    const candidate = e.currentTarget.dataset.dish
    const { targetMealIndex, targetDishIndex } = this.data
    
    if (targetMealIndex < 0 || targetDishIndex < 0) return
    
    const menu = [...this.data.currentMenu]
    const oldDish = menu[targetMealIndex].dishes[targetDishIndex]
    
    // 替换菜品
    menu[targetMealIndex].dishes[targetDishIndex] = {
      ...candidate,
      locked: oldDish.locked
    }
    
    this.setData({
      currentMenu: menu,
      showCandidates: false,
      targetMealIndex: -1,
      targetDishIndex: -1,
      hasChanges: true
    })
    
    wx.showToast({ 
      title: `已替换为 ${candidate.name}`, 
      icon: 'success' 
    })
  },

  // 关闭候选列表
  closeCandidates() {
    this.setData({
      showCandidates: false,
      targetMealIndex: -1,
      targetDishIndex: -1
    })
  },

  // 重新生成整餐
  regenerateMeal(e) {
    const mealIndex = parseInt(e.currentTarget.dataset.mealIndex)
    const meal = this.data.currentMenu[mealIndex]
    
    // 检查是否有锁定的菜品
    const lockedDishes = meal.dishes.filter(dish => dish.locked)
    const unlocked = meal.dishes.filter(dish => !dish.locked).length
    
    if (unlocked === 0) {
      wx.showToast({ title: '所有菜品已锁定', icon: 'none' })
      return
    }
    
    wx.showModal({
      title: '重新生成',
      content: `将重新生成${meal.name}的${unlocked}道菜品，锁定的菜品将保留。`,
      success: (res) => {
        if (res.confirm) {
          this.doRegenerateMeal(mealIndex)
        }
      }
    })
  },

  // 执行重新生成
  async doRegenerateMeal(mealIndex) {
    wx.showLoading({ title: '重新生成中...', mask: true })
    
    try {
      const menu = [...this.data.currentMenu]
      const meal = menu[mealIndex]
      
      // 保留锁定的菜品
      const lockedDishes = meal.dishes.filter(dish => dish.locked)
      const needCount = meal.dishes.length - lockedDishes.length
      
      // 生成新菜品
      const tasteProfile = wx.getStorageSync('TASTE_PROFILE') || {}
      let candidates = RECIPES.map(recipe => ({
        id: recipe.id,
        name: recipe.name,
        emoji: recipe.emoji || '🍽️',
        time: recipe.time,
        cost: this.mapBudgetToCost(recipe.budget),
        costLabel: this.getCostLabel(recipe.budget),
        tags: recipe.tags || [],
        locked: false
      }))
      
      // 排除已有的菜品
      const existingIds = lockedDishes.map(d => d.id)
      candidates = candidates.filter(c => !existingIds.includes(c.id))
      
      // 排序并取需要的数量
      candidates = this.sortByPreference(candidates, tasteProfile)
      const newDishes = candidates.slice(0, needCount)
      
      // 更新菜单
      menu[mealIndex].dishes = [...lockedDishes, ...newDishes]
      
      this.setData({
        currentMenu: menu,
        hasChanges: true
      })
      
      wx.showToast({ title: '重新生成完成', icon: 'success' })
      
    } catch (e) {
      wx.showToast({ title: '生成失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 添加菜品
  addDish(e) {
    const mealIndex = parseInt(e.currentTarget.dataset.mealIndex)
    
    this.setData({
      targetMealIndex: mealIndex,
      targetDishIndex: -2 // -2 表示添加模式
    })
    
    this.generateCandidates({ id: 'none' }) // 传入空菜品
  },

  // 删除菜品
  removeDish(e) {
    const { mealIndex, dishIndex } = e.currentTarget.dataset
    const dish = this.data.currentMenu[mealIndex].dishes[dishIndex]
    
    if (dish.locked) {
      wx.showToast({ title: '锁定菜品无法删除', icon: 'none' })
      return
    }
    
    wx.showModal({
      title: '删除菜品',
      content: `确定删除"${dish.name}"吗？`,
      success: (res) => {
        if (res.confirm) {
          const menu = [...this.data.currentMenu]
          menu[mealIndex].dishes.splice(dishIndex, 1)
          
          this.setData({
            currentMenu: menu,
            hasChanges: true
          })
          
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  // 保存修改
  async saveChanges() {
    if (!this.data.hasChanges) {
      wx.navigateBack()
      return
    }
    
    this.setData({ saving: true })
    
    try {
      // 模拟保存到云端
      const menuData = {
        date: this.data.todayDate,
        meals: this.data.currentMenu,
        updatedAt: new Date()
      }
      
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      wx.showToast({ title: '保存成功', icon: 'success' })
      
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  // 取消修改
  cancelChanges() {
    if (!this.data.hasChanges) {
      wx.navigateBack()
      return
    }
    
    wx.showModal({
      title: '放弃修改',
      content: '确定放弃所有修改吗？',
      success: (res) => {
        if (res.confirm) {
          wx.navigateBack()
        }
      }
    })
  }
})