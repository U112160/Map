const TEAMMATE_BASE = 'https://my-app-five-chi-20.vercel.app';

export default async function handler(req, res) {
  const {
    center_lon = 121.5654,
    center_lat = 25.0330,
    radius = 3,
  } = req.query;

  try {
    const upstream = await fetch(
      `${TEAMMATE_BASE}/api/parking/lots?center_lon=${center_lon}&center_lat=${center_lat}&radius=${radius}`
    );
    if (!upstream.ok) throw new Error(`upstream HTTP ${upstream.status}`);

    const data = await upstream.json();
    // 欄位：pkid, name, area, type, summary, address, payex,
    // total_car, total_motor, total_bike, total_bus,
    // pregnancy_first, handicap_first, taxi_one_hr_free, aed_equipment,
    // accessibility_elevator, phone_charge, child_pickup_area, handicap_discount,
    // fare_info, lon, lat,
    // available_car, available_motor, available_bus, available_handicap,
    // available_pregnancy, available_heavymotor, updatetime, distance_km
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || JSON.stringify(err) });
  }
}