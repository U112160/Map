// pages/api/plan-route.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('收到前端送來的資料：', req.body);

  const ALGORITHM_SERVICE_URL = process.env.ALGORITHM_SERVICE_URL;

  if (!ALGORITHM_SERVICE_URL) {
    return res.status(500).json({
      error: '尚未設定 ALGORITHM_SERVICE_URL，請在 .env.local 加上演算法服務的網址',
    });
  }

  try {
    // 注意：路徑是 /calculate，不是 /plan-route —— 這是隊友那邊 FastAPI 服務實際定義的路徑
    const algoResponse = await fetch(`${ALGORITHM_SERVICE_URL}/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    if (!algoResponse.ok) {
      const errText = await algoResponse.text();
      console.error('演算法服務回應錯誤:', algoResponse.status, errText);
      return res.status(502).json({ error: `演算法服務回應錯誤（${algoResponse.status}）：${errText}` });
    }

    const result = await algoResponse.json();
    res.status(200).json(result);

  } catch (err) {
    console.error('無法連線至演算法服務:', err);
    res.status(500).json({ error: `無法連線至演算法服務：${err.message}` });
  }
}