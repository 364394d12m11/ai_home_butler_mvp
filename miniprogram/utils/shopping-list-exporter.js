// utils/shopping-list-exporter.js
// V5.3-Plus 购物清单导出（1080×1920图片 + 文本）

/**
 * 生成购物清单
 * @param {Array} selectedDishes - 已选菜品列表
 * @returns {Object} { items: [], grouped: {} }
 */
function generateShoppingList(selectedDishes) {
  const items = []
  const grouped = {}
  
  // 1. 收集所有食材
  selectedDishes.forEach(dish => {
    const ingredients = [
      ...(dish.main_ingredients || []),
      ...(dish.sub_ingredients || [])
    ]
    
    ingredients.forEach(ing => {
      // 解析食材（名称 + 用量）
      const parsed = parseIngredient(ing)
      
      // 合并相同食材
      const existing = items.find(item => item.name === parsed.name)
      if (existing) {
        existing.quantity += parsed.quantity
        existing.dishes.push(dish.name)
      } else {
        items.push({
          name: parsed.name,
          quantity: parsed.quantity,
          unit: parsed.unit,
          dishes: [dish.name],
          category: getCategoryByName(parsed.name)
        })
      }
    })
  })
  
  // 2. 分类分组
  items.forEach(item => {
    const category = item.category
    if (!grouped[category]) {
      grouped[category] = []
    }
    grouped[category].push(item)
  })
  
  return { items, grouped }
}

/**
 * 解析食材字符串
 */
function parseIngredient(ingredient) {
  // 示例：'猪肉 200g' → { name: '猪肉', quantity: 200, unit: 'g' }
  const match = ingredient.match(/([^\d]+)\s*(\d+\.?\d*)?(\w+)?/)
  
  return {
    name: match ? match[1].trim() : ingredient,
    quantity: match && match[2] ? parseFloat(match[2]) : 0,
    unit: match && match[3] ? match[3] : '适量'
  }
}

/**
 * 获取食材分类
 */
function getCategoryByName(name) {
  const categories = {
    '肉类': ['猪肉', '牛肉', '鸡肉', '鸭肉', '鱼', '虾'],
    '蔬菜': ['白菜', '土豆', '西红柿', '黄瓜', '茄子', '青椒'],
    '调料': ['盐', '酱油', '醋', '糖', '油', '蒜', '姜', '葱'],
    '主食': ['米', '面', '馒头', '面条']
  }
  
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => name.includes(kw))) {
      return category
    }
  }
  
  return '其他'
}

/**
 * 导出为文本
 */
function exportAsText(shoppingList) {
  const { grouped } = shoppingList
  
  let text = '📝 购物清单\n\n'
  
  Object.entries(grouped).forEach(([category, items]) => {
    text += `【${category}】\n`
    items.forEach(item => {
      const quantity = item.quantity > 0 
        ? `${item.quantity}${item.unit}` 
        : '适量'
      text += `  ☐ ${item.name} ${quantity}\n`
    })
    text += '\n'
  })
  
  text += `生成时间：${new Date().toLocaleString()}\n`
  text += '小橙子智能菜单\n'
  
  return text
}

/**
 * 导出为1080×1920图片
 */
async function exportAsImage(shoppingList, userInfo) {
  const { grouped } = shoppingList
  const canvas = wx.createOffscreenCanvas({
    type: '2d',
    width: 1080,
    height: 1920
  })
  
  const ctx = canvas.getContext('2d')
  
  // 1. 背景渐变
  const gradient = ctx.createLinearGradient(0, 0, 0, 1920)
  gradient.addColorStop(0, '#667eea')
  gradient.addColorStop(1, '#764ba2')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 1080, 1920)
  
  // 2. 标题
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 80px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('📝 购物清单', 540, 150)
  
  // 3. 日期
  ctx.font = '40px sans-serif'
  ctx.fillText(new Date().toLocaleDateString(), 540, 220)
  
  // 4. 列表内容
  let y = 350
  ctx.textAlign = 'left'
  
  Object.entries(grouped).forEach(([category, items]) => {
    // 分类标题
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 50px sans-serif'
    ctx.fillText(`【${category}】`, 100, y)
    y += 70
    
    // 食材列表
    ctx.font = '40px sans-serif'
    items.forEach(item => {
      const quantity = item.quantity > 0 
        ? `${item.quantity}${item.unit}` 
        : '适量'
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.fillText(`☐ ${item.name}`, 120, y)
      ctx.fillText(quantity, 800, y)
      y += 60
      
      if (y > 1700) return // 防止溢出
    })
    
    y += 40
  })
  
  // 5. 底部信息
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
  ctx.font = '35px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('小橙子智能菜单', 540, 1850)
  
  // 6. 导出为临时文件
  const tempFilePath = `${wx.env.USER_DATA_PATH}/shopping_list_${Date.now()}.png`
  await canvas.toTempFilePath({
    fileType: 'png',
    quality: 1,
    destPath: tempFilePath
  })
  
  return tempFilePath
}

/**
 * 分享购物清单
 */
async function shareShoppingList(shoppingList, format = 'both') {
  const exports = {}
  
  // 1. 文本
  if (format === 'text' || format === 'both') {
    exports.text = exportAsText(shoppingList)
    
    // 复制到剪贴板
    wx.setClipboardData({
      data: exports.text,
      success: () => {
        wx.showToast({
          title: '文本已复制',
          icon: 'success'
        })
      }
    })
  }
  
  // 2. 图片
  if (format === 'image' || format === 'both') {
    wx.showLoading({ title: '生成中...' })
    
    try {
      exports.imagePath = await exportAsImage(shoppingList, {})
      
      wx.hideLoading()
      
      // 保存到相册
      wx.saveImageToPhotosAlbum({
        filePath: exports.imagePath,
        success: () => {
          wx.showToast({
            title: '已保存到相册',
            icon: 'success'
          })
        },
        fail: (err) => {
          if (err.errMsg.includes('auth deny')) {
            wx.showModal({
              title: '需要相册权限',
              content: '请在设置中开启相册权限',
              confirmText: '去设置',
              success: (res) => {
                if (res.confirm) {
                  wx.openSetting()
                }
              }
            })
          }
        }
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({
        title: '生成失败',
        icon: 'none'
      })
      console.error('导出图片失败:', e)
    }
  }
  
  return exports
}

module.exports = {
  generateShoppingList,
  exportAsText,
  exportAsImage,
  shareShoppingList
}
