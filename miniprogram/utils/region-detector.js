// miniprogram/utils/region-detector.js
// V5.3 区域识别与画像构建

/**
 * 区域偏好映射表
 */
const REGION_PREFERENCE_MAP = {
  // 北方（偏好洋气菜）
  'north': {
    label: '北方',
    provinces: ['北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江'],
    cuisinePrefs: {
      '港式': 0.8,
      '日料': 0.9,
      '西餐': 0.85,
      '川菜': 0.6,
      '粤菜': 0.5,
      '家常': 0.7
    },
    trendyBonus: 0.15  // 洋气菜加分
  },
  
  // 南方（偏好粤菜/清淡）
  'south': {
    label: '南方',
    provinces: ['广东', '广西', '海南', '福建'],
    cuisinePrefs: {
      '粤菜': 0.95,
      '港式': 0.9,
      '川菜': 0.4,
      '湘菜': 0.5,
      '家常': 0.8,
      '日料': 0.7
    },
    trendyBonus: 0.1
  },
  
  // 西南（偏好川湘菜）
  'southwest': {
    label: '西南',
    provinces: ['四川', '重庆', '贵州', '云南', '西藏'],
    cuisinePrefs: {
      '川菜': 0.95,
      '湘菜': 0.8,
      '家常': 0.9,
      '港式': 0.3,
      '日料': 0.4,
      '西餐': 0.5
    },
    trendyBonus: 0.05
  },
  
  // 华东（偏好本帮/清淡略甜）
  'east': {
    label: '华东',
    provinces: ['上海', '江苏', '浙江', '安徽', '江西', '山东'],
    cuisinePrefs: {
      '本帮菜': 0.9,
      '粤菜': 0.7,
      '川菜': 0.6,
      '日料': 0.85,
      '西餐': 0.8,
      '家常': 0.75
    },
    trendyBonus: 0.12
  },
  
  // 中部
  'central': {
    label: '中部',
    provinces: ['河南', '湖北', '湖南'],
    cuisinePrefs: {
      '湘菜': 0.9,
      '川菜': 0.75,
      '家常': 0.85,
      '粤菜': 0.5,
      '日料': 0.5,
      '西餐': 0.5
    },
    trendyBonus: 0.08
  },
  
  // 西北
  'northwest': {
    label: '西北',
    provinces: ['陕西', '甘肃', '青海', '宁夏', '新疆'],
    cuisinePrefs: {
      '家常': 0.9,
      '川菜': 0.6,
      '粤菜': 0.4,
      '日料': 0.3,
      '西餐': 0.4
    },
    trendyBonus: 0.05
  }
}

/**
 * 城市等级映射
 */
const CITY_TIER_MAP = {
  'T1': ['北京', '上海', '广州', '深圳'],
  'T1.5': ['杭州', '成都', '武汉', '西安', '南京', '天津', '苏州', '重庆'],
  'T2': ['长沙', '郑州', '沈阳', '青岛', '宁波', '无锡', '佛山', '合肥', '昆明', '大连']
}

/**
 * 获取区域画像
 * @param {Object} location - 位置信息 { province, city, district }
 * @returns {Object} 区域画像
 */
function getRegionProfile(location = {}) {
  const { province = '', city = '' } = location
  
  // 1. 确定区域类型
  let regionType = 'central'  // 默认中部
  
  for (const [type, config] of Object.entries(REGION_PREFERENCE_MAP)) {
    if (config.provinces.some(p => province.includes(p) || city.includes(p))) {
      regionType = type
      break
    }
  }
  
  const regionConfig = REGION_PREFERENCE_MAP[regionType]
  
  // 2. 确定城市等级
  let cityTier = 'nonT1'
  
  if (CITY_TIER_MAP.T1.some(c => city.includes(c))) {
    cityTier = 'T1'
  } else if (CITY_TIER_MAP['T1.5'].some(c => city.includes(c))) {
    cityTier = 'T1.5'
  } else if (CITY_TIER_MAP.T2.some(c => city.includes(c))) {
    cityTier = 'T2'
  }
  
  // 3. 计算洋气偏好加成
  let trendyBonus = regionConfig.trendyBonus
  
  // 一线城市额外加成
  if (cityTier === 'T1') {
    trendyBonus += 0.1
  } else if (cityTier === 'T1.5') {
    trendyBonus += 0.05
  }
  
  return {
    native: regionType,
    nativeLabel: regionConfig.label,
    current: regionType,  // 如果有用户迁移数据，这里可以不同
    cuisinePrefs: regionConfig.cuisinePrefs,
    cityTier: cityTier,
    trendyBonus: Math.min(trendyBonus, 0.25),  // 最高25%加成
    location: {
      province,
      city,
      district: location.district || ''
    }
  }
}

/**
 * 根据区域画像调整菜品评分
 * @param {Number} baseScore - 基础分数
 * @param {Object} dish - 菜品
 * @param {Object} regionProfile - 区域画像
 * @returns {Number} 调整后的分数
 */
function adjustScoreByRegion(baseScore, dish, regionProfile) {
  if (!regionProfile || !dish) return baseScore
  
  let adjustedScore = baseScore
  const cuisinePrefs = regionProfile.cuisinePrefs || {}
  const isTrendy = dish.style_tags?.includes('洋气')
  
  // 1. 菜系偏好加成
  const dishCuisine = dish.origin_region || ''
  for (const [cuisine, pref] of Object.entries(cuisinePrefs)) {
    if (dishCuisine.includes(cuisine)) {
      adjustedScore *= pref
      break
    }
  }
  
  // 2. 洋气菜加成（基于区域和城市等级）
  if (isTrendy && regionProfile.trendyBonus > 0) {
    adjustedScore *= (1 + regionProfile.trendyBonus)
  }
  
  return adjustedScore
}

/**
 * 从微信获取位置信息
 * @returns {Promise<Object>} 位置信息
 */
function getLocationFromWX() {
  return new Promise((resolve) => {
    // 先尝试从缓存读取
    try {
      const cached = wx.getStorageSync('USER_LOCATION')
      const cacheTime = wx.getStorageSync('LOCATION_CACHE_TIME')
      
      // 如果缓存有效（24小时内）
      if (cached && cacheTime && (Date.now() - cacheTime) < 24 * 3600000) {
        resolve(cached)
        return
      }
    } catch (e) {
      console.log('读取位置缓存失败:', e)
    }
    
    // 获取位置授权
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.userLocation']) {
          // 已授权，直接获取
          getLocationData(resolve)
        } else {
          // 未授权，请求授权
          wx.authorize({
            scope: 'scope.userLocation',
            success: () => getLocationData(resolve),
            fail: () => resolve(getFallbackLocation())
          })
        }
      },
      fail: () => resolve(getFallbackLocation())
    })
  })
}

/**
 * 获取位置数据
 */
function getLocationData(resolve) {
  wx.getLocation({
    type: 'gcj02',
    success: (locationRes) => {
      // 使用逆地理编码获取城市信息
      // 这里需要调用云函数或第三方API
      // 简化版：直接使用默认数据
      const location = {
        latitude: locationRes.latitude,
        longitude: locationRes.longitude,
        province: '未知',
        city: '未知',
        district: ''
      }
      
      // 缓存位置信息
      try {
        wx.setStorageSync('USER_LOCATION', location)
        wx.setStorageSync('LOCATION_CACHE_TIME', Date.now())
      } catch (e) {
        console.log('保存位置缓存失败:', e)
      }
      
      resolve(location)
    },
    fail: () => resolve(getFallbackLocation())
  })
}

/**
 * 获取兜底位置
 */
function getFallbackLocation() {
  return {
    province: '北京',
    city: '北京',
    district: '朝阳区'
  }
}

/**
 * 构建完整区域画像（含行为学习）
 * @param {Object} location - 位置信息
 * @param {Object} behaviorData - 行为数据（可选）
 * @returns {Object} 完整区域画像
 */
function buildFullRegionProfile(location, behaviorData = null) {
  const baseProfile = getRegionProfile(location)
  
  // 如果有行为数据，进行融合
  if (behaviorData && behaviorData.cuisinePrefs) {
    const nativeWeight = 0.6
    const behaviorWeight = 0.4
    
    const mergedPrefs = {}
    
    // 融合菜系偏好
    for (const [cuisine, nativePref] of Object.entries(baseProfile.cuisinePrefs)) {
      const behaviorPref = behaviorData.cuisinePrefs[cuisine] || 0.5
      mergedPrefs[cuisine] = nativePref * nativeWeight + behaviorPref * behaviorWeight
    }
    
    baseProfile.cuisinePrefs = mergedPrefs
    baseProfile.mix = { native: nativeWeight, behavior: behaviorWeight }
  } else {
    baseProfile.mix = { native: 1.0, behavior: 0 }
  }
  
  return baseProfile
}

module.exports = {
  getRegionProfile,
  adjustScoreByRegion,
  getLocationFromWX,
  buildFullRegionProfile,
  REGION_PREFERENCE_MAP,
  CITY_TIER_MAP
}