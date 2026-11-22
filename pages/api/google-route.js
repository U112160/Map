// 向 Google Routes API 要「起點 → 終點」的開車路線，回傳解碼後的座標點給前端畫在地圖上。
// 只用 Essentials 等級的欄位（不路況、不中繼點），每月 10,000 次免費額度內不收費。
//
// 金鑰放在 .env.local 的 GOOGLE_MAPS_API_KEY（不要加 NEXT_PUBLIC_，金鑰只留在伺服器端）。
// 沒設定金鑰時回 503，前端會自動退回只畫演算法的路線。

const ROUTES_API_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

// 同樣的起訖點短時間內不重複打 Google，省免費額度
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

// 自己加的每日上限：Google 主控台的 Routes API 配額不能調整，所以在這裡擋。
// 免費額度每月 10,000 次 ≈ 每天 330 次，預設 300 留一點緩衝；可用 GOOGLE_ROUTES_DAILY_LIMIT 改。
// 只算真的打到 Google 的次數（快取命中不算）。計數存在伺服器記憶體：
// 重新啟動伺服器會歸零；部署到 Vercel 這類多台主機時每台各算各的，所以仍要搭配 Google 帳單的預算警示。
const DAILY_LIMIT = Number(process.env.GOOGLE_ROUTES_DAILY_LIMIT) || 300;
const usage = { day: '', count: 0 };

function todayInTaipei() {
  // 用台灣日期當作「一天」的分界
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
}

function isValidPoint(p) {
  return p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));
}

// Google 的 encoded polyline 解碼（精度 1e-5）
function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of ['lat', 'lng']) {
      let result = 0;
      let shift = 0;
      let byte;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 'lat') lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: '只接受 POST' });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: '尚未設定 GOOGLE_MAPS_API_KEY' });
  }

  const { origin, destination } = req.body || {};
  if (!isValidPoint(origin) || !isValidPoint(destination)) {
    return res.status(400).json({ error: 'origin / destination 需要 { lat, lng }' });
  }

  const cacheKey = [origin.lat, origin.lng, destination.lat, destination.lng]
    .map((v) => Number(v).toFixed(5))
    .join(',');
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return res.status(200).json(cached.data);
  }

  const today = todayInTaipei();
  if (usage.day !== today) {
    usage.day = today;
    usage.count = 0;
  }
  if (usage.count >= DAILY_LIMIT) {
    return res.status(429).json({ error: `今天的 Google 路線查詢已達上限（${DAILY_LIMIT} 次），明天再試` });
  }
  usage.count += 1;

  const toWaypoint = (p) => ({
    location: { latLng: { latitude: Number(p.lat), longitude: Number(p.lng) } },
  });

  try {
    const response = await fetch(ROUTES_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        // 只要路線形狀、距離、時間：這些都是 Essentials 欄位
        'X-Goog-FieldMask': 'routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration',
      },
      body: JSON.stringify({
        origin: toWaypoint(origin),
        destination: toWaypoint(destination),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE', // 考慮即時路況會變成 Pro 等級，費用較高、免費額度較少
        languageCode: 'zh-TW',
        units: 'METRIC',
      }),
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = json?.error?.message || `HTTP ${response.status}`;
      console.error('Google Routes API 錯誤：', msg);
      return res.status(502).json({ error: `Google Routes API 錯誤：${msg}` });
    }

    const route = json.routes?.[0];
    const encoded = route?.polyline?.encodedPolyline;
    if (!encoded) {
      return res.status(404).json({ error: 'Google 找不到這兩點之間的開車路線' });
    }

    const data = {
      path: decodePolyline(encoded),
      distanceMeters: route.distanceMeters ?? null,
      duration: route.duration ?? null,
    };
    cache.set(cacheKey, { time: Date.now(), data });
    return res.status(200).json(data);
  } catch (err) {
    console.error('呼叫 Google Routes API 失敗：', err);
    return res.status(502).json({ error: '無法連線到 Google Routes API' });
  }
}
