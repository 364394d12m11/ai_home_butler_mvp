// miniprogram/utils/emoji-map.js
// V3.4 和风天气 SVG 图标映射

const BASE = 'https://icons.qweather.com/icons/svg/'

module.exports = {
  // 极端天气
  sandstorm: `${BASE}508.svg`,
  typhoon: `${BASE}901.svg`,
  blizzard: `${BASE}401.svg`,
  hail: `${BASE}304.svg`,
  severe_thunder: `${BASE}302.svg`,
  gale: `${BASE}208.svg`,
  heatwave: `${BASE}100.svg`,
  coldwave: `${BASE}401.svg`,
  dense_fog: `${BASE}501.svg`,
  haze: `${BASE}502.svg`,
  
  // 常规天气
  rain: `${BASE}306.svg`,
  snow: `${BASE}400.svg`,
  cloudy: `${BASE}104.svg`,
  sunny: `${BASE}100.svg`,
  thunderstorm: `${BASE}302.svg`,
  fog: `${BASE}500.svg`,
  windy: `${BASE}200.svg`,
  
  // 特殊
  sleet: `${BASE}404.svg`,
  freezing_rain: `${BASE}313.svg`,
  tornado: `${BASE}999.svg`,
  clear: `${BASE}100.svg`,
  night: `${BASE}150.svg`,
  dawn: `${BASE}100.svg`,
  dusk: `${BASE}150.svg`
}