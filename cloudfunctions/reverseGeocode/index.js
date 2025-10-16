const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// === 环境变量 ===
const rawTx = (process.env.TENCENT_MAP_KEYS || process.env.TENCENT_MAP_KEY || '')
  .replace(/，/g, ',')
  .split(',').map(s => (s || '').trim()).filter(Boolean)
const TENCENT_KEYS = rawTx
const AMAP_KEY = (process.env.AMAP_WEB_KEY || '').trim()
const POI_ON = (process.env.REVERSEGEOCODE_POI || '1') === '1'
const POI_MAX_DIST_M = Number(process.env.REVERSEGEOCODE_POI_MAX_DIST_M ||50) // 收紧为120m
const POI_RADIUS_M = Number(process.env.REVERSEGEOCODE_POI_RADIUS_M || 800)

// === 缓存（30天） ===
const CACHE_COLL = 'geo_cache'
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const CACHE_VERSION = 'v3'
const gridId = (lat, lng, prec = 4) => `${CACHE_VERSION}:${Number(lat).toFixed(prec)},${Number(lng).toFixed(prec)}`

// 展示
function formatDisplay(city, district, town, poiName) {
  const clean = s => (s || '').replace(/省|市|自治区|特别行政区|地区/g, '').trim()
  const c = clean(city), d = clean(district), t = clean(town)
  if (poiName && c && d) return `${c}·${d} ${poiName}`
  if (c && d && t) return `${c}·${d} ${t}`
  if (c && d) return `${c}·${d}`
  return c || ''
}

exports.main = async (event) => {
  const { lat, lng } = event || {}
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return { ok: false, error: 'invalid location' }
  }
  const id = gridId(lat, lng)

  // 1) 缓存
  try {
    const doc = await db.collection(CACHE_COLL).doc(id).get()
    const hit = doc?.data
    if (hit && (Date.now() - (hit.ts || 0) < CACHE_TTL_MS)) {
      return { ok: true, from: 'cache', ...hit, display: formatDisplay(hit.city, hit.district, hit.town, hit.poi?.name) }
    }
  } catch (_) {}

  // 2) 腾讯轮询
  const txErrs = []
  if (TENCENT_KEYS.length) {
    for (const key of TENCENT_KEYS) {
      try {
        const { data } = await axios.get('https://apis.map.qq.com/ws/geocoder/v1/', {
          params: {
            location: `${lat},${lng}`,
            key,
            get_poi: POI_ON ? 1 : 0,
            poi_options: POI_ON ? `policy=2;radius=${POI_RADIUS_M};address_format=short` : undefined,
          },
          timeout: 5000
        })
        if (data?.status === 0) {
          const parsed = parseTencent(data.result || {}, lat, lng)
          const withPoi = choosePoi(parsed, POI_MAX_DIST_M)
          withPoi.display = formatDisplay(withPoi.city, withPoi.district, withPoi.town, withPoi.poi?.name)
          await upsertCache(id, withPoi)
          console.log('reverseGeocode pick', { from: 'tencent', loc: { lat, lng }, poi: withPoi.poi })
          return { ok: true, from: 'tencent', ...withPoi }
        }
        txErrs.push(`${data?.status}:${data?.message || 'tencent failed'}`)
      } catch (e) { txErrs.push(String(e?.message || e)) }
    }
  }

  // 3) 高德兜底
  if (AMAP_KEY) {
    try {
      const { data } = await axios.get('https://restapi.amap.com/v3/geocode/regeo', {
        params: {
          key: AMAP_KEY,
          location: `${lng},${lat}`,     // 高德是 lng,lat
          extensions: POI_ON ? 'all' : 'base',
          roadlevel: 0
        },
        timeout: 5000
      })
      if (String(data?.status) === '1') {
        const parsed = parseAmap(data?.regeocode || {}, lat, lng)
        const withPoi = choosePoi(parsed, POI_MAX_DIST_M)
        withPoi.display = formatDisplay(withPoi.city, withPoi.district, withPoi.town, withPoi.poi?.name)
        await upsertCache(id, withPoi)
        console.log('reverseGeocode pick', { from: 'amap', loc: { lat, lng }, poi: withPoi.poi })
        return { ok: true, from: 'amap', ...withPoi }
      }
      return { ok: false, error: `amap fail: ${data?.info || 'unknown'} (${data?.infocode || '-'})` }
    } catch (e) {
      return { ok: false, error: `amap error: ${String(e?.message || e)}` }
    }
  }

  // 4) 全部失败
  return { ok: false, error: `geocode failed. tencent=${TENCENT_KEYS.length ? txErrs.join('|') : 'no-key'} amap=${AMAP_KEY ? 'tried' : 'no-key'}` }
}

// ====== 解析函数 ======
function parseTencent(r, lat, lng) {
  const province = r.ad_info?.province || r.address_component?.province || ''
  const city = r.ad_info?.city || r.address_component?.city || ''
  const district = r.ad_info?.district || r.address_component?.district || ''
  const town = r.address_reference?.town?.title || r.address_component?.town || ''
  const street = r.address_component?.street || ''
  const formatted = r.formatted_addresses?.recommend || r.address || ''
  let pois = []
  try {
    const ls = (r.pois || []).map(p => {
      const raw = (p._distance ?? p.distance ?? p._distanceMeters)
      const d = Number(raw)
      const distance = Number.isFinite(d) ? d : Infinity
      return {
        name: p.title || p.name || '',
        distance,
        type: p.category || p.type || '',
        address: p.address || '',
        provider: 'tencent'
      }
    })
    pois = ls.filter(x => x.name)
  } catch (_) {}
  return { province, city, district, town, street, formatted, pois, ts: Date.now(), loc: { lat, lng } }
}

function parseAmap(r, lat, lng) {
  const comp = r.addressComponent || {}
  const province = comp.province || ''
  const city = (Array.isArray(comp.city) ? comp.city[0] : comp.city) || comp.province || ''
  const district = comp.district || ''
  const town = comp.township || ''
  const street = comp.streetNumber?.street || ''
  const formatted = r.formatted_address || ''
  let pois = []
  try {
    const ls = (r.pois || []).map(p => {
      const raw = p.distance
      const d = Number(raw)
      const distance = Number.isFinite(d) ? d : Infinity
      return {
        name: p.name || '',
        distance,
        type: p.type || '',
        address: p.address || '',
        provider: 'amap'
      }
    })
    pois = ls.filter(x => x.name)
  } catch (_) {}
  return { province, city, district, town, street, formatted, pois, ts: Date.now(), loc: { lat, lng } }
}

// 只选择阈值内最近 POI（否则不用POI）
function choosePoi(parsed, maxDistM) {
  if (!POI_ON) return { ...parsed, poi: null }
  const list = (parsed.pois || [])
    .filter(x => Number.isFinite(x.distance))
    .sort((a, b) => a.distance - b.distance)
  const poi = list[0]
// 1) 如果有“街道/乡镇”，并且最近 POI > 80m，就优先用街道/乡镇，不拼店名
const SAFE_TOWN_FIRST = 50
if (parsed.town && (!poi || poi.distance > Math.min(maxDistM, SAFE_TOWN_FIRST))) {
  return { ...parsed, poi: null }
}

// 2) 只有当最近 POI <= 阈值(默认 80m) 时才使用店名
if (!poi || poi.distance > maxDistM) return { ...parsed, poi: null }

  return { ...parsed, poi }
}

// 缓存写入
async function upsertCache(id, data) {
  try {
    await db.collection(CACHE_COLL).doc(id).set({ data })
  } catch (e) {
    try { await db.collection(CACHE_COLL).doc(id).update({ data }) } catch (_) {}
  }
}
