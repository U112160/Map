// pages/api/plan-route.js
//
// 隊友的演算法服務跑在 Render 免費方案上，閒置一段時間會被整個關掉，
// 下次請求進來才會重新啟動（冷啟動）。啟動過程中 Render 自己的閘道
// 會回 502/503，這跟我們的程式碼、跟使用者填的資料都沒有關係，
// 純粹是「服務還沒醒」。
//
// 與其讓使用者自己猜要等多久、手動按好幾次，這裡改成自動重試：
// 遇到 502/503（或是連線被拒絕這種冷啟動期間常見的錯誤）就自動等幾秒
// 再打一次，最多在 MAX_TOTAL_WAIT_MS 內重試，成功就直接回傳結果，
// 真的一直失敗才回報錯誤給前端。
//
// 注意：如果之後把這支 API 部署到 Vercel（而不是本機 next dev），
// Vercel Serverless Function 預設有執行時間上限（Hobby 方案預設只有 10 秒，
// 需要在 vercel.json 設定 maxDuration 才能延長），屆時 MAX_TOTAL_WAIT_MS
// 要跟著調整，不然函式會在重試完成前就被平台強制中斷。

const RETRY_DELAY_MS = 5000;      // 每次重試之間等待的時間
const MAX_TOTAL_WAIT_MS = 100000; // 總共願意花多久去等後端醒過來

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 判斷這個失敗值不值得重試：只針對「服務還沒起來」這類狀況重試，
// 真正的請求格式錯誤（400）或找不到路線（404，如果隊友有用到的話）
// 不應該重試，重試也不會有不同結果。
function isRetryableStatus(status) {
  return status === 502 || status === 503 || status === 504;
}

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

  const startedAt = Date.now();
  let attempt = 0;
  let lastErrorMessage = '';

  while (true) {
    attempt += 1;
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
        console.error(`演算法服務回應錯誤（第 ${attempt} 次嘗試）:`, algoResponse.status, errText);

        const elapsed = Date.now() - startedAt;
        if (isRetryableStatus(algoResponse.status) && elapsed + RETRY_DELAY_MS < MAX_TOTAL_WAIT_MS) {
          lastErrorMessage = `演算法服務回應錯誤（${algoResponse.status}）：${errText}`;
          await sleep(RETRY_DELAY_MS);
          continue; // 再試一次
        }

        return res.status(502).json({ error: `演算法服務回應錯誤（${algoResponse.status}）：${errText}` });
      }

      const result = await algoResponse.json();
      return res.status(200).json(result);

    } catch (err) {
      // fetch 本身丟出例外（例如冷啟動期間連線被拒絕），視同可重試的狀況
      console.error(`無法連線至演算法服務（第 ${attempt} 次嘗試）:`, err);
      lastErrorMessage = err.message || String(err);

      const elapsed = Date.now() - startedAt;
      if (elapsed + RETRY_DELAY_MS < MAX_TOTAL_WAIT_MS) {
        await sleep(RETRY_DELAY_MS);
        continue; // 再試一次
      }

      return res.status(500).json({
        error: `無法連線至演算法服務（已重試 ${attempt} 次，服務可能正在冷啟動或維護中）：${lastErrorMessage}`,
      });
    }
  }
}
