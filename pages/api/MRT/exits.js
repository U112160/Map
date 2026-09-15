// 以中心點半徑取得捷運出口
const TEAMMATE_BASE = 'https://my-app-five-chi-20.vercel.app';

export default async function handler(req, res) {
  const {
    center_lon = 121.5654,
    center_lat = 25.0330,
    radius = 3,
  } = req.query;

  try {
    const upstream = await fetch(
      `${TEAMMATE_BASE}/api/mrt/exits?center_lon=${center_lon}&center_lat=${center_lat}&radius=${radius}`
    );
    if (!upstream.ok) throw new Error(`upstream HTTP ${upstream.status}`);

    const data = await upstream.json();
    // 欄位與 Map.jsx 完全吻合：station_id, exit_id, station_name_zh, exit_name_zh,
    // lat, lon, location_description, has_stair, has_elevator, escalator_count
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || JSON.stringify(err) });
  }
}