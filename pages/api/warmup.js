// 使用者一打開網頁就叫醒 Render 上的演算法服務（免費方案閒置會休眠），
// 等他填完起點/目的地按下規劃時，服務已經醒了。
// 不等 Render 真正醒來：最多等幾秒就先回應，喚醒請求已經送出去就夠了。
export default async function handler(req, res) {
  const base = process.env.ALGORITHM_SERVICE_URL;
  res.setHeader('Cache-Control', 'no-store');
  if (!base) return res.status(200).json({ ok: false, reason: 'not configured' });

  try {
    const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(8000) });
    return res.status(200).json({ ok: r.ok });
  } catch {
    // 逾時通常代表正在冷啟動，喚醒請求已送達
    return res.status(200).json({ ok: false, reason: 'waking' });
  }
}
