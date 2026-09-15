const TEAMMATE_BASE = 'https://my-app-five-chi-20.vercel.app';

export default async function handler(req, res) {
  const {
    center_lon = 121.5654,
    center_lat = 25.0330,
    radius = 3,
  } = req.query;

  try {
    const upstream = await fetch(
      `${TEAMMATE_BASE}/api/ubike/stations?center_lon=${center_lon}&center_lat=${center_lat}&radius=${radius}`
    );
    if (!upstream.ok) throw new Error(`upstream HTTP ${upstream.status}`);

    const data = await upstream.json();
    // 欄位與 Map.jsx 完全吻合：station_uid, name_zh, address_zh, lat, lon,
    // bikes_capacity, available_rent, available_return, general_bikes,
    // electric_bikes, service_status, update_time
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || JSON.stringify(err) });
  }
}