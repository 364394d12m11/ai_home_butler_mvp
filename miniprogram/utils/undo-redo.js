// utils/undo-redo.js
// V5.3-Plus 撤销/重做系统
// 规则：10s撤销 / 15min重做一次 / 同token幂等

const UNDO_TIMEOUT = 10000      // 10秒
const REDO_TIMEOUT = 900000     // 15分钟
const MAX_HISTORY_SIZE = 20     // 最多保留20条历史

class UndoRedoManager {
  constructor() {
    this.undoStack = []     // 撤销栈
    this.redoStack = []     // 重做栈
    this.tokenCache = new Set()  // 幂等性检查
  }
  
  /**
   * 记录一个可撤销的动作
   * @param {Object} action - 动作对象
   * @param {string} action.token - 唯一标识
   * @param {string} action.type - 动作类型
   * @param {Object} action.before - 动作前状态
   * @param {Object} action.after - 动作后状态
   * @param {number} action.timestamp - 时间戳
   */
  pushAction(action) {
    // 幂等性检查
    if (this.tokenCache.has(action.token)) {
      console.warn('⚠️ 重复token，已忽略:', action.token)
      return false
    }
    
    const now = Date.now()
    const actionWithMeta = {
      ...action,
      timestamp: action.timestamp || now,
      expiresAt: now + UNDO_TIMEOUT
    }
    
    // 加入撤销栈
    this.undoStack.push(actionWithMeta)
    this.tokenCache.add(action.token)
    
    // 清空重做栈（执行新动作后，之前的重做历史失效）
    this.redoStack = []
    
    // 限制栈大小
    if (this.undoStack.length > MAX_HISTORY_SIZE) {
      const removed = this.undoStack.shift()
      this.tokenCache.delete(removed.token)
    }
    
    console.log('✅ 动作已记录:', action.type, action.token)
    return true
  }
  
  /**
   * 撤销最近的动作
   * @returns {Object|null} 撤销的动作，如果无法撤销返回null
   */
  undo() {
    if (this.undoStack.length === 0) {
      wx.showToast({ title: '没有可撤销的操作', icon: 'none' })
      return null
    }
    
    const action = this.undoStack.pop()
    const now = Date.now()
    
    // 检查是否过期（10秒）
    if (now > action.expiresAt) {
      wx.showToast({ title: '撤销已过期', icon: 'none' })
      this.tokenCache.delete(action.token)
      return null
    }
    
    // 加入重做栈
    const redoAction = {
      ...action,
      redoExpiresAt: now + REDO_TIMEOUT // 15分钟重做期限
    }
    this.redoStack.push(redoAction)
    
    console.log('↩️ 已撤销:', action.type, action.token)
    
    return action
  }
  
  /**
   * 重做最近撤销的动作
   * @returns {Object|null} 重做的动作，如果无法重做返回null
   */
  redo() {
    if (this.redoStack.length === 0) {
      wx.showToast({ title: '没有可重做的操作', icon: 'none' })
      return null
    }
    
    const action = this.redoStack.pop()
    const now = Date.now()
    
    // 检查是否过期（15分钟）
    if (now > action.redoExpiresAt) {
      wx.showToast({ title: '重做已过期', icon: 'none' })
      this.tokenCache.delete(action.token)
      return null
    }
    
    // 检查幂等性（同token在15分钟内只能重做一次）
    if (this.hasRedoRecently(action.token)) {
      wx.showToast({ title: '该操作已重做过', icon: 'none' })
      return null
    }
    
    // 重新加入撤销栈
    const newAction = {
      ...action,
      timestamp: now,
      expiresAt: now + UNDO_TIMEOUT
    }
    this.undoStack.push(newAction)
    
    // 记录重做时间（用于幂等检查）
    this.markRedoTime(action.token)
    
    console.log('↪️ 已重做:', action.type, action.token)
    
    return action
  }
  
  /**
   * 检查是否可以撤销
   */
  canUndo() {
    if (this.undoStack.length === 0) return false
    
    const lastAction = this.undoStack[this.undoStack.length - 1]
    return Date.now() <= lastAction.expiresAt
  }
  
  /**
   * 检查是否可以重做
   */
  canRedo() {
    if (this.redoStack.length === 0) return false
    
    const lastAction = this.redoStack[this.redoStack.length - 1]
    return Date.now() <= lastAction.redoExpiresAt
  }
  
  /**
   * 获取最后一次可撤销的动作（不移除）
   */
  peekUndo() {
    return this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1] : null
  }
  
  /**
   * 获取最后一次可重做的动作（不移除）
   */
  peekRedo() {
    return this.redoStack.length > 0 ? this.redoStack[this.redoStack.length - 1] : null
  }
  
  /**
   * 清理过期的动作
   */
  cleanExpired() {
    const now = Date.now()
    
    // 清理撤销栈
    this.undoStack = this.undoStack.filter(action => now <= action.expiresAt)
    
    // 清理重做栈
    this.redoStack = this.redoStack.filter(action => now <= action.redoExpiresAt)
    
    console.log('🧹 已清理过期动作')
  }
  
  /**
   * 检查token是否最近已重做过
   */
  hasRedoRecently(token) {
    try {
      const redoTimes = wx.getStorageSync('REDO_TIMES') || {}
      const lastRedoTime = redoTimes[token]
      
      if (!lastRedoTime) return false
      
      // 15分钟内只能重做一次
      return (Date.now() - lastRedoTime) < REDO_TIMEOUT
    } catch (e) {
      return false
    }
  }
  
  /**
   * 标记token的重做时间
   */
  markRedoTime(token) {
    try {
      const redoTimes = wx.getStorageSync('REDO_TIMES') || {}
      redoTimes[token] = Date.now()
      
      // 只保留最近的50条记录
      const entries = Object.entries(redoTimes)
      if (entries.length > 50) {
        entries.sort((a, b) => b[1] - a[1])
        const recent = Object.fromEntries(entries.slice(0, 50))
        wx.setStorageSync('REDO_TIMES', recent)
      } else {
        wx.setStorageSync('REDO_TIMES', redoTimes)
      }
    } catch (e) {
      console.error('记录重做时间失败:', e)
    }
  }
  
  /**
   * 清空所有历史
   */
  clear() {
    this.undoStack = []
    this.redoStack = []
    this.tokenCache.clear()
    try {
      wx.removeStorageSync('REDO_TIMES')
    } catch (e) {
      console.error('清空失败:', e)
    }
  }
  
  /**
   * 获取当前状态（用于调试）
   */
  getState() {
    return {
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
      lastUndo: this.peekUndo(),
      lastRedo: this.peekRedo()
    }
  }
}

// 导出单例
const undoRedoManager = new UndoRedoManager()

/**
 * 应用撤销/重做到页面
 * @param {Object} page - 小程序Page实例
 * @param {Object} action - 动作对象
 * @param {string} operation - 'undo' | 'redo'
 */
function applyUndoRedo(page, action, operation) {
  if (!page || !action) return
  
  const targetState = operation === 'undo' ? action.before : action.after
  
  switch (action.type) {
    case 'replaceDish':
      // 恢复单个菜品
      restoreDish(page, targetState)
      break
    
    case 'replaceBatch':
      // 恢复批量菜品
      restoreBatch(page, targetState)
      break
    
    case 'addConstraint':
      // 恢复约束
      restoreConstraints(page, targetState)
      break
    
    case 'updateSelection':
      // 恢复选中状态
      restoreSelection(page, targetState)
      break
    
    default:
      console.warn('未知动作类型:', action.type)
  }
  
  wx.showToast({
    title: operation === 'undo' ? '已撤销' : '已重做',
    icon: 'success'
  })
}

function restoreDish(page, state) {
  const { candidatePool } = state
  page.setData({ candidatePool })
}

function restoreBatch(page, state) {
  const { candidatePool } = state
  page.setData({ candidatePool })
}

function restoreConstraints(page, state) {
  const { constraints } = state
  page.setData({ constraints })
}

function restoreSelection(page, state) {
  const { selectedDishes } = state
  page.setData({ selectedDishes })
}

module.exports = {
  undoRedoManager,
  applyUndoRedo,
  UNDO_TIMEOUT,
  REDO_TIMEOUT
}
