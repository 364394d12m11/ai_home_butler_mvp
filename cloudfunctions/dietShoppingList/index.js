// cloudfunctions/dietShoppingList/index.js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { action } = event
  const { OPENID } = cloud.getWXContext()
  
  try {
    switch (action) {
      case 'generateFromMenu':
        return await generateFromMenu(event, OPENID)
      case 'addItem':
        return await addItem(event, OPENID)
      case 'markBought':
        return await markBought(event, OPENID)
      case 'getActiveList':
        return await getActiveList(event, OPENID)
      case 'deleteItem':
        return await deleteItem(event, OPENID)
      default:
        return { success: false, error: '未知操作' }
    }
  } catch (error) {
    console.error('购物清单云函数错误:', error)
    return { success: false, error: error.message }
  }
}

// 从菜单生成购物清单
async function generateFromMenu(event, openid) {
  const { meals, mealParams, excludeItems = [] } = event
  
  try {
    // 收集所有食材
    const ingredientCounts = new Map()
    
    Object.values(meals).forEach(meal => {
      meal.dishes.forEach(dish => {
        dish.ingredients.forEach(ingredient => {
          if (ingredientCounts.has(ingredient)) {
            ingredientCounts.set(ingredient, ingredientCounts.get(ingredient) + 1)
          } else {
            ingredientCounts.set(ingredient, 1)
          }
        })
      })
    })
    
    // 获取用户库存
    const inventory = await getUserInventory(openid)
    
    // 生成购物项目
    const shoppingItems = []
    let totalEstimatedCost = 0
    
    for (const [ingredient, count] of ingredientCounts) {
      // 检查是否需要排除
      if (excludeItems.includes(ingredient)) continue
      
      // 检查库存是否充足
      const inventoryItem = inventory.find(item => 
        item.name === ingredient || item.aliases.includes(ingredient)
      )
      
      let needToBuy = true
      let reason = '菜谱所需'
      
      if (inventoryItem && inventoryItem.quantity > 0) {
        // 简单判断库存是否足够（实际应该更精确）
        const estimatedUsage = count * getUsagePerDish(ingredient)
        if (inventoryItem.quantity >= estimatedUsage) {
          needToBuy = false
        } else {
          reason = '库存不足'
        }
      }
      
      if (needToBuy) {
        const item = generateShoppingItem(ingredient, count, mealParams, reason)
        shoppingItems.push(item)
        totalEstimatedCost += item.estimatedPrice
      }
    }
    
    // 按类别分组
    const categorizedItems = categorizeShoppingItems(shoppingItems)
    
    // 保存到数据库
    const listData = {
      openid: openid,
      items: shoppingItems,
      categories: categorizedItems,
      totalItems: shoppingItems.length,
      totalEstimatedCost: totalEstimatedCost,
      status: 'active',
      source: 'menu_generation',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
    
    await db.collection('shopping_lists').add({
      data: listData
    })
    
    return {
      success: true,
      data: {
        items: shoppingItems,
        categories: categorizedItems,
        totalItems: shoppingItems.length,
        totalEstimatedCost: totalEstimatedCost
      }
    }
    
  } catch (error) {
    console.error('生成购物清单失败:', error)
    return { success: false, error: '生成失败' }
  }
}

// 添加购物项目
async function addItem(event, openid) {
  const { items, reason = 'manual_add' } = event
  
  try {
    // 获取当前活跃的购物清单
    const activeList = await getActiveShoppingList(openid)
    
    const newItems = items.map(item => ({
      id: generateItemId(),
      name: item.name,
      spec: item.spec || getDefaultSpec(item.name),
      category: item.category || getCategoryByName(item.name),
      estimatedPrice: item.price || estimatePrice(item.name),
      assignee: item.assignee || 'any',
      urgent: item.urgent || false,
      bought: false,
      reason: reason,
      addedAt: new Date()
    }))
    
    if (activeList) {
      // 更新现有清单
      const updatedItems = [...activeList.items, ...newItems]
      const updatedCategories = categorizeShoppingItems(updatedItems)
      
      await db.collection('shopping_lists')
        .doc(activeList._id)
        .update({
          data: {
            items: updatedItems,
            categories: updatedCategories,
            totalItems: updatedItems.length,
            totalEstimatedCost: updatedItems.reduce((sum, item) => sum + item.estimatedPrice, 0),
            updatedAt: db.serverDate()
          }
        })
    } else {
      // 创建新清单
      await db.collection('shopping_lists').add({
        data: {
          openid: openid,
          items: newItems,
          categories: categorizeShoppingItems(newItems),
          totalItems: newItems.length,
          totalEstimatedCost: newItems.reduce((sum, item) => sum + item.estimatedPrice, 0),
          status: 'active',
          source: 'manual_add',
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      })
    }
    
    return { success: true, data: { addedItems: newItems } }
    
  } catch (error) {
    console.error('添加购物项目失败:', error)
    return { success: false, error: '添加失败' }
  }
}

// 标记已购买
async function markBought(event, openid) {
  const { itemId, boughtBy = 'unknown', actualPrice } = event
  
  try {
    const activeList = await getActiveShoppingList(openid)
    
    if (!activeList) {
      return { success: false, error: '没有找到活跃的购物清单' }
    }
    
    const updatedItems = activeList.items.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          bought: true,
          boughtBy: boughtBy,
          boughtAt: new Date(),
          actualPrice: actualPrice || item.estimatedPrice
        }
      }
      return item
    })
    
    const boughtCount = updatedItems.filter(item => item.bought).length
    const progress = Math.round((boughtCount / updatedItems.length) * 100)
    
    await db.collection('shopping_lists')
      .doc(activeList._id)
      .update({
        data: {
          items: updatedItems,
          boughtCount: boughtCount,
          progress: progress,
          updatedAt: db.serverDate()
        }
      })
    
    // 如果全部购买完成，自动更新库存
    if (progress === 100) {
      await updateInventoryFromShopping(openid, updatedItems)
    }
    
    return { 
      success: true, 
      data: { 
        progress: progress, 
        boughtCount: boughtCount,
        totalItems: updatedItems.length
      } 
    }
    
  } catch (error) {
    console.error('标记购买失败:', error)
    return { success: false, error: '标记失败' }
  }
}

// 获取活跃购物清单
async function getActiveList(event, openid) {
  try {
    const activeList = await getActiveShoppingList(openid)
    
    if (activeList) {
      return { success: true, data: activeList }
    } else {
      return { success: true, data: null, hasActiveList: false }
    }
    
  } catch (error) {
    console.error('获取购物清单失败:', error)
    return { success: false, error: '获取失败' }
  }
}

// 删除购物项目
async function deleteItem(event, openid) {
  const { itemId } = event
  
  try {
    const activeList = await getActiveShoppingList(openid)
    
    if (!activeList) {
      return { success: false, error: '没有找到活跃的购物清单' }
    }
    
    const updatedItems = activeList.items.filter(item => item.id !== itemId)
    const updatedCategories = categorizeShoppingItems(updatedItems)
    
    await db.collection('shopping_lists')
      .doc(activeList._id)
      .update({
        data: {
          items: updatedItems,
          categories: updatedCategories,
          totalItems: updatedItems.length,
          totalEstimatedCost: updatedItems.reduce((sum, item) => sum + item.estimatedPrice, 0),
          updatedAt: db.serverDate()
        }
      })
    
    return { success: true }
    
  } catch (error) {
    console.error('删除购物项目失败:', error)
    return { success: false, error: '删除失败' }
  }
}

// 辅助函数
async function getUserInventory(openid) {
  try {
    const result = await db.collection('inventory')
      .where({ openid: openid })
      .get()
    
    return result.data || []
  } catch (error) {
    console.error('获取库存失败:', error)
    return []
  }
}

async function getActiveShoppingList(openid) {
  try {
    const result = await db.collection('shopping_lists')
      .where({
        openid: openid,
        status: 'active'
      })
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get()
    
    return result.data.length > 0 ? result.data[0] : null
  } catch (error) {
    console.error('获取活跃购物清单失败:', error)
    return null
  }
}

function generateShoppingItem(ingredient, count, mealParams, reason) {
  const peopleCount = mealParams.adults + mealParams.kids * 0.6
  const spec = getDefaultSpec(ingredient)
  const category = getCategoryByName(ingredient)
  const estimatedPrice = estimatePrice(ingredient)
  
  return {
    id: generateItemId(),
    name: ingredient,
    spec: spec,
    category: category,
    estimatedPrice: estimatedPrice,
    quantity: Math.ceil(count * peopleCount),
    assignee: 'any',
    urgent: false,
    bought: false,
    reason: reason,
    addedAt: new Date()
  }
}

function categorizeShoppingItems(items) {
  const categories = {}
  
  items.forEach(item => {
    if (!categories[item.category]) {
      categories[item.category] = []
    }
    categories[item.category].push(item)
  })
  
  return Object.keys(categories).map(category => ({
    name: category,
    items: categories[category],
    count: categories[category].length
  }))
}

function generateItemId() {
  return 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
}

function getDefaultSpec(ingredient) {
  const specMap = {
    '西红柿': '500g', '土豆': '500g', '青椒': '300g', '西兰花': '400g',
    '鸡蛋': '10个', '鸡胸肉': '500g', '牛肉末': '300g',
    '面条': '500g', '大米': '5kg', '面粉': '2kg',
    '食用油': '1L', '生抽': '500ml', '醋': '500ml', '盐': '500g', '糖': '500g',
    '蒜': '1头', '葱': '1把', '香油': '250ml'
  }
  return specMap[ingredient] || '适量'
}

function getCategoryByName(ingredient) {
  const categoryMap = {
    '西红柿': '蔬菜', '土豆': '蔬菜', '青椒': '蔬菜', '西兰花': '蔬菜', '黄瓜': '蔬菜',
    '鸡蛋': '蛋奶', '牛奶': '蛋奶',
    '鸡胸肉': '肉类', '牛肉末': '肉类', '猪肉': '肉类',
    '大米': '粮油', '面条': '粮油', '面粉': '粮油', '食用油': '粮油',
    '生抽': '调料', '醋': '调料', '盐': '调料', '糖': '调料', '蒜': '调料', '葱': '调料', '香油': '调料'
  }
  return categoryMap[ingredient] || '其他'
}

function estimatePrice(ingredient) {
  const priceMap = {
    '西红柿': 8, '土豆': 6, '青椒': 10, '西兰花': 12, '黄瓜': 8,
    '鸡蛋': 15, '牛奶': 6,
    '鸡胸肉': 28, '牛肉末': 35, '猪肉': 25,
    '大米': 12, '面条': 8, '面粉': 6, '食用油': 25,
    '生抽': 12, '醋': 8, '盐': 3, '糖': 6, '蒜': 8, '葱': 5, '香油': 15
  }
  return priceMap[ingredient] || 10
}

function getUsagePerDish(ingredient) {
  // 简化的单菜用量估算（实际应该更精确）
  const usageMap = {
    '西红柿': 150, '土豆': 200, '青椒': 100, '西兰花': 150,
    '鸡蛋': 2, '鸡胸肉': 150, '牛肉末': 100,
    '食用油': 20, '生抽': 10, '盐': 3, '糖': 5
  }
  return usageMap[ingredient] || 50
}

async function updateInventoryFromShopping(openid, boughtItems) {
  // 简化的库存更新逻辑
  // 实际实现时应该更精确地处理规格换算和库存增量
  try {
    for (const item of boughtItems) {
      if (item.bought) {
        // 这里应该调用库存管理云函数来更新库存
        // 暂时跳过，等库存云函数实现后再完善
      }
    }
  } catch (error) {
    console.error('更新库存失败:', error)
  }
}