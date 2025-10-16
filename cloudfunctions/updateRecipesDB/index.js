// ==========================================
// 在云开发控制台 -> 云函数 -> 新建临时函数执行
// 或者在数据库控制台的"高级操作"里执行
// ==========================================

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ==========================================
// 步骤1：标记洋气菜（基于origin_region）
// ==========================================

async function markFancyDishes() {
  console.log('开始标记洋气菜...')
  
  // 洋气菜系列表
  const fancyCuisines = [
    '日本料理', '日料', '日式',
    '西餐', '法餐', '意式', '意大利',
    '韩式', '韩餐',
    '东南亚', '泰式', '越南',
    '融合菜', '创意菜'
  ]
  
  // 更新 origin_region 匹配的菜品
  for (const cuisine of fancyCuisines) {
    const result = await db.collection('recipes')
      .where({
        origin_region: db.RegExp({
          regexp: cuisine,
          options: 'i'
        })
      })
      .update({
        data: {
          style_tags: _.addToSet('洋气')
        }
      })
    
    console.log(`${cuisine}: 更新了 ${result.stats.updated} 条`)
  }
  
  // 基于菜名的补充标记（三文鱼、牛排等）
  const fancyKeywords = [
    '三文鱼', '刺身', '寿司', '天妇罗',
    '牛排', '意面', '披萨', '芝士',
    '鹅肝', '松露', '鱼子酱',
    '泡菜', '石锅拌饭', '部队锅',
    '咖喱', '冬阴功', '越南卷'
  ]
  
  for (const keyword of fancyKeywords) {
    const result = await db.collection('recipes')
      .where({
        name: db.RegExp({
          regexp: keyword,
          options: 'i'
        })
      })
      .update({
        data: {
          style_tags: _.addToSet('洋气')
        }
      })
    
    console.log(`关键词"${keyword}": 更新了 ${result.stats.updated} 条`)
  }
  
  console.log('✅ 洋气菜标记完成')
}

// ==========================================
// 步骤2：标记荤素（如果数据库没有is_vegan字段）
// ==========================================

async function markVeganStatus() {
  console.log('开始标记荤素...')
  
  // 标记素菜
  const veganKeywords = ['素', '豆腐', '茄子', '西兰花', '菠菜', '芹菜', '白菜']
  
  for (const keyword of veganKeywords) {
    await db.collection('recipes')
      .where({
        name: db.RegExp({
          regexp: keyword,
          options: 'i'
        }),
        is_vegan: _.neq(false) // 避免覆盖已标记的
      })
      .update({
        data: {
          is_vegan: true
        }
      })
  }
  
  // 标记荤菜
  const meatKeywords = ['鸡', '鸭', '鱼', '虾', '蟹', '牛', '猪', '羊', '肉']
  
  for (const keyword of meatKeywords) {
    await db.collection('recipes')
      .where({
        name: db.RegExp({
          regexp: keyword,
          options: 'i'
        }),
        is_vegan: _.neq(true) // 避免覆盖已标记的
      })
      .update({
        data: {
          is_vegan: false
        }
      })
  }
  
  console.log('✅ 荤素标记完成')
}

// ==========================================
// 步骤3：统一type字段（主菜/配菜/汤品）
// ==========================================

async function normalizeType() {
  console.log('开始统一菜品类型...')
  
  // 配菜标记
  await db.collection('recipes')
    .where({
      type: _.in(['配菜', '凉菜', '小菜'])
    })
    .update({
      data: {
        type: '配菜'
      }
    })
  
  // 汤品标记
  await db.collection('recipes')
    .where({
      _: _.or([
        { type: _.in(['汤', '汤品', '羹']) },
        { 
          name: db.RegExp({
            regexp: '汤|羹',
            options: 'i'
          })
        }
      ])
    })
    .update({
      data: {
        type: '汤品'
      }
    })
  
  // 主菜标记（剩余的都是主菜）
  await db.collection('recipes')
    .where({
      type: _.nin(['配菜', '汤品', '主食'])
    })
    .update({
      data: {
        type: '主菜'
      }
    })
  
  console.log('✅ 菜品类型统一完成')
}

// ==========================================
// 主函数：执行所有步骤
// ==========================================

exports.main = async (event, context) => {
  try {
    await markFancyDishes()
    await markVeganStatus()
    await normalizeType()
    
    // 验证结果
    const stats = await db.collection('recipes').where({
      style_tags: _.in(['洋气'])
    }).count()
    
    console.log(`\n====== 更新完成 ======`)
    console.log(`洋气菜总数: ${stats.total}`)
    
    return {
      success: true,
      fancyCount: stats.total,
      message: '数据库字段补齐完成'
    }
    
  } catch (e) {
    console.error('执行失败:', e)
    return {
      success: false,
      error: e.message
    }
  }
}