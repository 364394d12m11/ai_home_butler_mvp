// cloudfunctions/dietByFridge/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/**
 * 入参示例：
 * { fridge: ["鸡蛋","西红柿","葱","面条"], limit: 3, spicyMax: 1, budget: "low" }
 * 出参：
 * { ok:true, items:[{name, need:[], have:[], score, steps:[] }], shopping: ["xxx","yyy"] }
 */
exports.main = async (event) => {
  try {
    const fridge = normList(event.fridge || [])
    const limit = Number(event.limit || 3)
    const spicyMax = Number(event.spicyMax ?? 5) // 0不吃辣 1微辣...
    const budget = event.budget || 'any'

    // 简化版菜库（后面可放到集合/文件）
    const DISHES = [
      d("西红柿炒蛋", ["西红柿","鸡蛋","葱","食用油","盐","糖"], {time:10, spicy:0, budget:"low"}, ["打蛋","热油","炒蛋出锅","炒番茄","回锅合炒出锅"]),
      d("青椒土豆丝", ["土豆","青椒","蒜","食用油","盐","醋"], {time:12, spicy:1, budget:"low"}, ["切丝泡水","热油下蒜","下土豆青椒","调味出锅"]),
      d("蒜蓉西兰花", ["西兰花","蒜","食用油","盐"], {time:8, spicy:0, budget:"low"}, ["焯水","蒜蓉爆香","翻炒调味"]),
      d("牛肉青菜面", ["牛肉末","青菜","面条","酱油","葱","盐","食用油"], {time:15, spicy:0, budget:"mid"}, ["煮面","炒牛肉末","下青菜调味","拌面出锅"]),
      d("宫保鸡丁", ["鸡胸肉","花生米","黄瓜","干辣椒","蒜","葱","酱油","糖","醋","生粉","食用油","盐"], {time:18, spicy:3, budget:"mid"}, ["腌肉","炒酱料","下鸡丁黄瓜花生","勾芡出锅"]),
      d("麻婆豆腐", ["内酯豆腐","牛肉末","郫县豆瓣","花椒粉","葱","蒜","酱油","食用油","盐"], {time:16, spicy:4, budget:"mid"}, ["煸香豆瓣","下肉末","下豆腐小火入味","出锅撒花椒"])
    ]

    // 过滤辣度/预算
    const f = DISHES.filter(x => x.meta.spicy <= spicyMax && (budget==='any' || x.meta.budget===budget))

    // 计算匹配分
    const scored = f.map(x => {
      const need = x.ingredients.filter(i => !fridge.includes(i))
      const have = x.ingredients.filter(i => fridge.includes(i))
      const score = have.length / x.ingredients.length   // 匹配度
      return { ...x, need, have, score }
    }).sort((a,b)=> b.score - a.score || a.meta.time - b.meta.time).slice(0, limit)

    // 生成缺料清单（合并去重）
    const shopping = uniq(scored.flatMap(x => x.need))

    return { ok:true, items: scored, shopping }
  } catch (e) {
    return { ok:false, error: String(e?.message || e) }
  }
}

// 工具
function d(name, ingredients, meta, steps) { return { name, ingredients, meta, steps } }
function normList(arr){ return (arr||[]).map(s => String(s||'').trim()).filter(Boolean) }
function uniq(arr){ return Array.from(new Set(arr)) }
