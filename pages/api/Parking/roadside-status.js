const TEAMMATE_BASE = 'https://my-app-five-chi-20.vercel.app';

export default async function handler(req, res) {
  const { pkid } = req.query;

  if (!pkid) {
    return res.status(400).json({ error: '缺少 pkid 參數' });
  }

  try {
    const upstream = await fetch(
      `${TEAMMATE_BASE}/api/parking/roadside-status?pkid=${encodeURIComponent(pkid)}`
    );
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || JSON.stringify(err) });
  }
}