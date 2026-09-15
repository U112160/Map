const TEAMMATE_BASE = 'https://my-app-five-chi-20.vercel.app';

export default async function handler(req, res) {
  const { segment_id } = req.query;

  try {
    const url = segment_id
      ? `${TEAMMATE_BASE}/api/parking/roadside-charge?segment_id=${encodeURIComponent(segment_id)}`
      : `${TEAMMATE_BASE}/api/parking/roadside-charge`;

    const upstream = await fetch(url);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || JSON.stringify(err) });
  }
}