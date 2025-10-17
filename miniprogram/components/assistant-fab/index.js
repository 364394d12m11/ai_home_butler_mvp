// components/assistant-fab/index.js
// V5.3-Plus 悬浮AI助手按钮

Component({
  properties: {
    // 是否显示
    show: {
      type: Boolean,
      value: true
    },
    // 位置
    position: {
      type: String,
      value: 'bottom-right' // bottom-right | bottom-left
    }
  },
  
  data: {
    // 是否正在处理
    processing: false
  },
  
  methods: {
    // 点击悬浮按钮，打开对话抽屉
    openDialog() {
      if (this.data.processing) return
      
      this.triggerEvent('open-dialog')
    },
    
    // 设置处理状态
    setProcessing(processing) {
      this.setData({ processing })
    }
  }
})

