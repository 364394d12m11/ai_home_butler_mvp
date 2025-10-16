// utils/weather-theme.js
// QWeather 现象代码可选：参考你现有的 code->category 映射
function getPrecipTypeByCode(code) {
  const c = Number(code);
  if ([300,301,302,303,304,305,306,307,308,309,310,311,312,313,314,315,316,317,318,399].includes(c)) return 'rain';
  if ([400,401,402,403,404,405,406,407,408,409,410,499].includes(c)) return 'snow';
  if ([504].includes(c)) return 'hail';   // 具体按你项目里的映射
  if ([500,501,502,503].includes(c)) return 'sleet';
  return 'none';
}

function decideTheme({ code, isNight }) {
  const precip = getPrecipTypeByCode(code);
  // 底色：只要夜就夜色；白天再分晴/云等
  const base = isNight ? 'night' : (Number(code) === 100 ? 'dayClear' : 'dayCloudy'); 
  // 动画：降水只影响动画层，不改底色
  return { base, precip }; // base 用于背景渐变/颜色，precip 用于动画层
}
// 在文件末尾添加：
module.exports = {
  getPrecipTypeByCode,
  decideTheme
}