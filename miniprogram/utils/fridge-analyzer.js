// utils/fridge-analyzer.js
// V5.3-Plus 冰箱照识别 + 可做度分析

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

async function analyzeFridge(imageUrl, recipePool) {
  // 1. 调用图像识别API（腾讯云OCR + 物体识别）
  const ingredients = await recognizeIngredients(imageUrl)
  
  // 2. 遍历菜谱池，计算可做度
  const immediate = []     // 立刻可做（主料齐 + 辅料≥80%）
  const missing1or2 = []   // 差1-2样
  
  for (const recipe of recipePool) {
    const analysis = calculateFeasibility(recipe, ingredients)
    
    if (analysis.feasibility === 'immediate') {
      immediate.push({
        ...recipe,
        matchRate: analysis.matchRate,
        missingIngredients: []
      })
    } else if (analysis.feasibility === 'missing1or2') {
      missing1or2.push({
        ...recipe,
        matchRate: analysis.matchRate,
        missingIngredients: analysis.missing
      })
    }
  }
  
  // 3. 排序（匹配度从高到低）
  immediate.sort((a, b) => b.matchRate - a.matchRate)
  missing1or2.sort((a, b) => b.matchRate - a.matchRate)
  
  return {
    immediate: immediate.slice(0, 10),      // 最多返回10道
    missing1or2: missing1or2.slice(0, 10),
    recognizedIngredients: ingredients
  }
}

/**
 * 识别食材（模拟，实际接腾讯云API）
 */
async function recognizeIngredients(imageUrl) {
  // TODO: 调用腾讯云图像识别API
  // 返回示例数据
  return [
    { name: '西红柿', confidence: 0.95 },
    { name: '鸡蛋', confidence: 0.90 },
    { name: '土豆', confidence: 0.88 },
    { name: '白菜', confidence: 0.85 },
    { name: '大蒜', confidence: 0.80 }
  ]
}

/**
 * 计算菜品可做度
 */
function calculateFeasibility(recipe, ingredients) {
  const ingredientNames = ingredients.map(i => i.name)
  
  // 主料
  const mainIngredients = recipe.main_ingredients || []
  const mainMatched = mainIngredients.filter(ing => 
    ingredientNames.some(name => name.includes(ing) || ing.includes(name))
  )
  
  // 辅料
  const subIngredients = recipe.sub_ingredients || []
  const subMatched = subIngredients.filter(ing => 
    ingredientNames.some(name => name.includes(ing) || ing.includes(name))
  )
  
  const mainMatchRate = mainMatched.length / Math.max(mainIngredients.length, 1)
  const subMatchRate = subMatched.length / Math.max(subIngredients.length, 1)
  
  // 判断可做度
  if (mainMatchRate === 1 && subMatchRate >= 0.8) {
    return {
      feasibility: 'immediate',
      matchRate: (mainMatchRate + subMatchRate) / 2,
      missing: []
    }
  } else if (mainMatchRate >= 0.8) {
    const missing = [
      ...mainIngredients.filter(ing => !mainMatched.includes(ing)),
      ...subIngredients.filter(ing => !subMatched.includes(ing))
    ].slice(0, 2)
    
    if (missing.length <= 2) {
      return {
        feasibility: 'missing1or2',
        matchRate: (mainMatchRate + subMatchRate) / 2,
        missing
      }
    }
  }
  
  return {
    feasibility: 'not_feasible',
    matchRate: 0,
    missing: []
  }
}

module.exports = {
  analyzeFridge
}
