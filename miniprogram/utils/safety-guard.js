// ==================== 安全硬拦 ====================

// utils/safety-guard.js
// V5.3-Plus 安全/隐私与硬拦

/**
 * 安全守卫：过敏/婴幼儿/食安检查
 */
class SafetyGuard {
  /**
   * 检查菜品是否安全
   * @param {Object} dish - 菜品
   * @param {Object} userProfile - 用户画像
   * @returns {Object} { safe: boolean, reason: string, alternatives: [] }
   */
  checkSafety(dish, userProfile) {
    const { allergies = [], family_members = [] } = userProfile
    
    // 1. 过敏原检查
    const allergyCheck = this.checkAllergies(dish, allergies)
    if (!allergyCheck.safe) {
      return {
        safe: false,
        reason: allergyCheck.reason,
        alternatives: this.findAlternatives(dish, 'allergy')
      }
    }
    
    // 2. 婴幼儿不适检查
    const infantCheck = this.checkInfantSafety(dish, family_members)
    if (!infantCheck.safe) {
      return {
        safe: false,
        reason: infantCheck.reason,
        alternatives: this.findAlternatives(dish, 'infant')
      }
    }
    
    // 3. 食品安全检查
    const foodSafetyCheck = this.checkFoodSafety(dish)
    if (!foodSafetyCheck.safe) {
      return {
        safe: false,
        reason: foodSafetyCheck.reason,
        alternatives: this.findAlternatives(dish, 'food_safety')
      }
    }
    
    return { safe: true }
  }
  
  /**
   * 过敏原检查
   */
  checkAllergies(dish, allergies) {
    const dishIngredients = [
      ...(dish.main_ingredients || []),
      ...(dish.sub_ingredients || [])
    ]
    
    for (const allergy of allergies) {
      if (dishIngredients.some(ing => ing.includes(allergy))) {
        return {
          safe: false,
          reason: `含有过敏原：${allergy}`
        }
      }
    }
    
    return { safe: true }
  }
  
  /**
   * 婴幼儿安全检查
   */
  checkInfantSafety(dish, familyMembers) {
    const hasInfant = familyMembers.some(m => m.age < 3)
    if (!hasInfant) return { safe: true }
    
    // 婴幼儿禁忌食材
    const infantForbidden = ['蜂蜜', '生鸡蛋', '未煮熟', '辛辣', '坚果']
    
    const dishContent = dish.name + (dish.tags || []).join('')
    
    for (const forbidden of infantForbidden) {
      if (dishContent.includes(forbidden)) {
        return {
          safe: false,
          reason: `不适合3岁以下婴幼儿：${forbidden}`
        }
      }
    }
    
    return { safe: true }
  }
  
  /**
   * 食品安全检查
   */
  checkFoodSafety(dish) {
    // 高危食材（生食、易腐烂等）
    const riskyKeywords = ['生鱼片', '生蚝', '醉虾', '醉蟹', '生肉']
    
    const dishContent = dish.name + (dish.tags || []).join('')
    
    for (const risky of riskyKeywords) {
      if (dishContent.includes(risky)) {
        return {
          safe: false,
          reason: `食品安全风险：${risky}（建议充分加热）`
        }
      }
    }
    
    return { safe: true }
  }
  
  /**
   * 查找替代菜品
   */
  findAlternatives(dish, reason) {
    // 简化版：返回同类型的安全菜品
    const alternatives = []
    
    switch (reason) {
      case 'allergy':
        alternatives.push({ name: '清蒸鲈鱼', reason: '无过敏原' })
        break
      case 'infant':
        alternatives.push({ name: '蔬菜粥', reason: '适合婴幼儿' })
        break
      case 'food_safety':
        alternatives.push({ name: '家常炒菜', reason: '充分加热，安全放心' })
        break
    }
    
    return alternatives
  }
}

/**
 * 媒体文件清理（24-72h自动删除）
 */
async function cleanOldMedia() {
  try {
    const db = cloud.database()
    const _ = db.command
    
    const threeDaysAgo = Date.now() - (72 * 60 * 60 * 1000)
    
    // 查找过期文件
    const result = await db.collection('media_files')
      .where({
        uploadTime: _.lt(threeDaysAgo)
      })
      .get()
    
    // 删除云存储文件
    for (const file of result.data) {
      await cloud.deleteFile({
        fileList: [file.fileID]
      })
    }
    
    // 删除数据库记录
    await db.collection('media_files')
      .where({
        uploadTime: _.lt(threeDaysAgo)
      })
      .remove()
    
    console.log(`🧹 已清理${result.data.length}个过期媒体文件`)
  } catch (e) {
    console.error('清理媒体失败:', e)
  }
}

module.exports = {
  SafetyGuard: new SafetyGuard(),
  cleanOldMedia
}