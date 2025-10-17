
function saveMenu(menuId, menu) {
  try {
    const menuData = {
      id: menuId,
      dishes: menu.dishes,
      candidatePool: menu.candidatePool,
      selectedDishes: menu.selectedDishes,
      timestamp: Date.now(),
      version: '5.3'
    }
    
    wx.setStorageSync(`MENU_${menuId}`, menuData)
    
    // 更新菜单索引
    const index = wx.getStorageSync('MENU_INDEX') || []
    if (!index.includes(menuId)) {
      index.push(menuId)
      wx.setStorageSync('MENU_INDEX', index.slice(-20)) // 只保留最近20个
    }
    
    console.log('✅ 菜单已保存:', menuId)
    return true
  } catch (e) {
    console.error('保存菜单失败:', e)
    return false
  }
}

/**
 * 加载菜单
 */
function loadMenu(menuId) {
  try {
    const menuData = wx.getStorageSync(`MENU_${menuId}`)
    
    if (!menuData) {
      console.warn('菜单不存在:', menuId)
      return null
    }
    
    // 检查版本兼容性
    if (menuData.version !== '5.3') {
      console.warn('菜单版本不兼容:', menuData.version)
      return null
    }
    
    console.log('✅ 菜单已加载:', menuId)
    return menuData
  } catch (e) {
    console.error('加载菜单失败:', e)
    return null
  }
}

/**
 * 删除菜单
 */
function deleteMenu(menuId) {
  try {
    wx.removeStorageSync(`MENU_${menuId}`)
    
    // 更新索引
    const index = wx.getStorageSync('MENU_INDEX') || []
    const newIndex = index.filter(id => id !== menuId)
    wx.setStorageSync('MENU_INDEX', newIndex)
    
    console.log('✅ 菜单已删除:', menuId)
    return true
  } catch (e) {
    console.error('删除菜单失败:', e)
    return false
  }
}

/**
 * 获取所有菜单列表
 */
function getAllMenus() {
  try {
    const index = wx.getStorageSync('MENU_INDEX') || []
    const menus = []
    
    for (const menuId of index) {
      const menu = loadMenu(menuId)
      if (menu) {
        menus.push({
          id: menuId,
          dishCount: menu.selectedDishes?.length || 0,
          timestamp: menu.timestamp
        })
      }
    }
    
    return menus.sort((a, b) => b.timestamp - a.timestamp)
  } catch (e) {
    console.error('获取菜单列表失败:', e)
    return []
  }
}

/**
 * 保存购物清单
 */
function saveShoppingList(listId, list) {
  try {
    const listData = {
      id: listId,
      items: list.items,
      grouped: list.grouped,
      timestamp: Date.now()
    }
    
    wx.setStorageSync(`LIST_${listId}`, listData)
    
    console.log('✅ 购物清单已保存:', listId)
    return true
  } catch (e) {
    console.error('保存购物清单失败:', e)
    return false
  }
}

/**
 * 加载购物清单
 */
function loadShoppingList(listId) {
  try {
    const listData = wx.getStorageSync(`LIST_${listId}`)
    
    if (!listData) {
      console.warn('购物清单不存在:', listId)
      return null
    }
    
    console.log('✅ 购物清单已加载:', listId)
    return listData
  } catch (e) {
    console.error('加载购物清单失败:', e)
    return null
  }
}

/**
 * 清理过期数据（超过30天）
 */
function cleanExpiredData() {
  try {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)
    
    // 清理菜单
    const menuIndex = wx.getStorageSync('MENU_INDEX') || []
    const validMenus = []
    
    for (const menuId of menuIndex) {
      const menu = loadMenu(menuId)
      if (menu && menu.timestamp > thirtyDaysAgo) {
        validMenus.push(menuId)
      } else {
        deleteMenu(menuId)
      }
    }
    
    wx.setStorageSync('MENU_INDEX', validMenus)
    
    console.log('🧹 已清理过期数据')
  } catch (e) {
    console.error('清理失败:', e)
  }
}

module.exports = {
  saveMenu,
  loadMenu,
  deleteMenu,
  getAllMenus,
  saveShoppingList,
  loadShoppingList,
  cleanExpiredData
}
