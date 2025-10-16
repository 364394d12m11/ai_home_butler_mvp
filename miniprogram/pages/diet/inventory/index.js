// miniprogram/pages/diet/inventory/index.js
const { formatDateYMD } = require('../../../utils/datetime')

Page({
  data: {
    // 统计数据
    totalItems: 0,
    lowStockCount: 0,
    todayExpired: 0,
    
    // 超保守提醒
    conservativeAlerts: [],
    
    // 分类和筛选
    activeCategory: 'all',
    categories: [
      { key: 'vegetable', name: '蔬菜', count: 0 },
      { key: 'meat', name: '肉类', count: 0 },
      { key: 'seasoning', name: '调料', count: 0 },
      { key: 'grain', name: '粮油', count: 0 },
      { key: 'other', name: '其他', count: 0 }
    ],
    
    // 搜索
    searchKeyword: '',
    searchAliases: [],
    
    // 库存数据
    inventory: [],
    filteredInventory: [],
    
    // 趋势
    showTrends: false,
    trendPeriod: 'week',
    
    // 添加弹窗
    showAddModal: false,
    newItem: {
      name: '',
      quantity: '',
      unitIndex: 0,
      expireDate: '',
      aliases: ''
    },
    unitOptions: ['个', 'g', 'ml', '包', '袋', '瓶', '罐', '斤', 'kg', 'L']
  },

  onLoad() {
    this.loadInventoryData()
    this.checkConservativeAlerts()
  },

  onShow() {
    this.refreshData()
  },

  // 加载库存数据
  async loadInventoryData() {
    try {
      // 模拟库存数据
      const mockInventory = [
        {
          name: '西红柿',
          aliases: ['番茄', '洋柿子'],
          quantity: 150,
          unit: 'g',
          category: 'vegetable',
          dailyConsumption: 25,
          predictedDays: 6,
          expireDate: '2025-10-12',
          status: 'sufficient',
          statusText: '充足',
          confidence: 95,
          recentChanges: [
            { date: '10-05', action: '入库', quantity: 500, unit: 'g' },
            { date: '10-04', action: '消耗', quantity: 100, unit: 'g' }
          ]
        },
        {
          name: '生抽',
          aliases: ['酱油', '豉油'],
          quantity: 50,
          unit: 'ml',
          category: 'seasoning',
          dailyConsumption: 8,
          predictedDays: 6,
          status: 'low',
          statusText: '偏低',
          confidence: 88,
          recentChanges: [
            { date: '10-03', action: '消耗', quantity: 15, unit: 'ml' }
          ]
        },
        {
          name: '鸡蛋',
          aliases: ['蛋'],
          quantity: 2,
          unit: '个',
          category: 'meat',
          dailyConsumption: 0.5,
          predictedDays: 4,
          status: 'low',
          statusText: '偏低',
          confidence: 92,
          recentChanges: [
            { date: '10-04', action: '消耗', quantity: 2, unit: '个' }
          ]
        },
        {
          name: '牛奶',
          aliases: ['鲜奶'],
          quantity: 0,
          unit: 'ml',
          category: 'other',
          expireDate: '2025-10-06',
          status: 'expired',
          statusText: '已用完',
          confidence: 99,
          recentChanges: [
            { date: '10-05', action: '消耗', quantity: 250, unit: 'ml' }
          ]
        }
      ]
      
      this.setData({ inventory: mockInventory }, () => {
        this.updateStatistics()
        this.filterInventory()
      })
      
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 检查超保守提醒
  async checkConservativeAlerts() {
    try {
      // 模拟超保守提醒逻辑（置信度 >= 80%）
      const alerts = [
        {
          name: '生抽',
          message: '预计6天内用完，建议补充',
          confidence: 88,
          reason: '基于近7天消耗量计算'
        },
        {
          name: '鸡蛋',
          message: '仅剩2个，建议购买',
          confidence: 92,
          reason: '库存量低于安全阈值'
        }
      ]
      
      // 只显示置信度 >= 80% 的提醒
      const highConfidenceAlerts = alerts.filter(alert => alert.confidence >= 80)
      
      this.setData({ conservativeAlerts: highConfidenceAlerts })
      
    } catch (e) {
      console.error('检查库存提醒失败:', e)
    }
  },

  // 更新统计数据
  updateStatistics() {
    const { inventory } = this.data
    const today = formatDateYMD(new Date())
    
    let totalItems = inventory.length
    let lowStockCount = inventory.filter(item => item.status === 'low').length
    let todayExpired = inventory.filter(item => item.expireDate === today).length
    
    // 更新分类计数
    const categories = [...this.data.categories]
    categories.forEach(category => {
      category.count = inventory.filter(item => item.category === category.key).length
    })
    
    this.setData({
      totalItems,
      lowStockCount,
      todayExpired,
      categories
    })
  },

  // 切换分类
  switchCategory(e) {
    const category = e.currentTarget.dataset.category
    this.setData({ activeCategory: category }, () => {
      this.filterInventory()
    })
  },

  // 搜索输入
  onSearchInput(e) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword }, () => {
      this.updateSearchAliases(keyword)
      this.filterInventory()
    })
  },

  // 更新搜索别名建议
  updateSearchAliases(keyword) {
    if (!keyword) {
      this.setData({ searchAliases: [] })
      return
    }
    
    const { inventory } = this.data
    const aliases = new Set()
    
    inventory.forEach(item => {
      item.aliases.forEach(alias => {
        if (alias.includes(keyword) && alias !== keyword) {
          aliases.add(alias)
        }
      })
    })
    
    this.setData({ searchAliases: Array.from(aliases).slice(0, 5) })
  },

  // 选择别名
  selectAlias(e) {
    const alias = e.currentTarget.dataset.alias
    this.setData({ searchKeyword: alias }, () => {
      this.filterInventory()
    })
  },

  // 过滤库存
  filterInventory() {
    const { inventory, activeCategory, searchKeyword } = this.data
    
    let filtered = inventory
    
    // 分类过滤
    if (activeCategory !== 'all') {
      filtered = filtered.filter(item => item.category === activeCategory)
    }
    
    // 搜索过滤
    if (searchKeyword) {
      filtered = filtered.filter(item => {
        const searchText = `${item.name} ${item.aliases.join(' ')}`
        return searchText.includes(searchKeyword)
      })
    }
    
    this.setData({ filteredInventory: filtered })
  },

  // 忽略提醒
  async ignoreAlert(e) {
    const item = e.currentTarget.dataset.item
    
    wx.showModal({
      title: '忽略提醒',
      content: `将忽略"${item.name}"的库存提醒14天，确定吗？`,
      success: (res) => {
        if (res.confirm) {
          // 从提醒列表中移除
          const alerts = this.data.conservativeAlerts.filter(alert => alert.name !== item.name)
          this.setData({ conservativeAlerts: alerts })
          
          // 记录忽略操作（实际应保存到云端）
          wx.showToast({ title: '已忽略', icon: 'success' })
        }
      }
    })
  },

  // 从提醒添加到购物清单
  async addToShoppingFromAlert(e) {
    const item = e.currentTarget.dataset.item
    
    try {
      // 模拟添加到购物清单
      wx.showLoading({ title: '添加中...', mask: true })
      await new Promise(resolve => setTimeout(resolve, 800))
      
      wx.showToast({ title: '已加入采购清单', icon: 'success' })
      
      // 从提醒中移除
      const alerts = this.data.conservativeAlerts.filter(alert => alert.name !== item.name)
      this.setData({ conservativeAlerts: alerts })
      
    } catch (e) {
      wx.showToast({ title: '添加失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 调整数量
  async adjustQuantity(e) {
    const { item, action } = e.currentTarget.dataset
    const delta = action === 'increase' ? 1 : -1
    const newQuantity = Math.max(0, item.quantity + delta)
    
    try {
      // 更新库存数量
      const inventory = [...this.data.inventory]
      const index = inventory.findIndex(i => i.name === item.name)
      if (index >= 0) {
        inventory[index].quantity = newQuantity
        
        // 重新计算状态
        this.updateItemStatus(inventory[index])
        
        this.setData({ inventory }, () => {
          this.updateStatistics()
          this.filterInventory()
        })
      }
      
    } catch (e) {
      wx.showToast({ title: '更新失败', icon: 'none' })
    }
  },

  // 更新物品状态
  updateItemStatus(item) {
    const today = new Date()
    const expireDate = item.expireDate ? new Date(item.expireDate) : null
    
    if (item.quantity === 0) {
      item.status = 'expired'
      item.statusText = '已用完'
    } else if (expireDate && expireDate <= today) {
      item.status = 'expired'
      item.statusText = '已过期'
    } else if (item.predictedDays && item.predictedDays <= 3) {
      item.status = 'low'
      item.statusText = '偏低'
    } else {
      item.status = 'sufficient'
      item.statusText = '充足'
    }
  },

  // 编辑物品
  editItem(e) {
    const item = e.currentTarget.dataset.item
    wx.showModal({
      title: '编辑库存',
      content: `编辑"${item.name}"的详细信息`,
      showCancel: false,
      confirmText: '功能开发中'
    })
  },

  // 快速入库
  quickAddItem() {
    this.setData({ showAddModal: true })
  },

  // 扫码入库
  scanBarcode() {
    wx.scanCode({
      success: (res) => {
        wx.showToast({ title: '扫码功能开发中', icon: 'none' })
      },
      fail: () => {
        wx.showToast({ title: '扫码失败', icon: 'none' })
      }
    })
  },

  // 语音入库
  voiceAddItem() {
    wx.showToast({ title: '语音功能开发中', icon: 'none' })
  },

  // 关闭添加弹窗
  closeAddModal() {
    this.setData({ 
      showAddModal: false,
      newItem: {
        name: '',
        quantity: '',
        unitIndex: 0,
        expireDate: '',
        aliases: ''
      }
    })
  },

  // 更新新物品信息
  updateNewItem(e) {
    const { field } = e.currentTarget.dataset
    const value = e.detail.value
    this.setData({
      [`newItem.${field}`]: value
    })
  },

  // 选择单位
  selectUnit(e) {
    const unitIndex = parseInt(e.detail.value)
    this.setData({ 'newItem.unitIndex': unitIndex })
  },

  // 选择过期日期
  selectExpireDate(e) {
    const date = e.detail.value
    this.setData({ 'newItem.expireDate': date })
  },

  // 确认添加物品
  async confirmAddItem() {
    const { newItem, unitOptions } = this.data
    
    // 验证必填项
    if (!newItem.name || !newItem.quantity) {
      wx.showToast({ title: '请填写物品名称和数量', icon: 'none' })
      return
    }
    
    wx.showLoading({ title: '添加中...', mask: true })
    
    try {
      // 构造新库存项
      const item = {
        name: newItem.name,
        aliases: newItem.aliases ? newItem.aliases.split(',').map(s => s.trim()) : [],
        quantity: parseFloat(newItem.quantity),
        unit: unitOptions[newItem.unitIndex],
        category: 'other', // 默认分类，实际应智能识别
        expireDate: newItem.expireDate,
        status: 'sufficient',
        statusText: '充足',
        confidence: 100,
        recentChanges: [
          { 
            date: formatDateYMD(new Date()).slice(5), 
            action: '入库', 
            quantity: parseFloat(newItem.quantity), 
            unit: unitOptions[newItem.unitIndex] 
          }
        ]
      }
      
      // 添加到库存
      const inventory = [...this.data.inventory, item]
      this.setData({ inventory }, () => {
        this.updateStatistics()
        this.filterInventory()
        this.closeAddModal()
      })
      
      wx.showToast({ title: '入库成功', icon: 'success' })
      
    } catch (e) {
      wx.showToast({ title: '添加失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  // 切换趋势周期
  changeTrendPeriod(e) {
    const period = e.currentTarget.dataset.period
    this.setData({ trendPeriod: period })
  },

  // 刷新数据
  refreshData() {
    this.loadInventoryData()
    this.checkConservativeAlerts()
  }
})