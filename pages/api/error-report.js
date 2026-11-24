import { TEAMMATE_BASE } from '../../lib/teammateProxy';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const upstream = await fetch(`${TEAMMATE_BASE}/api/error-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json().catch(() => null);
    return res.status(upstream.status).json(data ?? {});
  } catch (err) {
    console.error('[error-report] failed:', err);
    return res.status(502).json({ error: '回報暫時無法送出，請稍後再試' });
  }
}
