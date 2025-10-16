// utils/sun.js - 修复版
function toRadians(deg){ return (Math.PI/180)*deg }
function toDegrees(rad){ return (180/Math.PI)*rad }

// 修复后的 NOAA 算法
function calcSunTimeByNOAA(lat, lon, date = new Date(), type='sunset') {
  const zenith = 90.833; // 标准天文日出日落角度

  // 计算年内第几天
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const n = Math.floor(diff / (1000 * 60 * 60 * 24));

  // 经度时区偏移（小时）
  const lngHour = lon / 15;

  // 近似时间
  const isRise = type === 'sunrise';
  const t = n + ((isRise ? 6 : 18) - lngHour) / 24;

  // 太阳平近点角
  const M = (0.9856 * t) - 3.289;

  // 太阳真黄经
  let L = M + (1.916 * Math.sin(toRadians(M))) + (0.020 * Math.sin(toRadians(2 * M))) + 282.634;
  L = L % 360;
  if (L < 0) L += 360;

  // 太阳赤纬
  const RA = toDegrees(Math.atan(0.91764 * Math.tan(toRadians(L))));
  let RAQuadrant = Math.floor(L / 90) * 90;
  let RAQuadrantCorrected = Math.floor(RA / 90) * 90;
  RA = RA + (RAQuadrant - RAQuadrantCorrected);

  const sinDec = 0.39782 * Math.sin(toRadians(L));
  const cosDec = Math.cos(Math.asin(sinDec));

  // 时角
  const cosH = (Math.cos(toRadians(zenith)) - (sinDec * Math.sin(toRadians(lat)))) / (cosDec * Math.cos(toRadians(lat)));

  // 检查极昼极夜
  if (cosH > 1) return null; // 极夜
  if (cosH < -1) return null; // 极昼

  // 计算时角
  let H = isRise ? 360 - toDegrees(Math.acos(cosH)) : toDegrees(Math.acos(cosH));
  H = H / 15;

  // 地方平太阳时
  const T = H + RA / 15 - (0.06571 * t) - 6.622;

  // 转换为 UTC 时间
  let UT = T - lngHour;
  UT = UT % 24;
  if (UT < 0) UT += 24;

  // 转换为当地时间 (UTC+8)
  let localTime = UT + 8;
  localTime = localTime % 24;
  if (localTime < 0) localTime += 24;

  // 组装日期对象
  const hours = Math.floor(localTime);
  const minutes = Math.floor((localTime - hours) * 60);
  const seconds = Math.floor(((localTime - hours) * 60 - minutes) * 60);

  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, seconds);
}

function getLocalSunTimes({ lat, lon, qwDaily, now = new Date() }) {
  // A. 优先和风逐日数据
  if (qwDaily && qwDaily.fxDate && qwDaily.sunrise && qwDaily.sunset) {
    try {
      const dateStr = qwDaily.fxDate.replace(/-/g, '/');
      const sr = new Date(`${dateStr} ${qwDaily.sunrise}`);
      const ss = new Date(`${dateStr} ${qwDaily.sunset}`);
      if (!isNaN(sr.getTime()) && !isNaN(ss.getTime())) {
        return { sunrise: sr, sunset: ss, source: 'qweather-daily' };
      }
    } catch (e) {
      console.warn('和风日出日落解析失败:', e);
    }
  }

  // B. 兜底：NOAA 算法
  try {
    const sunrise = calcSunTimeByNOAA(lat, lon, now, 'sunrise');
    const sunset = calcSunTimeByNOAA(lat, lon, now, 'sunset');
    return { sunrise, sunset, source: 'noaa-local' };
  } catch (e) {
    console.warn('NOAA 算法失败:', e);
    // 最终兜底：简单估算
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return {
      sunrise: new Date(today.getTime() + 6 * 60 * 60 * 1000), // 6:00
      sunset: new Date(today.getTime() + 18 * 60 * 60 * 1000), // 18:00（兜底：18 点后按夜色处理）
      source: 'fallback-estimate'
    };
  }
}

function isNightBySunTimes(sunrise, sunset, now = new Date()) {
  if (!(sunrise instanceof Date) || !(sunset instanceof Date)) {
    // 兜底判断
    const hour = now.getHours();
    return hour < 6 || hour >= 18;
  }
  if (isNaN(sunrise.getTime()) || isNaN(sunset.getTime())) {
    // 兜底判断  
    const hour = now.getHours();
    return hour < 6 || hour >= 18;
  }
  return now < sunrise || now >= sunset;
}

module.exports = {
  calcSunTimeByNOAA,
  getLocalSunTimes,
  isNightBySunTimes
}