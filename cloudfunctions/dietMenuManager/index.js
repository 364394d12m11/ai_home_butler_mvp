// cloudfunctions/dietMenuManager/index.js - 修复版本
const cloud = require('wx-server-sdk')

// 添加 polyfill 以兼容旧环境
if (!Object.values) {
  Object.values = function(obj) {
    var values = []
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        values.push(obj[key])
      }
    }
    return values
  }
}

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { action } = event
  const { OPENID } = cloud.getWXContext()
  
  try {
    switch (action) {
      case 'saveTodayMenu':
        return await saveTodayMenu(event, OPENID)
      case 'getTodayMenu':
        return await getTodayMenu(event, OPENID)
      case 'saveCustomizedMenu':
        return await saveCustomizedMenu(event, OPENID)
      case 'getMenuHistory':
        return await getMenuHistory(event, OPENID)
      default:
        return { success: false, error: '未知操作' }
    }
  } catch (error) {
    console.error('菜单管理云函数错误:', error)
    return { success: false, error: error.message }
  }
}

// 保存今日菜单
async function saveTodayMenu(event, openid) {
  const { menuData } = event
  const today = new Date().toISOString().split('T')[0]
  
  try {
    // 检查今日是否已有菜单
    const existing = await db.collection('meal_plans')
      .where({
        openid: openid,
        date: today
      })
      .get()
    
    const planData = {
      openid: openid,
      date: today,
      meals: menuData.meals,
      totalCost: menuData.totalCost || 0,
      tasteMatch: menuData.tasteMatch || 85,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
      status: 'active'
    }
    
    if (existing.data.length > 0) {
      // 更新现有菜单
      await db.collection('meal_plans')
        .doc(existing.data[0]._id)
        .update({
          data: {
            meals: planData.meals,
            totalCost: planData.totalCost,
            tasteMatch: planData.tasteMatch,
            updatedAt: db.serverDate(),
            status: planData.status
          }
        })
    } else {
      // 创建新菜单
      await db.collection('meal_plans').add({
        data: planData
      })
    }
    
    return { success: true, data: planData }
    
  } catch (error) {
    console.error('保存菜单失败:', error)
    return { success: false, error: '保存失败' }
  }
}

// 获取今日菜单
async function getTodayMenu(event, openid) {
  const today = new Date().toISOString().split('T')[0]
  
  try {
    const result = await db.collection('meal_plans')
      .where({
        openid: openid,
        date: today
      })
      .orderBy('updatedAt', 'desc')
      .limit(1)
      .get()
    
    if (result.data.length > 0) {
      return { 
        success: true, 
        data: result.data[0],
        hasMenu: true
      }
    } else {
      return { 
        success: true, 
        data: null,
        hasMenu: false
      }
    }
    
  } catch (error) {
    console.error('获取今日菜单失败:', error)
    return { success: false, error: '获取失败' }
  }
}

// 保存定制菜单
async function saveCustomizedMenu(event, openid) {
  const { menuData, targetDate } = event
  
  try {
    // 检查目标日期是否已有菜单
    const existing = await db.collection('meal_plans')
      .where({
        openid: openid,
        date: targetDate
      })
      .get()
    
    const planData = {
      openid: openid,
      date: targetDate,
      meals: menuData.meals,
      mealParams: menuData.mealParams,
      totalCost: menuData.totalCost || 0,
      estimatedCost: menuData.estimatedCost || 0,
      customized: true,
      source: 'wizard',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
      status: 'planned'
    }
    
    if (existing.data.length > 0) {
      // 更新现有计划
      await db.collection('meal_plans')
        .doc(existing.data[0]._id)
        .update({
          data: planData
        })
    } else {
      // 创建新计划
      await db.collection('meal_plans').add({
        data: planData
      })
    }
    
    return { success: true, data: planData }
    
  } catch (error) {
    console.error('保存定制菜单失败:', error)
    return { success: false, error: '保存失败' }
  }
}

// 获取菜单历史
async function getMenuHistory(event, openid) {
  const { limit = 10, skip = 0 } = event
  
  try {
    const result = await db.collection('meal_plans')
      .where({
        openid: openid
      })
      .orderBy('date', 'desc')
      .skip(skip)
      .limit(limit)
      .get()
    
    return {
      success: true,
      data: {
        history: result.data,
        total: result.data.length
      }
    }
    
  } catch (error) {
    console.error('获取菜单历史失败:', error)
    return { success: false, error: '获取失败' }
  }
}