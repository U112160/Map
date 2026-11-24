// 共用的隊友資料 API 代理：統一 base URL、參數編碼、錯誤處理與 CDN 快取標頭
export const TEAMMATE_BASE =
  process.env.TEAMMATE_API_BASE || 'https://my-app-five-chi-20.vercel.app';

// 常用的快取設定（秒）
export const CACHE = {
  dynamic: { sMaxAge: 30, swr: 60 },        // 即時剩餘車位、YouBike 可借數
  static: { sMaxAge: 3600, swr: 86400 },    // 站點、停車場基本資料、費率
  none: null,
};

const DEFAULT_CENTER = { center_lon: 121.5654, center_lat: 25.0330, radius: 3 };

function setCache(res, cache) {
  if (!cache) {
    res.setHeader('Cache-Control', 'no-store');
    return;
  }
  res.setHeader(
    'Cache-Control',
    `public, s-maxage=${cache.sMaxAge}, stale-while-revalidate=${cache.swr}`,
  );
}

/**
 * 建立 GET 代理 handler
 * @param {string} path 隊友 API 路徑，例如 '/api/ubike/stations'
 * @param {object} opts
 *   - params: 允許轉送的 query 參數名稱（陣列）
 *   - defaults: 參數預設值
 *   - required: 必填參數（缺少回 400）
 *   - cache: CACHE.dynamic / CACHE.static / CACHE.none
 */
export function createProxy(path, { params = [], defaults = {}, required = [], cache = CACHE.dynamic } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    for (const key of required) {
      if (!req.query[key]) return res.status(400).json({ error: `缺少 ${key} 參數` });
    }

    const qs = new URLSearchParams();
    for (const key of params) {
      const value = req.query[key] ?? defaults[key];
      if (value !== undefined && value !== '') qs.set(key, String(value));
    }
    const url = `${TEAMMATE_BASE}${path}${qs.size ? `?${qs}` : ''}`;

    try {
      const upstream = await fetch(url);
      const data = await upstream.json().catch(() => null);
      if (!upstream.ok) {
        console.error(`[proxy] ${path} upstream HTTP ${upstream.status}`);
        return res.status(upstream.status >= 500 ? 502 : upstream.status)
          .json(data ?? { error: '資料來源暫時無法使用' });
      }
      setCache(res, cache);
      return res.status(200).json(data);
    } catch (err) {
      console.error(`[proxy] ${path} failed:`, err);
      return res.status(502).json({ error: '資料來源暫時無法使用' });
    }
  };
}

// 以中心點 + 半徑查詢的端點
export function createAreaProxy(path, cache = CACHE.dynamic) {
  return createProxy(path, {
    params: ['center_lon', 'center_lat', 'radius'],
    defaults: DEFAULT_CENTER,
    cache,
  });
}
