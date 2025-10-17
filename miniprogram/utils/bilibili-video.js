// ==================== B站视频集成 ====================

// utils/bilibili-video.js
// V5.3-Plus B站视频接入

function attachVideo(dish) {
  // 从数据库或配置文件读取视频映射
  const videoLinkages = {
    'home': 'BV1xx411c7XZ',      // 家常做法
    'healthy': 'BV1yy411c7YZ',   // 健康版本
    'premium': 'BV1zz411c7ZZ'    // 升级版
  }
  
  // 为菜品添加视频链接
  if (dish.video_linkages) {
    dish.videoUrl = `https://www.bilibili.com/video/${dish.video_linkages.home || videoLinkages.home}`
    dish.videoDeepLink = `bilibili://video/${dish.video_linkages.home || videoLinkages.home}`
  }
  
  // 添加章节跳播信息
  if (dish.video_cues && Array.isArray(dish.video_cues)) {
    dish.videoChapters = dish.video_cues.map((cue, index) => ({
      title: `步骤${index + 1}`,
      time: cue.t || 0
    }))
  }
  
  return dish
}

/**
 * 打开B站视频（小程序内H5 → bilibili:// → 复制链接）
 */
function openBilibiliVideo(videoUrl, videoDeepLink, startTime = 0) {
  // 尝试1: 打开bilibili://协议（如果安装了B站APP）
  wx.navigateToMiniProgram({
    appId: 'wxe084a445b4381b1c', // B站小程序AppID（示例）
    path: `/pages/video/video?bvid=${extractBV(videoUrl)}&t=${startTime}`,
    fail: () => {
      // 尝试2: 复制链接到剪贴板
      wx.setClipboardData({
        data: videoUrl,
        success: () => {
          wx.showModal({
            title: '视频链接已复制',
            content: '请在浏览器或B站APP中打开',
            showCancel: false
          })
        }
      })
    }
  })
}

function extractBV(url) {
  const match = url.match(/BV[\w]+/)
  return match ? match[0] : ''
}

module.exports = {
  attachVideo,
  openBilibiliVideo
}
