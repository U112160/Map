const TEAMMATE_BASE = 'https://my-app-five-chi-20.vercel.app';

export default async function handler(req, res) {
  try {
    const upstream = await fetch(`${TEAMMATE_BASE}/api/parking/roadside-charge-rates`);
    if (!upstream.ok) throw new Error(`upstream HTTP ${upstream.status}`);

    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || JSON.stringify(err) });
  }
}