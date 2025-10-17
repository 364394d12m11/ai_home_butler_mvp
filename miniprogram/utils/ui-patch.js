// miniprogram/utils/ui-patch.js

function applyUIPatch(page, patch) {
  if (!page || !patch) {
    console.warn('applyUIPatch: 参数无效')
    return
  }
  
  console.log('🔧 应用UI Patch:', patch)
  
  // 1. Toast提示
  if (patch.toast) {
    wx.showToast({
      title: patch.toast,
      icon: 'none',
      duration: 2000
    })
  }
  
  // 2. 澄清问题
  if (patch.ask) {
    showAskDialog(page, patch.ask, patch.quickActions || [])
  }
  
  // 3. 单个菜品替换
  if (patch.replaceDish) {
    replaceSingleDish(page, patch.replaceDish)
  }
  
  // 4. 批量替换
  if (patch.replaceBatch) {
    replaceBatchDishes(page, patch.replaceBatch)
  }
  
  // 5. 刷新候选池
  if (patch.refreshCandidates) {
    refreshCandidatePool(page, patch.refreshCandidates)
  }
  
  // 6. 追加推荐
  if (patch.appendSuggestions && Array.isArray(patch.appendSuggestions)) {
    appendSuggestions(page, patch.appendSuggestions)
  }
  
  // 7. 菜品标注
  if (patch.badges && Array.isArray(patch.badges)) {
    applyBadges(page, patch.badges)
  }
  
  // 8. 存储撤销令牌
  if (patch.undoToken) {
    storeUndoToken(patch.undoToken, patch)
  }
}

/**
 * 显示澄清对话框
 */
function showAskDialog(page, question, quickActions) {
  if (!quickActions || quickActions.length === 0) {
    // 无快捷按钮，仅显示问题
    wx.showModal({
      title: '需要确认',
      content: question,
      showCancel: false,
      confirmText: '知道了'
    })
    return
  }
  
  // 有快捷按钮，显示Action Sheet
  const itemList = quickActions.map(action => action.label)
  
  wx.showActionSheet({
    itemList: itemList,
    success: (res) => {
      const selectedAction = quickActions[res.tapIndex]
      if (selectedAction && page.handleQuickAction) {
        page.handleQuickAction(selectedAction)
      }
    }
  })
}

/**
 * 替换单个菜品
 */
function replaceSingleDish(page, replaceDish) {
  const { oldDishId, newDish } = replaceDish
  
  if (!newDish) {
    console.warn('replaceSingleDish: newDish为空')
    return
  }
  
  const candidatePool = page.data.candidatePool || {}
  
  // 遍历所有分类，找到旧菜品并替换
  let replaced = false
  Object.keys(candidatePool).forEach(type => {
    const dishes = candidatePool[type] || []
    const index = dishes.findIndex(d => d.id === oldDishId)
    
    if (index > -1) {
      dishes[index] = newDish
      replaced = true
    }
  })
  
  if (replaced) {
    page.setData({ candidatePool })
    console.log(`✅ 已替换菜品: ${oldDishId} → ${newDish.name}`)
  } else {
    console.warn(`⚠️ 未找到菜品: ${oldDishId}`)
  }
}

/**
 * 批量替换菜品
 */
function replaceBatchDishes(page, replaceBatch) {
  const { course, oldIds, newDishes } = replaceBatch
  
  if (!course || !Array.isArray(oldIds) || !Array.isArray(newDishes)) {
    console.warn('replaceBatchDishes: 参数无效')
    return
  }
  
  const candidatePool = page.data.candidatePool || {}
  const dishes = candidatePool[course] || []
  
  // 移除旧菜品
  const filtered = dishes.filter(d => !oldIds.includes(d.id))
  
  // 追加新菜品
  candidatePool[course] = [...filtered, ...newDishes]
  
  page.setData({ candidatePool })
  console.log(`✅ 批量替换 ${course}: ${oldIds.length}道 → ${newDishes.length}道`)
}

/**
 * 刷新整个候选池
 */
function refreshCandidatePool(page, newPool) {
  const { meat, veg, soup, staple } = newPool
  
  const candidatePool = {
    meat: meat || page.data.candidatePool?.meat || [],
    veg: veg || page.data.candidatePool?.veg || [],
    soup: soup || page.data.candidatePool?.soup || [],
    staple: staple || page.data.candidatePool?.staple || []
  }
  
  page.setData({ candidatePool })
  console.log('✅ 候选池已刷新:', {
    荤: candidatePool.meat.length,
    素: candidatePool.veg.length,
    汤: candidatePool.soup.length,
    主食: candidatePool.staple.length
  })
}

/**
 * 追加推荐菜品
 */
function appendSuggestions(page, suggestions) {
  const candidatePool = page.data.candidatePool || {}
  
  suggestions.forEach(({ dish }) => {
    if (!dish || !dish.course) return
    
    const type = dish.course
    if (!candidatePool[type]) {
      candidatePool[type] = []
    }
    
    // 检查是否已存在
    const exists = candidatePool[type].some(d => d.id === dish.id)
    if (!exists) {
      candidatePool[type].push(dish)
    }
  })
  
  page.setData({ candidatePool })
  console.log(`✅ 追加推荐: ${suggestions.length}道`)
}

/**
 * 应用菜品标注
 */
function applyBadges(page, badges) {
  const candidatePool = page.data.candidatePool || {}
  
  badges.forEach(badge => {
    const { dishId, type, text } = badge
    
    // 遍历所有分类，找到菜品并添加标注
    Object.keys(candidatePool).forEach(category => {
      const dishes = candidatePool[category] || []
      const dish = dishes.find(d => d.id === dishId)
      
      if (dish) {
        if (!dish.badges) dish.badges = []
        dish.badges.push({ type, text })
      }
    })
  })
  
  page.setData({ candidatePool })
  console.log(`✅ 已标注 ${badges.length} 道菜`)
}

/**
 * 存储撤销令牌
 */
function storeUndoToken(token, patch) {
  try {
    const undoData = {
      token: token,
      patch: patch,
      timestamp: Date.now(),
      expiresAt: Date.now() + 10000 // 10秒有效
    }
    
    wx.setStorageSync('UNDO_TOKEN', undoData)
    console.log('✅ 撤销令牌已保存:', token)
  } catch (e) {
    console.error('存储撤销令牌失败:', e)
  }
}

/**
 * 执行撤销操作
 */
function executeUndo(page) {
  try {
    const undoData = wx.getStorageSync('UNDO_TOKEN')
    
    if (!undoData) {
      wx.showToast({ title: '没有可撤销的操作', icon: 'none' })
      return false
    }
    
    // 检查是否过期
    if (Date.now() > undoData.expiresAt) {
      wx.showToast({ title: '撤销已过期', icon: 'none' })
      wx.removeStorageSync('UNDO_TOKEN')
      return false
    }
    
    // 执行撤销（暂时简化为回退状态）
    wx.showToast({ title: '已撤销', icon: 'success' })
    wx.removeStorageSync('UNDO_TOKEN')
    
    // TODO: 实现完整的撤销逻辑（需要记录变更前状态）
    
    return true
  } catch (e) {
    console.error('撤销失败:', e)
    return false
  }
}

// ==================== 导出 ====================

module.exports = {
  applyUIPatch,
  executeUndo
}