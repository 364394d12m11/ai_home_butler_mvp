// components/kqi-dashboard/index.js
// V5.3-Plus KQI健康度看板

const { analytics } = require('../../utils/rate-limiter-and-analytics')

Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    }
  },
  
  data: {
    kqiReport: null,
    healthGrade: 'A' // A/B/C/D/F
  },
  
  lifetimes: {
    attached() {
      this.refreshReport()
      
      // 每30秒自动刷新
      this.timer = setInterval(() => {
        this.refreshReport()
      }, 30000)
    },
    
    detached() {
      if (this.timer) {
        clearInterval(this.timer)
      }
    }
  },
  
  methods: {
    refreshReport() {
      const report = analytics.getKQIReport()
      const grade = this.calculateGrade(report.health)
      
      this.setData({
        kqiReport: report,
        healthGrade: grade
      })
    },
    
    calculateGrade(health) {
      if (health >= 90) return 'A'
      if (health >= 80) return 'B'
      if (health >= 70) return 'C'
      if (health >= 60) return 'D'
      return 'F'
    },
    
    close() {
      this.triggerEvent('close')
    },
    
    exportReport() {
      const { kqiReport } = this.data
      
      const text = `
📊 KQI健康度报告

🎯 意图命中率：${kqiReport.hitRate}% （目标≥75%）
↩️ 撤销率：${kqiReport.undoRate}% （目标≤8%）
🚫 域外率：${kqiReport.outOfScopeRate}% （目标≤15%）
⚡ 语音平均延迟：${kqiReport.avgVoiceLatency}s （目标<1.8s）
📈 语音P95延迟：${kqiReport.p95VoiceLatency}s （目标<3.5s）
🤬 脏词次数：${kqiReport.profanityCount}

💯 健康度评分：${kqiReport.health}/100 （等级${this.data.healthGrade}）

生成时间：${new Date().toLocaleString()}
小橙子智能菜单
      `.trim()
      
      wx.setClipboardData({
        data: text,
        success: () => {
          wx.showToast({
            title: '报告已复制',
            icon: 'success'
          })
        }
      })
    }
  }
})