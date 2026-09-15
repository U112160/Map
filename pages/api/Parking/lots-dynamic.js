const TEAMMATE_BASE = 'https://my-app-five-chi-20.vercel.app';

export default async function handler(req, res) {
  const {
    center_lon = 121.5654,
    center_lat = 25.0330,
    radius = 3,
  } = req.query;

  try {
    const upstream = await fetch(
      `${TEAMMATE_BASE}/api/parking/lots/dynamic?center_lon=${center_lon}&center_lat=${center_lat}&radius=${radius}`
    );
    if (!upstream.ok) throw new Error(`upstream HTTP ${upstream.status}`);

    const data = await upstream.json();
    // 欄位：pkid, available_car, available_motor, available_bus,
    // available_handicap, available_pregnancy, available_heavymotor,
    // socket_status_list, updatetime
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || JSON.stringify(err) });
  }
}