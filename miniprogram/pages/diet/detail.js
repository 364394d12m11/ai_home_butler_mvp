// miniprogram/pages/diet/detail.js
const { makeShoppingList } = require('../../utils/menu-engine')
const { RECIPES } = require('../../utils/recipes')

Page({
  data: {
    dishId: '',
    dish: null,
    loading: true,
    
    // 菜品信息
    ingredients: [],
    steps: [],
    tags: [],
    
    // 用户交互
    favorited: false,
    difficulty: 1,
    estimatedTime: 0,
    
    // 相关推荐
    relatedDishes: [],
    
    // 制作提示
    showTips: false,
    tips: [],
        // ===== 新增这4个字段 =====
        reason: '',
        showShoppingModal: false,
        shoppingList: [],
        selectedItems: []
  },

  onLoad(options) {
    const { id } = options
    if (id) {
      this.setData({ dishId: id })
      this.loadDishDetail(id)
    } else {
      wx.showToast({ title: '菜品信息错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  // 加载菜品详情
  loadDishDetail(dishId) {
    try {
      // 从本地菜谱数据中查找
      const dish = RECIPES.find(recipe => recipe.id === dishId)
      
      if (!dish) {
        wx.showToast({ title: '未找到菜品信息', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }

      // 处理菜品数据
      const processedDish = {
        ...dish,
        costLabel: this.getCostLabel(dish.budget),
        spicyLabel: this.getSpicyLabel(dish.spicy),
        difficultyLabel: this.getDifficultyLabel(dish.time),
        nutritionInfo: this.getNutritionInfo(dish)
      }

      // 生成制作提示
      const tips = this.generateCookingTips(dish)
      
      // 获取相关推荐
      const relatedDishes = this.getRelatedDishes(dish)
      
      // 检查是否已收藏
      const favorited = this.checkIfFavorited(dishId)

      this.setData({
        dish: processedDish,
        ingredients: dish.ingredients || [],
        steps: dish.steps || [],
        tags: dish.tags || [],
        tips: tips,
        relatedDishes: relatedDishes,
        favorited: favorited,
        difficulty: Math.ceil(dish.time / 10),
        estimatedTime: dish.time,
        loading: false
      })

      // 设置导航栏标题
      wx.setNavigationBarTitle({
        title: dish.name
      })

    } catch (error) {
      console.error('加载菜品详情失败:', error)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 获取成本标签
  getCostLabel(budget) {
    const map = { low: '经济实惠', mid: '性价比高', high: '精品食材' }
    return map[budget] || '适中'
  },

  // 获取辣度标签
  getSpicyLabel(spicy) {
    const labels = ['不辣', '微辣', '中辣', '较辣', '很辣']
    return labels[spicy] || '不辣'
  },

  // 获取难度标签
  getDifficultyLabel(time) {
    if (time <= 10) return '简单'
    if (time <= 20) return '适中'
    return '稍难'
  },

  // 获取营养信息
  getNutritionInfo(dish) {
    return {
      calories: '约 ' + Math.floor(Math.random() * 200 + 150) + ' 千卡',
      protein: dish.tags.includes('肉菜') ? '丰富' : '适量',
      fiber: dish.tags.includes('蔬菜') ? '丰富' : '适量',
      fat: dish.budget === 'low' ? '较少' : '适量'
    }
  },

  // 生成制作提示
// 替换现有的一些空函数实现
generateCookingTips: function(dish) {
  const tips = []
  const tags = dish.tags || []
  const time = dish.time || dish.minutes || 0
  
  if (tags.includes('快手') || time <= 10) {
    tips.push('准备工作要充分，下锅后动作要快')
  }
  
  if (tags.includes('炒')) {
    tips.push('大火快炒，保持食材的脆嫩口感')
  }
  
  if (tags.includes('炖') || tags.includes('煮')) {
    tips.push('小火慢炖，不要频繁开盖')
  }
  
  const ingredients = dish.ingredients || []
  const hasGarlic = ingredients.some(ing => 
    (typeof ing === 'string' ? ing : ing.name || '').includes('蒜')
  )
  if (hasGarlic) {
    tips.push('蒜要小火慢炒，避免炒糊影响口感')
  }
  
  return tips
},

getCostLabel: function(dish) {
  const ingredients = dish.ingredients || []
  const ingredientsText = ingredients.join(' ')
  
  if (/牛肉|海鲜|鲍鱼/.test(ingredientsText)) {
    return '精品食材'
  }
  if (/鸡蛋|豆腐|白菜|土豆/.test(ingredientsText)) {
    return '经济实惠'
  }
  return '性价比高'
},

getSpicyLabel: function(dish) {
  const tags = dish.tags || []
  if (tags.includes('重辣')) return '很辣'
  if (tags.includes('中辣')) return '较辣'
  if (tags.includes('微辣')) return '微辣'
  return '不辣'
},

getDifficultyLabel: function(time) {
  if (time <= 10) return '简单'
  if (time <= 30) return '适中'
  return '稍难'
},

getNutritionInfo: function(dish) {
  const tags = dish.tags || []
  const time = dish.time || dish.minutes || 0
  
  return {
    calories: '约 ' + Math.floor(time * 8 + Math.random() * 100 + 150) + ' 千卡',
    protein: tags.includes('荤菜') ? '丰富' : '适量',
    fiber: tags.includes('素菜') ? '丰富' : '适量',
    fat: tags.includes('清淡') ? '较少' : '适量'
  }
},

getRelatedDishes: function(currentDish) {
  const tags = currentDish.tags || []
  const course = currentDish.course || '主菜'
  
  // 基于标签和类型的简单推荐
  const related = []
  
  if (course === '主菜') {
    related.push(
      { id: 'related-1', name: '清炒时蔬', emoji: '🥬', time: 5, difficulty: 1 },
      { id: 'related-2', name: '紫菜蛋花汤', emoji: '🍜', time: 8, difficulty: 1 }
    )
  } else if (course === '配菜') {
    related.push(
      { id: 'related-3', name: '家常豆腐', emoji: '🧈', time: 15, difficulty: 1 },
      { id: 'related-4', name: '银耳汤', emoji: '🍲', time: 30, difficulty: 1 }
    )
  }
  
  return related
},

  // 获取相关推荐
  getRelatedDishes(currentDish) {
    return RECIPES
      .filter(recipe => recipe.id !== currentDish.id)
      .filter(recipe => {
        const commonTags = recipe.tags.filter(tag => currentDish.tags.includes(tag))
        return commonTags.length > 0
      })
      .slice(0, 3)
      .map(recipe => ({
        id: recipe.id,
        name: recipe.name,
        emoji: recipe.emoji,
        time: recipe.time,
        difficulty: Math.ceil(recipe.time / 10)
      }))
  },

  // 检查是否已收藏
  checkIfFavorited(dishId) {
    try {
      const favorites = wx.getStorageSync('FAVORITE_DISHES') || []
      return favorites.includes(dishId)
    } catch (e) {
      return false
    }
  },

  // 切换收藏状态
  toggleFavorite() {
    const { dishId, favorited } = this.data
    
    try {
      let favorites = wx.getStorageSync('FAVORITE_DISHES') || []
      
      if (favorited) {
        favorites = favorites.filter(id => id !== dishId)
        wx.showToast({ title: '已取消收藏', icon: 'success' })
      } else {
        favorites.push(dishId)
        wx.showToast({ title: '已加入收藏', icon: 'success' })
      }
      
      wx.setStorageSync('FAVORITE_DISHES', favorites)
      this.setData({ favorited: !favorited })
      
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // 查看制作视频
  watchVideo() {
    wx.showModal({
      title: '制作视频',
      content: '视频功能正在开发中，敬请期待！\n\n您可以按照步骤说明进行制作。',
      showCancel: false,
      confirmText: '好的'
    })
  },

  // 分享菜谱
  shareDish() {
    const { dish } = this.data
    
    wx.showActionSheet({
      itemList: ['分享给好友', '复制制作步骤'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            this.shareToFriend()
            break
          case 1:
            this.copySteps()
            break
        }
      }
    })
  },

  // 分享给好友
  shareToFriend() {
    wx.showToast({ title: '长按右上角分享', icon: 'none' })
  },

  // 复制制作步骤
  copySteps() {
    const { dish, steps } = this.data
    
    let content = `${dish.name}\n\n`
    content += `制作时间：${dish.time}分钟\n`
    content += `成本：${dish.costLabel}\n\n`
    content += `制作步骤：\n`
    
    steps.forEach((step, index) => {
      content += `${index + 1}. ${step}\n`
    })
    
    content += `\n——来自AI家庭管家`
    
    wx.setClipboardData({
      data: content,
      success: () => {
        wx.showToast({ title: '制作步骤已复制', icon: 'success' })
      }
    })
  },

  // 切换制作提示显示
  toggleTips() {
    this.setData({
      showTips: !this.data.showTips
    })
  },

  // 查看相关菜品
  viewRelatedDish(e) {
    const { id } = e.currentTarget.dataset
    wx.redirectTo({
      url: `/pages/diet/detail?id=${id}`
    })
  },

  // 添加到今日菜单
  addToTodayMenu() {
    const { dish } = this.data
    
    wx.showModal({
      title: '添加到今日菜单',
      content: `确定要将"${dish.name}"添加到今日菜单吗？`,
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ title: '已添加到今日菜单', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 1500)
        }
      }
    })
  },

  // 生成购物清单
  generateShoppingList() {
    const { dish, ingredients } = this.data
    
    wx.showLoading({ title: '生成购物清单...', mask: true })
    
    setTimeout(() => {
      wx.hideLoading()
      wx.showModal({
        title: '购物清单已生成',
        content: `已为"${dish.name}"生成购物清单，包含${ingredients.length}种食材。`,
        showCancel: false,
        confirmText: '知道了'
      })
    }, 1000)
  },

  // 页面分享配置
  onShareAppMessage() {
    const { dish } = this.data
    return {
      title: `${dish ? dish.name : '美味菜谱'} - AI家庭管家`,
      path: `/pages/diet/detail?id=${this.data.dishId}`
    }
  },

// ===== V4.3新增函数 =====

loadFromMenuHistory: function(dishId) {
  try {
    const today = this.formatDate(new Date())
    const menuHistory = wx.getStorageSync('MENU_HISTORY') || []
    const todayMenu = menuHistory.find(item => item.date === today)
    
    if (todayMenu && todayMenu.dishes) {
      const dish = todayMenu.dishes.find(d => 
        d.id === dishId || d.name === dishId || d.title === dishId
      )
      
      if (dish) {
        this.processDishData(dish, 'menu')
        return
      }
    }
    
    // 降级到常规加载
    this.loadDishDetail(dishId)
    
  } catch (e) {
    console.error('从菜单历史加载失败:', e)
    this.loadDishDetail(dishId)
  }
},

loadFallbackDish: function(dishId) {
  const fallbackDishes = {
    'seed-1': {
      id: 'seed-1',
      name: '蒜香西兰花',
      title: '蒜香西兰花',
      desc: '清爽解腻，10分钟出餐',
      tags: ['家常', '快手', '素菜', '清淡'],
      minutes: 10,
      time: 10,
      difficulty: 1,
      course: '配菜',
      budget: '实惠',
      ingredients: [
        { name: '西兰花', qty: '1棵' },
        { name: '大蒜', qty: '4瓣' },
        { name: '盐', qty: '1/2勺' },
        { name: '橄榄油', qty: '1勺' }
      ],
      steps: [
        '西兰花掰小朵，开水加盐焯1分钟，过凉控水',
        '蒜拍碎下油，小火炸香',
        '下西兰花大火翻炒30秒，盐+少许水抛锅出'
      ],
      reason: '清淡爽口，营养均衡，制作简单'
    }
  }
  
  const dish = fallbackDishes[dishId] || fallbackDishes['seed-1']
  this.processDishData(dish, 'fallback')
},

processDishData: function(dish, source) {
  try {
    // 数据标准化
    const processedDish = {
      ...dish,
      name: dish.name || dish.title,
      time: dish.time || dish.minutes || 0,
      course: dish.course || this.inferCourse(dish),
      costLabel: this.getCostLabel(dish),
      spicyLabel: this.getSpicyLabel(dish),
      difficultyLabel: this.getDifficultyLabel(dish.time || dish.minutes),
      nutritionInfo: this.getNutritionInfo(dish)
    }

    // 格式化食材
    const ingredients = this.formatIngredients(dish.ingredients || [])
    
    // 生成制作提示
    const tips = this.generateCookingTips(dish)
    
    // 获取相关推荐
    const relatedDishes = this.getRelatedDishes(dish)
    
    // 检查是否已收藏
    const favorited = this.checkIfFavorited(dish.id || dish.name)

    // 提取推荐理由
    const reason = dish.reason || this.generateDefaultReason(dish)

    this.setData({
      dish: processedDish,
      ingredients: ingredients,
      steps: dish.steps || [],
      tags: dish.tags || [],
      reason: reason,
      tips: tips,
      relatedDishes: relatedDishes,
      favorited: favorited,
      difficulty: Math.ceil((dish.time || dish.minutes || 10) / 10),
      estimatedTime: dish.time || dish.minutes || 0,
      loading: false
    })

    // 设置导航栏标题
    wx.setNavigationBarTitle({
      title: processedDish.name
    })

  } catch (error) {
    console.error('处理菜品数据失败:', error)
    this.setData({ loading: false })
    wx.showToast({ title: '加载失败', icon: 'none' })
  }
},

inferCourse: function(dish) {
  const title = dish.title || dish.name || ''
  const tags = dish.tags || []
  
  if (tags.includes('汤') || title.includes('汤')) return '汤品'
  if (tags.includes('配菜') || tags.includes('凉菜')) return '配菜'
  return '主菜'
},

formatIngredients: function(ingredients) {
  if (!Array.isArray(ingredients)) return []
  
  return ingredients.map(ing => {
    if (typeof ing === 'string') {
      const parts = ing.split(/\s+/)
      return {
        name: parts[0] || ing,
        qty: parts.slice(1).join(' ') || '适量'
      }
    }
    return ing
  })
},

generateDefaultReason: function(dish) {
  const tags = dish.tags || []
  
  if (tags.includes('清淡')) return '清爽解腻，营养均衡'
  if (tags.includes('快手')) return '制作简单，省时便捷'
  if (tags.includes('下饭')) return '口味浓郁，特别下饭'
  if (tags.includes('汤')) return '温润滋补，暖胃又暖心'
  
  return '营养搭配合理，适合日常食用'
},

generateShoppingList: function() {
  const { dish, ingredients } = this.data
  
  if (!ingredients || ingredients.length === 0) {
    wx.showToast({ title: '暂无食材信息', icon: 'none' })
    return
  }
  
  wx.showLoading({ title: '生成购物清单...', mask: true })
  
  try {
    // 构建临时菜单数据
    const tempMenu = [{
      name: dish.name,
      ingredients: ingredients
    }]
    
    // 使用工具函数生成购物清单
    const shoppingList = makeShoppingList(tempMenu, 2)
    
    this.setData({
      shoppingList: shoppingList.map(item => ({
        ...item,
        selected: false
      })),
      selectedItems: [],
      showShoppingModal: true
    })
    
    wx.hideLoading()
    
  } catch (e) {
    wx.hideLoading()
    console.error('生成购物清单失败:', e)
    wx.showToast({ title: '生成失败', icon: 'none' })
  }
},

closeShoppingModal: function() {
  this.setData({ showShoppingModal: false })
},

toggleShoppingItem: function(e) {
  const index = e.currentTarget.dataset.index
  const shoppingList = this.data.shoppingList
  const selectedItems = this.data.selectedItems
  
  shoppingList[index].selected = !shoppingList[index].selected
  
  if (shoppingList[index].selected) {
    selectedItems.push(shoppingList[index])
  } else {
    const itemIndex = selectedItems.findIndex(item => item.name === shoppingList[index].name)
    if (itemIndex > -1) {
      selectedItems.splice(itemIndex, 1)
    }
  }
  
  this.setData({ shoppingList, selectedItems })
},

addToShoppingList: function() {
  const { selectedItems } = this.data
  
  if (selectedItems.length === 0) {
    wx.showToast({ title: '请选择要添加的食材', icon: 'none' })
    return
  }
  
  try {
    // 获取现有购物清单
    let existingList = wx.getStorageSync('USER_SHOPPING_LIST') || []
    
    // 合并新选择的项目
    selectedItems.forEach(item => {
      const existingItem = existingList.find(existing => existing.name === item.name)
      if (existingItem) {
        // 如果已存在，增加数量
        existingItem.qty = (parseFloat(existingItem.qty) || 0) + (parseFloat(item.qty) || 1)
      } else {
        // 新增项目
        existingList.push({
          ...item,
          addedAt: new Date().toISOString(),
          checked: false
        })
      }
    })
    
    wx.setStorageSync('USER_SHOPPING_LIST', existingList)
    
    this.setData({ showShoppingModal: false })
    
    wx.showToast({ 
      title: `已添加${selectedItems.length}项到购物清单`, 
      icon: 'success' 
    })
    
  } catch (e) {
    console.error('添加到购物清单失败:', e)
    wx.showToast({ title: '添加失败', icon: 'none' })
  }
},

// 工具函数：格式化日期
formatDate: function(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
},

toggleFavorite: function() {
  const { dish, favorited } = this.data
  const dishId = dish.id || dish.name
  
  try {
    let favorites = wx.getStorageSync('FAVORITE_DISHES') || []
    
    if (favorited) {
      // 取消收藏
      favorites = favorites.filter(fav => {
        if (typeof fav === 'string') {
          return fav !== dishId
        }
        return fav.id !== dishId && fav.name !== dish.name
      })
      wx.showToast({ title: '已取消收藏', icon: 'success' })
    } else {
      // 添加收藏
      const favoriteItem = {
        id: dishId,
        name: dish.name,
        course: dish.course,
        time: dish.time,
        tags: dish.tags,
        addedAt: new Date().toISOString()
      }
      favorites.push(favoriteItem)
      wx.showToast({ title: '已加入收藏', icon: 'success' })
    }
    
    wx.setStorageSync('FAVORITE_DISHES', favorites)
    this.setData({ favorited: !favorited })
    
  } catch (e) {
    console.error('收藏操作失败:', e)
    wx.showToast({ title: '操作失败', icon: 'none' })
  }
},

checkIfFavorited: function(dishId) {
  try {
    const favorites = wx.getStorageSync('FAVORITE_DISHES') || []
    return favorites.some(fav => {
      if (typeof fav === 'string') {
        return fav === dishId
      }
      return fav.id === dishId || fav.name === dishId
    })
  } catch (e) {
    return false
  }
},

})