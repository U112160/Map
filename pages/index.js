import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';

import { toCoords, splitRouteIntoLegs, transportModesToString, normalizeRouteResult, buildGoogleMapsUrl } from '../lib/routeUtils';
import { getRouteColor } from '../lib/routeColors';
import { formatCarAvailability } from '../lib/parkingFormat';
import { useToast } from '../hooks/useToast';
import { SearchInput } from '../components/ui/SearchInput';
import { PreferenceToggle } from '../components/ui/PreferenceToggle';
import { CheckboxGroup } from '../components/ui/CheckboxGroup';
import { PriceLimitInput } from '../components/ui/PriceLimitInput';
import { DistanceLimitInput } from '../components/ui/DistanceLimitInput';
import { PrimaryButton, SecondaryButton } from '../components/ui/Buttons';
import { RouteSummary } from '../components/ui/RouteSummary';
import { DraggablePanel } from '../components/ui/DraggablePanel';
import { StepIndicator, StepNav, STEP_COLORS } from '../components/ui/StepIndicator';
import { MobileDrawer, useIsMobile } from '../components/ui/MobileDrawer';
import { ToastContainer } from '../components/Toast';
import { DisclaimerModal } from '../components/DisclaimerModal';
import { BugReportModal } from '../components/BugReportModal';

// 地圖不能在伺服器端渲染（Leaflet 需要 window/document），改用動態載入，
// 且 Map.jsx 現在放在專案根目錄的 components/，不是 pages/components/，
// 避免 Next.js 把它誤判成一個獨立頁面路由
const MapView = dynamic(
  () => import('../components/Map'),
  { ssr: false }
);

// 隊友的 /api/parking/roadside-spots 之前很慢（15~20 秒），已經改成用比較小的
// radius（見 ROADSIDE_FETCH_RADIUS）+ AbortController 中止舊請求，實測有變快，
// 重新打開路邊停車格的抓取
const ENABLE_ROADSIDE_PARKING = true;

// 隊友的 /api/parking/lots 有時候 lat/lon 兩個欄位會反過來
// （例如 lon 欄位裡放的其實是緯度）。台灣緯度大約在 21~26 之間、
// 經度大約在 118~123 之間，用這個範圍自動偵測、抓反就自動校正，
// 這樣不管隊友那邊之後有沒有修，這段都不會誤判
function fixLatLng(lat, lon) {
  const looksLikeLat = (v) => typeof v === 'number' && v >= 20 && v <= 27;
  const looksLikeLon = (v) => typeof v === 'number' && v >= 117 && v <= 123;
  if (looksLikeLon(lat) && looksLikeLat(lon)) {
    return { lat: lon, lng: lat }; // 反了，校正回來
  }
  return { lat, lng: lon }; // 正常
}

// 兩個經緯度之間的直線距離（公尺）
function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function MapPage() {
  const [data, setData] = useState([]);
  const [roadsideSpots, setRoadsideSpots] = useState([]);
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  // 到達目的地的方式（複選）：停車後如果離目的地還有一段距離，讓使用者勾選願意搭配的接駁方式
  // 陣列可以是空的（代表只走路）、選一個、或同時選兩個（代表 YouBike、捷運都可接受）
  const [transportModes, setTransportModes] = useState([]);
  // 可接受的最遠距離（公尺）：跟 maxPrice 同一種「使用者自訂上限」的做法
  const [maxDistance, setMaxDistance] = useState('500');
  // 接駁距離（公尺）：放在「接駁方式」那一步，捷運、YouBike 各自一個，
  // 預設 500、每格 100，只有勾選該接駁方式時才會顯示、才會送給後端
  const [mrtDistance, setMrtDistance] = useState('500');
  const [ubikeDistance, setUbikeDistance] = useState('500');
  const [priorityMode, setPriorityMode] = useState('space');
  const [maxPrice, setMaxPrice] = useState('');
  // 停車類型：'roadside' = 路邊停車格（演算法自己挑，跟以前一樣）；
  // 'lot' = 停車場（使用者自己從範圍內的停車場挑一座，把停車場 id 送給後端）
  const [parkingType, setParkingType] = useState('roadside');
  const [lotCandidates, setLotCandidates] = useState([]); // 範圍內的停車場清單
  const [lotsLoading, setLotsLoading] = useState(false);
  const [lotsError, setLotsError] = useState(null);
  const [selectedLotId, setSelectedLotId] = useState(null); // 使用者選的停車場 pkid
  // routeResult 現在存的是「正規化過」的整包多路線回應：
  // { status, summary（整批摘要：transportMode/total_routes/available_routes）,
  //   transfer_stations, routes: [{ mode, mode_name, available, summary（這條路線自己的）,
  //   waypoints, routeGeometry, alongRouteParkings }, ...] }
  // 畫在地圖上的「目前這條路線」是 routes[selectedRouteIndex]，見下面的 activeRoute
  const [routeResult, setRouteResult] = useState(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [ubikeStations, setUbikeStations] = useState([]);
  const [mrtExits, setMrtExits] = useState([]);
  const [isPlanning, setIsPlanning] = useState(false);
  // 目前「Maps」按鈕要帶去 /navigate 分頁的是第幾段（多段路線時用）
  const [activeLegIndex, setActiveLegIndex] = useState(0);
  const FETCH_RADIUS = 3; // 公里，可自行調整（停車場/YouBike/捷運出口用）
  // 路邊停車格那支 API 實測 radius=3 要 20 秒，非常慢；反正路邊停車格要
  // zoom >= 16 才會顯示，那時候畫面本來就只看得到一小塊範圍，縮小查詢半徑
  // 大幅減少隊友那邊要查的資料量，回應速度會快很多
  const ROADSIDE_FETCH_RADIUS = 0.6; // 公里
  const fetchDebounceRef = useRef(null);
  // 每次呼叫 fetchAllData 就 +1；非同步回來時比對這個值，
  // 不是「最新一次」的回應就丟掉，避免比較慢的舊請求把新資料蓋掉
  const requestIdRef = useRef(0);
  // 上一輪還沒回來的請求，開始新一輪時直接中止，
  // 避免舊請求一直占著連線，把新請求排在後面拖慢
  const abortControllerRef = useRef(null);

  // 上一次真正套用到畫面上的資料「內容特徵」，重新抓到資料後先比對，
  // 內容其實沒變就直接跳過 setState，連那一次重新渲染都不要發生
  // （react-leaflet-cluster 只要一重新渲染，開著的 popup 就會閃一下，
  // 這是套件本身的已知瑕疵：https://github.com/akursat/react-leaflet-cluster/issues/38）
  const lastSignatureRef = useRef({ data: '', roadsideSpots: '', ubikeStations: '', mrtExits: '' });
  function setIfChanged(key, setter, newValue) {
    const sig = JSON.stringify(newValue);
    if (lastSignatureRef.current[key] === sig) return; // 內容沒變，不觸發重新渲染
    lastSignatureRef.current[key] = sig;
    setter(newValue);
  }

  // 收費費率表（rate_id → 費率資料）：整份表不吃座標參數，只在掛載時抓一次，
  // 不用跟著地圖移動重抓。用 ref 存一份給 fetchAllData（它是空 deps 的
  // useCallback）讀最新值，避免閉包抓到舊的 state。
  const [rateTable, setRateTable] = useState(new Map());
  const rateTableRef = useRef(rateTable);
  useEffect(() => {
    rateTableRef.current = rateTable;
  }, [rateTable]);

  // Toast 通知（目前只印 Console，不顯示畫面提示）
  const { toasts, addToast, removeToast } = useToast();

  // 收費費率表：掛載時抓一次（不吃座標參數，整份表）
  useEffect(() => {
    fetch('/api/Parking/roadside-charge-rates')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setRateTable(new Map(data.map((r) => [String(r.rate_id), r])));
      })
      .catch((err) => {
        addToast('warning', '收費費率表載入失敗', `${err.message}，路邊停車格暫時不會顯示收費資訊`);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bug 回報 Modal
  const [bugModalOpen, setBugModalOpen] = useState(false);
  const [bugPrefill, setBugPrefill] = useState('');

  // 免責聲明（預設開啟）
  const [disclaimerOpen, setDisclaimerOpen] = useState(true);

  // ── 選單面板改成分步驟填寫，避免一次塞太多欄位 ──
  // 起訖點 → 停車條件 → 接駁方式 →（選停車場時才有：選擇停車場）→ 規劃路線 → 路線結果
  // 「選擇停車場」要放在接駁方式後面：停車場的搜尋範圍是由接駁距離算出來的，
  // 使用者填完接駁距離才算得出範圍。每一步用 id 判斷，不用數字索引，
  // 這樣有沒有多一步都不會錯位
  const stepDefs =
    parkingType === 'lot'
      ? [
          { id: 'route', label: '起訖點' },
          { id: 'condition', label: '停車條件' },
          { id: 'transfer', label: '接駁方式' },
          { id: 'lot', label: '選擇停車場' },
          { id: 'plan', label: '規劃路線' },
          { id: 'result', label: '路線結果' },
        ]
      : [
          { id: 'route', label: '起訖點' },
          { id: 'condition', label: '停車條件' },
          { id: 'transfer', label: '接駁方式' },
          { id: 'plan', label: '規劃路線' },
          { id: 'result', label: '路線結果' },
        ];
  const PANEL_STEPS = stepDefs.map((s) => s.label);
  const RESULT_STEP = stepDefs.length - 1;
  const [panelStep, setPanelStep] = useState(0);
  const stepId = stepDefs[Math.min(panelStep, RESULT_STEP)].id;

  // 停車場的搜尋範圍（公尺）：以終點為圓心。
  // 有勾捷運／YouBike 就取勾選的接駁距離中最大的那個；都沒勾（走路）就用「可接受的最遠距離」。
  // ⚠️ 範圍怎麼定義是我的假設，要跟隊友確認；要改只需要改這裡
  const lotRadiusMeters = useMemo(() => {
    const picked = [];
    if (transportModes.includes('mrt')) picked.push(Number(mrtDistance) || 0);
    if (transportModes.includes('ubike')) picked.push(Number(ubikeDistance) || 0);
    return picked.length ? Math.max(...picked) : Number(maxDistance) || 0;
  }, [transportModes, mrtDistance, ubikeDistance, maxDistance]);

  const selectedLot = lotCandidates.find((l) => l.pkid === selectedLotId) ?? null;

  // 終點、範圍或停車類型一變，舊的候選清單和選擇就失效
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLotCandidates([]);
    setSelectedLotId(null);
    setLotsError(null);
  }, [end?.lat, end?.lng, lotRadiusMeters, parkingType]);

  // 進到「選擇停車場」這一步才去抓範圍內的停車場
  useEffect(() => {
    if (parkingType !== 'lot' || stepId !== 'lot' || !end || !(lotRadiusMeters > 0)) return;
    const controller = new AbortController();
    const { signal } = controller;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLotsLoading(true);
    setLotsError(null);
    (async () => {
      try {
        const q = `center_lat=${end.lat}&center_lon=${end.lng}&radius=${lotRadiusMeters / 1000}`;
        const [lotsRes, dynRes] = await Promise.allSettled([
          fetch(`/api/Parking/lots?${q}`, { signal }).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          }),
          fetch(`/api/Parking/lots-dynamic?${q}`, { signal }).then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
          }),
        ]);
        if (lotsRes.status !== 'fulfilled') throw new Error(String(lotsRes.reason));
        const dynByPkid =
          dynRes.status === 'fulfilled' && Array.isArray(dynRes.value)
            ? new Map(dynRes.value.map((d) => [d.pkid, d]))
            : new Map();
        const list = (Array.isArray(lotsRes.value) ? lotsRes.value : [])
          .map((lot) => {
            const { lat, lng } = fixLatLng(lot.lat, lot.lon);
            const dyn = dynByPkid.get(lot.pkid) || {};
            return {
              pkid: lot.pkid,
              name: lot.name,
              address: lot.address,
              payex: lot.payex,
              lat,
              lng,
              available_count: dyn.available_car ?? lot.available_car ?? null,
              distanceMeters:
                typeof lat === 'number' && typeof lng === 'number'
                  ? haversineMeters({ lat: end.lat, lng: end.lng }, { lat, lng })
                  : NaN,
            };
          })
          // API 的 radius 只是粗篩，這裡用實際直線距離再精確濾一次
          .filter((l) => Number.isFinite(l.distanceMeters) && l.distanceMeters <= lotRadiusMeters)
          .sort((a, b) => a.distanceMeters - b.distanceMeters);
        setLotCandidates(list);
      } catch (err) {
        if (err.name === 'AbortError') return;
        setLotsError(err.message || '未知錯誤');
        setLotCandidates([]);
      } finally {
        if (!signal.aborted) setLotsLoading(false);
      }
    })();
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parkingType, stepId, end?.lat, end?.lng, lotRadiusMeters]);

  // 手機版：面板改成左側可收起的抽屜；電腦版維持原本可拖曳的 DraggablePanel
  // isMobile 一開始是 null（伺服器端還不知道螢幕寬度），知道之前先不渲染面板
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(true);

  // 每一步「能不能前進到下一步」的條件，以及不能前進時顯示的提示
  function getStepBlocker(step) {
    if (step === 'route') {
      if (!start) return '請先搜尋並選取起點';
      if (!end) return '請先搜尋並選取終點';
    }
    if (step === 'condition') {
      if (!(Number(maxDistance) > 0)) return '請填入可接受的最遠距離';
      // 選停車場時沒有費率優先／車位優先這個選項，不檢查費率上限
      if (parkingType !== 'lot' && priorityMode === 'rate' && !(Number(maxPrice) > 0)) return '費率上限必須大於 0';
    }
    if (step === 'lot') {
      if (lotsLoading) return '停車場載入中…';
      if (!selectedLotId) return lotCandidates.length ? '請選擇一座停車場' : '範圍內沒有停車場，請回上一步調高接駁距離';
    }
    if (step === 'transfer') {
      // 哪個接駁方式有勾，對應的接駁距離才有意義，才要求要填；
      // 都不勾（走路）就不擋，跟費率上限只在「費率優先」時才檢查是同樣的做法
      if (transportModes.includes('mrt') && !(Number(mrtDistance) > 0)) return '請填入捷運接駁距離';
      if (transportModes.includes('ubike') && !(Number(ubikeDistance) > 0)) return '請填入 YouBike 接駁距離';
    }
    if (step === 'plan') {
      // 用 routeResult（上面宣告的 state）而不是 activeRoute，
      // activeRoute 是在更下面才宣告的 const，這裡讀會丟 ReferenceError
      if (!routeResult) return '請先按「開始規劃路線」';
    }
    return null;
  }
  const stepBlocker = getStepBlocker(stepId);

  const goNextStep = () => {
    if (stepBlocker) return;
    setPanelStep((s) => Math.min(RESULT_STEP, s + 1));
  };
  const goPrevStep = () => setPanelStep((s) => Math.max(0, s - 1));

  // 第 4 步顯示的條件摘要
  const TRANSPORT_LABELS = { ubike: 'YouBike', mrt: '捷運' };
  const conditionSummary = [
    ['起點', start?.name || '—'],
    ['終點', end?.name || '—'],
    ['最遠距離', `${maxDistance || 0} 公尺`],
    ['停車類型', parkingType === 'lot' ? '停車場' : '路邊停車格'],
    ...(parkingType === 'lot'
      ? [['指定停車場', selectedLot?.name || '—']]
      : [['優先條件', priorityMode === 'rate' ? `費率優先（≤ $${maxPrice}/時）` : '車位優先']]),
    ['接駁方式', transportModes.length ? transportModes.map((m) => TRANSPORT_LABELS[m] || m).join('、') : '走路'],
    ...(transportModes.includes('mrt') ? [['捷運接駁距離', `${mrtDistance || 0} 公尺`]] : []),
    ...(transportModes.includes('ubike') ? [['YouBike 接駁距離', `${ubikeDistance || 0} 公尺`]] : []),
  ];

  // 複選：已勾選就取消，未勾選就加入
  const handleTransportModeToggle = (mode) => {
    setTransportModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    );
  };

  const handlePriorityModeChange = (mode) => {
    setPriorityMode(mode);
    if (mode !== 'rate') {
      setMaxPrice('');
    } else if (!maxPrice) {
      setMaxPrice('30'); // 切到費率優先時，若還沒填過，預設帶入 30
    }
  };

  // 後端不管在哪種 priorityMode 下都會把 maxRate 當成硬性的價格上限來篩選，
  // 不是只有「費率優先」才生效。所以「空間優先」「距離優先」這兩種模式，
  // 如果照舊送 maxRate: 0，等於跟後端說「只接受免費車位」，
  // 導致大多數地點都篩選到 0 筆、回傳 no_parking（一直沒有真正回傳過真的資料的原因）。
  // 只有在「費率優先」時才把使用者填的上限帶進去，其他模式一律送一個
  // 大到不會篩掉任何車位的數字，等於「不限制費率」。
  const NO_RATE_LIMIT = 99999;

  // 切換停車類型：舊的路線結果是用另一種類型算的，直接清掉避免誤會
  const handleParkingTypeChange = (type) => {
    if (type === parkingType) return;
    setParkingType(type);
    setRouteResult(null);
    setSelectedRouteIndex(0);
  };

  function buildPayload() {
    const isLot = parkingType === 'lot';
    const payload = {
      // 選停車場時，停車場是使用者指定的，不需要費率／車位優先的篩選，
      // 固定送 space + 不限費率
      priorityMode: isLot ? 'space' : priorityMode,
      start: toCoords(start),
      end: toCoords(end),
      maxRate: !isLot && priorityMode === 'rate' ? (Number(maxPrice) || 0) : NO_RATE_LIMIT,
      transportMode: transportModesToString(transportModes),
      maxDistance: Number(maxDistance) || 0,
    };
    // 接駁距離：只送有勾選的那幾種。
    // ⚠️ 欄位名稱 mrtDistance / ubikeDistance 是我們前端先定的，
    // 要跟演算法後端 /calculate 實際收的欄位名稱一致，後端若不同名請改這兩行
    if (transportModes.includes('mrt')) payload.mrtDistance = Number(mrtDistance) || 0;
    if (transportModes.includes('ubike')) payload.ubikeDistance = Number(ubikeDistance) || 0;
    // 停車類型與使用者指定的停車場 id（pkid，就是 /api/parking/lots 回的 pkid）。
    // ⚠️ 欄位名稱 parkingType / parkingLotId 也是我們前端先定的，要跟隊友確認；
    // parkingType 選路邊停車格時是 'roadside'，其他欄位跟以前完全一樣
    payload.parkingType = isLot ? 'lot' : 'roadside';
    if (isLot) payload.parkingLotId = selectedLotId;
    return payload;
  }

  // 選出一條路線當「目前顯示的」：優先選第一條 available 的，
  // 萬一全部都不可用（理論上不該發生，後端應該會直接回 no_parking），保底選第 0 條
  function pickInitialRouteIndex(routes) {
    const idx = (routes || []).findIndex((r) => r.available);
    return idx >= 0 ? idx : 0;
  }

  async function handlePlanRoute() {
    // 表單驗證
    if (!start) {
      addToast('warning', '尚未選擇起點', '請先搜尋並選取起點後再規劃路線');
      return;
    }
    if (!end) {
      addToast('warning', '尚未選擇終點', '請先搜尋並選取終點後再規劃路線');
      return;
    }
    if (parkingType === 'lot' && !selectedLotId) {
      addToast('warning', '尚未選擇停車場', '請先回到「選擇停車場」步驟挑一座停車場');
      return;
    }
    if (parkingType !== 'lot' && priorityMode === 'rate' && !maxPrice) {
      addToast('warning', '請輸入費率上限', '已選擇「費率優先」，請填入每小時可接受的最高費率');
      return;
    }
    if (parkingType !== 'lot' && priorityMode === 'rate' && Number(maxPrice) <= 0) {
      addToast('warning', '費率上限無效', '費率上限必須大於 0');
      return;
    }

    setIsPlanning(true);
    try {
      const payload = buildPayload();

      const response = await fetch('/api/plan-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errMsg = '伺服器發生未知錯誤';
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
        } catch (_) {}

        if (response.status === 400) {
          addToast('error', '請求格式錯誤', errMsg);
        } else if (response.status === 404) {
          addToast('error', '找不到路線', '起點與終點之間無法規劃路線，請嘗試其他地點');
        } else if (response.status === 503 || response.status === 502) {
          addToast('error', '伺服器暫時無法使用', '路線規劃服務目前維護中，請稍後再試');
        } else {
          addToast('error', `路線規劃失敗（${response.status}）`, errMsg);
        }

        setBugPrefill(`HTTP ${response.status}：${errMsg}`);
        return;
      }

      const raw = await response.json();

      // 後端有時候會用 HTTP 200 + status 欄位來表示「沒有結果」，
      // 不是靠 HTTP 錯誤碼，所以這裡要另外檢查 body 裡的 status。
      // 後端改版後回傳的是「多路線」格式（routes: [...]），不是單一路線直接帶
      // routeGeometry，所以這裡要檢查 routes 裡有沒有至少一條真的可用、
      // 而且有路線幾何資料的路線
      const hasUsableRoute = raw.routes?.some((r) => r.available && r.routeGeometry?.length);
      if (raw.status !== 'success' || !hasUsableRoute) {
        addToast(
          'warning',
          '找不到符合條件的路線',
          raw.message || '目前沒有符合條件的可用車位，請嘗試放寬條件或更換起訖點'
        );
        setRouteResult(null);
        return;
      }

      // 後端座標欄位用的是 lon，這裡統一轉成 App 其他地方慣用的 lat/lng
      const normalized = normalizeRouteResult(raw);
      setRouteResult(normalized);
      setSelectedRouteIndex(pickInitialRouteIndex(normalized.routes));
      setActiveLegIndex(0); // 換了新路線，舊的「目前第幾段」不一定還有效，重置回第一段
      setPanelStep(RESULT_STEP); // 規劃成功，直接跳到「路線結果」頁
      // 手機畫面小，規劃成功後自動收起抽屜，讓使用者先看到地圖上的路線；
      // 再點把手打開就會停在「路線結果」頁，可以按 Google Maps 導航
      if (isMobile) setDrawerOpen(false);

      const available = normalized.routes.filter((r) => r.available).map((r) => r.mode_name).join('、');
      console.log('路線規劃完成，可用路線：', available || '（無）');

    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        addToast('error', '網路連線失敗', '無法連線至伺服器，請確認網路連線後再試');
      } else {
        addToast('error', '規劃路線時發生錯誤', err.message || '未知錯誤');
      }
      setBugPrefill(err?.message || '未知前端錯誤');
    } finally {
      setIsPlanning(false);
    }
  }

  // routeResult 現在是整包多路線回應，畫在地圖上／拿來切 Google Maps 路段的
  // 是使用者目前選的那一條（selectedRouteIndex），不是整包本身
  const activeRoute = routeResult?.routes?.[selectedRouteIndex] ?? null;

  // 把目前選中的路線切成多段（每段都在 Google Maps 的 10 站上限內）
  // 只有在真的超過上限時才會超過 1 段，一般情況下 googleMapsLegs.length === 1
  const googleMapsLegs = useMemo(() => {
    if (!activeRoute?.routeGeometry) return [];
    return splitRouteIntoLegs(activeRoute.routeGeometry, 10);
  }, [activeRoute]);

  // 換了路線之後，legs 的段數可能變少，舊的 activeLegIndex 可能已經超出範圍，
  // 這裡夾在有效範圍內，避免 googleMapsLegs[safeLegIndex] 變成 undefined
  const safeLegIndex = Math.min(activeLegIndex, Math.max(0, googleMapsLegs.length - 1));

  // 開啟指定那一段的 Google Maps 導航。
  // 直接開一個新分頁連到真正的 Google Maps（不是嵌入預覽），手機上會直接
  // 跳轉 Google Maps App 並顯示「開始導航」；桌機瀏覽器則開啟 Google Maps
  // 網站，路線跟停靠點都已經帶好，可以直接按「開始」。
  function handleOpenGoogleMapsLeg(legIndex) {
    const leg = googleMapsLegs[legIndex];
    if (!leg) return;
    window.open(buildGoogleMapsUrl(leg), '_blank');
  }

  // 依地圖中心點 + 半徑抓資料（地圖移動時也會重抓）
  //
  // 混合式更新策略：
  // - 停車場／捷運出口／YouBike 這三種通常速度差不多快，一起等齊了
  //   才一次性 setState，讓 React 18 合併成一次重新渲染，減少
  //   react-leaflet-cluster 的 popup 閃爍（issue #38）。
  // - 路邊停車格那支明顯比較慢，獨立處理、不跟前三個綁在一起等，
  //   不然它一慢，會連帶拖累「其實早就查好了」的停車場資料，
  //   變成畫面上什麼都看不到。它多慢就多慢，自己準備好自己更新。
  const fetchAllData = useCallback(async (center) => {
    const requestId = ++requestIdRef.current;

    // 中止上一輪還沒回來的請求，釋放連線給這一輪用
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;

    const { lat, lng } = center;
    const q = `center_lat=${lat}&center_lon=${lng}&radius=${FETCH_RADIUS}`;
    // 路邊停車格只在 zoom >= 16（很近的距離）才會顯示，用比較小的半徑查，
    // 減少隊友那邊要查的資料量，減輕那支 API 很慢的問題
    const qRoadside = `center_lat=${lat}&center_lon=${lng}&radius=${ROADSIDE_FETCH_RADIUS}`;

    // ── 捷運出口：算出結果，不直接 setState ──
    const fetchMrt = async () => {
      const r = await fetch(`/api/MRT/exits?${q}`, { signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const result = await r.json();
      return Array.isArray(result) ? result : [];
    };

    // ── 停車場：算出結果，不直接 setState ──
    const fetchLots = async () => {
      const [lotsResult, dynamicResult] = await Promise.allSettled([
        fetch(`/api/Parking/lots?${q}`, { signal }).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
        fetch(`/api/Parking/lots-dynamic?${q}`, { signal }).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
      ]);

      if (lotsResult.status !== 'fulfilled') {
        throw new Error(String(lotsResult.reason));
      }
      const lots = lotsResult.value;

      let dynamicByPkid = new Map();
      let dynamicWarning = null;
      if (dynamicResult.status === 'fulfilled') {
        dynamicByPkid = new Map(dynamicResult.value.map((d) => [d.pkid, d]));
      } else {
        dynamicWarning = String(dynamicResult.reason);
      }

      // 汽車剩餘車位數（available_car）有特殊代碼，不能直接濾掉或當成 0，
      // 原始數值整個往前送，交給 Map.jsx 解讀：
      //   -9  = 本停車場目前無法提供即時車位數
      //   -11 = 沒有確切格數，但剩餘格位足夠
      //   -12 = 沒有確切格數，剩餘格位不足半數
      //   -13 = 沒有確切格數，剩餘格數嚴重不足
      //   >=0 = 實際剩餘車位數
      //
      // 其他類別（機車/大客車/身心障礙/孕婦/重機）目前沒有拿到類似代碼說明，
      // 先當作「負數 = 沒資料」處理，之後如果隊友也有給這些代碼再一起改
      const validAvail = (v) => (typeof v === 'number' && v >= 0 ? v : null);

      // lat/lon 欄位可能被隊友放反，用模組層級的 fixLatLng 自動校正
      const merged = lots.map((lot) => {
        const dyn = dynamicByPkid.get(lot.pkid) || {};
        const { lat, lng } = fixLatLng(lot.lat, lot.lon);
        return {
          ...lot,
          lat,
          lng,
          available_count:      dyn.available_car ?? lot.available_car ?? null,
          available_motor:      validAvail(dyn.available_motor)      ?? validAvail(lot.available_motor)      ?? 0,
          available_bus:        validAvail(dyn.available_bus)        ?? validAvail(lot.available_bus)        ?? 0,
          available_handicap:   validAvail(dyn.available_handicap)   ?? validAvail(lot.available_handicap)   ?? 0,
          available_pregnancy:  validAvail(dyn.available_pregnancy)  ?? validAvail(lot.available_pregnancy)  ?? 0,
          available_heavymotor: validAvail(dyn.available_heavymotor) ?? validAvail(lot.available_heavymotor) ?? 0,
          updatetime:           dyn.updatetime ?? lot.updatetime,
        };
      });

      return { data: merged, warning: dynamicWarning };
    };

    // ── YouBike：算出結果，不直接 setState ──
    const fetchUbike = async () => {
      const [stationsResult, availResult] = await Promise.allSettled([
        fetch(`/api/Ubike/stations?${q}`, { signal }).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
        fetch(`/api/Ubike/availability?${q}`, { signal }).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
      ]);

      if (stationsResult.status !== 'fulfilled') {
        throw new Error(String(stationsResult.reason));
      }
      const stations = stationsResult.value;

      let availByUid = new Map();
      let availWarning = null;
      if (availResult.status === 'fulfilled') {
        availByUid = new Map(availResult.value.map((a) => [a.station_uid, a]));
      } else {
        availWarning = String(availResult.reason);
      }

      const merged = stations.map((s) => {
        const a = availByUid.get(s.station_uid) || {};
        return {
          ...s,
          available_rent:   a.available_rent   ?? s.available_rent   ?? 0,
          available_return: a.available_return ?? s.available_return ?? 0,
          general_bikes:    a.general_bikes    ?? s.general_bikes    ?? 0,
          electric_bikes:   a.electric_bikes   ?? s.electric_bikes   ?? 0,
          update_time:      a.update_time ?? s.update_time,
        };
      });

      return { data: merged, warning: availWarning };
    };

    // 這三個一起等齊（通常都快，等待時間差不多），等齊後一次套用
    const [mrtRes, lotsRes, ubikeRes] = await Promise.allSettled([
      fetchMrt(),
      fetchLots(),
      fetchUbike(),
    ]);

    if (requestIdRef.current === requestId) {
      // 一次套用，讓 React 18 合併成一次重新渲染；內容沒變就直接跳過
      if (mrtRes.status === 'fulfilled') setIfChanged('mrtExits', setMrtExits, mrtRes.value);
      else setIfChanged('mrtExits', setMrtExits, []);

      if (lotsRes.status === 'fulfilled') setIfChanged('data', setData, lotsRes.value.data);
      else setIfChanged('data', setData, []);

      if (ubikeRes.status === 'fulfilled') setIfChanged('ubikeStations', setUbikeStations, ubikeRes.value.data);
      else setIfChanged('ubikeStations', setUbikeStations, []);

      if (mrtRes.status !== 'fulfilled') {
        addToast('warning', '捷運出口資料載入失敗', `${mrtRes.reason}，部分地圖資訊可能不顯示`);
      }
      if (lotsRes.status !== 'fulfilled') {
        addToast('warning', '停車場資料載入失敗', `${lotsRes.reason}，部分地圖資訊可能不顯示`);
      } else if (lotsRes.value.warning) {
        addToast('warning', '停車場即時車位資料載入失敗', lotsRes.value.warning);
      }
      if (ubikeRes.status !== 'fulfilled') {
        addToast('warning', 'YouBike 站點資料載入失敗', `${ubikeRes.reason}，部分地圖資訊可能不顯示`);
      } else if (ubikeRes.value.warning) {
        addToast('warning', 'YouBike 即時借還資料載入失敗', ubikeRes.value.warning);
      }
    }

    // 路邊停車格：分兩步
    // 1) /api/Parking/roadside-spots（座標/segment_id/space_type/has_charging）
    //    + /api/Parking/roadside-charge（收費時段，用 segment_id 對應）可以平行打
    // 2) /api/Parking/roadside-status 現在改用 pkid 查（逗號分隔多筆），
    //    要先有第 1 步的 pkid 清單才能查，沒辦法跟第 1 步平行
    // 這支明顯比較慢，獨立跑、不跟前三種資料綁在一起等，才不會拖累它們的顯示
    if (ENABLE_ROADSIDE_PARKING) {
      (async () => {
        try {
          const [spotResult, chargeResult] = await Promise.allSettled([
            fetch(`/api/Parking/roadside-spots?${qRoadside}`, { signal }).then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              return r.json();
            }),
            fetch(`/api/Parking/roadside-charge`, { signal }).then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              return r.json();
            }),
          ]);

          if (requestIdRef.current !== requestId) return; // 舊請求，不理它

          if (spotResult.status !== 'fulfilled') {
            addToast('warning', '路邊停車格資料載入失敗', `${spotResult.reason}，部分地圖資訊可能不顯示`);
            setIfChanged('roadsideSpots', setRoadsideSpots, []);
            return;
          }
          const spots = spotResult.value;

          let chargeBySegment = new Map();
          if (chargeResult.status === 'fulfilled') {
            chargeBySegment = new Map(chargeResult.value.map((c) => [c.segment_id, c]));
          } else {
            addToast('warning', '路邊停車收費資料載入失敗', `${chargeResult.reason}，車格仍會顯示但不會顯示收費資訊`);
          }

          // 第 2 步：用第 1 步拿到的 pkid 清單，逗號分隔一次查即時狀態
          let statusByPkid = new Map();
          const pkidList = spots.map((s) => s.pkid).filter(Boolean).join(',');
          if (pkidList) {
            try {
              const statusRes = await fetch(`/api/Parking/roadside-status?pkid=${encodeURIComponent(pkidList)}`, { signal });
              if (!statusRes.ok) throw new Error(`HTTP ${statusRes.status}`);
              const statusData = await statusRes.json();
              statusByPkid = new Map(statusData.map((s) => [s.pkid, s]));
            } catch (err) {
              addToast('warning', '路邊停車格即時狀態載入失敗', `${err.message}，車格仍會顯示但狀態可能不是最新`);
            }
          }

          if (requestIdRef.current !== requestId) return; // 舊請求，不理它

          const rates = rateTableRef.current;

          const merged = spots
            .filter((s) => typeof s.lat === 'number' && typeof s.lon === 'number')
            .map((s) => {
              const st = statusByPkid.get(s.pkid) || {};
              const charge = chargeBySegment.get(s.segment_id);

              // 把收費時段裡的 RateID 換成實際價格（Rates 陣列取第一筆當代表）
              let feeSchedule = [];
              if (charge && Array.isArray(charge.charge_times)) {
                feeSchedule = charge.charge_times
                  .map((ct) => {
                    const rateId = ct.Rates?.[0]?.RateID;
                    const rate = rateId != null ? rates.get(String(rateId)) : null;
                    if (!rate) return null;
                    return {
                      startTime: ct.StartTime,
                      endTime:   ct.EndTime,
                      price:     rate.rate_price,
                      rateName:  rate.rate_name,
                    };
                  })
                  .filter(Boolean);
              }

              return {
                pkid:            s.pkid,
                lat:              s.lat,
                lng:              s.lon,
                segment_id:       s.segment_id,
                segment_name_zh:  charge?.segment_name_zh ?? null,
                space_type:       s.space_type,
                has_charging:     !!s.has_charging,
                status:           String(st.status ?? s.status ?? '0'),
                distance_km:      s.distance_km != null ? parseFloat(s.distance_km) : null,
                update_time:      s.update_time,
                feeSchedule,
              };
            });
          setIfChanged('roadsideSpots', setRoadsideSpots, merged);
        } catch (err) {
          if (requestIdRef.current !== requestId) return;
          if (err.name !== 'AbortError') {
            addToast('warning', '路邊停車格資料載入失敗', `${err.message}，部分地圖資訊可能不顯示`);
            setIfChanged('roadsideSpots', setRoadsideSpots, []);
          }
        }
      })();
    } else {
      setIfChanged('roadsideSpots', setRoadsideSpots, []);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 地圖移動結束後，debounce 800ms 再重抓（避免拖動時一直打 API）
  // 上一次真正拿去打 API 的地圖中心點，用來過濾掉太小的移動
  // （例如點 marker 開 popup 時 Leaflet 的 autoPan 只是輕輕挪一下地圖，
  // 這種小幅移動不需要重抓資料，不然會一直循環：開 popup → autoPan →
  // moveend → 重抓資料 → 重新渲染 marker → 又觸發一次 moveend）
  const lastFetchCenterRef = useRef(null);
  const MIN_MOVE_DEGREES = 0.001; // 約 100 公尺，小於這個距離不重抓

  const handleMapMove = useCallback((center) => {
    const last = lastFetchCenterRef.current;
    if (last) {
      const moved = Math.abs(center.lat - last.lat) + Math.abs(center.lng - last.lng);
      if (moved < MIN_MOVE_DEGREES) return; // 移動太小（很可能是 autoPan），不重抓
    }

    if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
    fetchDebounceRef.current = setTimeout(() => {
      lastFetchCenterRef.current = center;
      fetchAllData(center);
    }, 800);
  }, [fetchAllData]);

  // 初始載入：以台北市中心為預設
  useEffect(() => {
    // fetchAllData 裡面的 setState 全部包在 fetch().then() 裡（非同步），
    // 不是規則真正要抓的「effect body 裡同步呼叫 setState」，這是已知的
    // lint 誤判（react-hooks/set-state-in-effect 目前對這種「呼叫外部函式，
    // 內部才非同步 setState」的寫法沒辦法正確判斷）
    const initialCenter = { lat: 25.0330, lng: 121.5654 };
    lastFetchCenterRef.current = initialCenter;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAllData(initialCenter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBugSubmit = useCallback(async ({ description, contact }) => {
    try {
      const res = await fetch('/api/error-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: description,
          userEmail: contact || 'user@example.com',
          userAgent: navigator.userAgent,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const result = await res.json();
      addToast('success', result.message || '回報已送出', result.reportId ? `編號 #${result.reportId}` : '');
      // 不在這裡關 modal，讓 BugReportModal 自己顯示「已送出」畫面，
      // 使用者按「關閉」才真的關掉（onClose 會處理 setBugModalOpen(false)）
    } catch (err) {
      addToast('warning', '回報送出失敗', err.message);
      throw err; // 往外拋，讓 BugReportModal 知道失敗，不要顯示「已送出」
    }
  }, [addToast]);

  // 面板外殼：手機用抽屜、電腦用可拖曳面板，裡面的步驟內容兩邊共用
  const PanelShell = isMobile ? MobileDrawer : DraggablePanel;
  const panelShellProps = isMobile
    ? { open: drawerOpen, onToggle: () => setDrawerOpen((o) => !o) }
    : {};

  return (
    <div style={{ position: 'relative' }}>
      {/* 免責聲明 Modal */}
      {disclaimerOpen && (
        <DisclaimerModal onClose={() => setDisclaimerOpen(false)} />
      )}

      {/* Bug 回報 Modal */}
      {bugModalOpen && (
        <BugReportModal
          onClose={() => { setBugModalOpen(false); setBugPrefill(''); }}
          onSubmit={handleBugSubmit}
          prefillError={bugPrefill}
        />
      )}

      {/* 蓋在最上層的資訊欄 */}
      {isMobile !== null && (
      <PanelShell {...panelShellProps}>
        <StepIndicator
          steps={PANEL_STEPS}
          current={panelStep}
          onStepClick={setPanelStep}
        />

        {/* 每一步的內容都保持掛載、只用 display 切換，
            這樣 SearchInput 之類元件內部的輸入文字不會因為切換步驟而被清掉 */}

        {/* ── 第 1 步：起訖點 ── */}
        <div style={{ display: stepId === 'route' ? 'block' : 'none' }}>
          <SearchInput
            label="起點"
            value={start}
            onSelect={setStart}
            onError={addToast}
          />
          <SearchInput
            label="終點"
            value={end}
            onSelect={setEnd}
            onError={addToast}
          />
        </div>

        {/* ── 第 2 步：停車條件 ── */}
        <div style={{ display: stepId === 'condition' ? 'block' : 'none' }}>
          <PreferenceToggle
            label="想停哪一種"
            value={parkingType}
            onChange={handleParkingTypeChange}
            options={[
              { value: 'roadside', label: '路邊停車格' },
              { value: 'lot', label: '停車場' },
            ]}
          />
          {parkingType === 'lot' && (
            <div style={{ fontSize: 11, color: STEP_COLORS.muted, marginTop: 6, marginBottom: 14, lineHeight: 1.5 }}>
              選停車場的話，填完接駁方式後，會列出終點附近的停車場讓你自己挑一座。
            </div>
          )}

          <DistanceLimitInput
            label="可接受的最遠距離"
            value={maxDistance}
            onChange={setMaxDistance}
          />

          {/* 選停車場時，停車場由使用者自己指定，不需要費率／車位優先 */}
          {parkingType !== 'lot' && (
            <PreferenceToggle
              label="費率優先還是車位優先"
              value={priorityMode}
              onChange={handlePriorityModeChange}
              options={[
                { value: 'space', label: '車位優先' },
                { value: 'rate', label: '費率優先' },
              ]}
            />
          )}

          {parkingType !== 'lot' && priorityMode === 'rate' && (
            <PriceLimitInput
              label="每小時費率上限"
              value={maxPrice}
              onChange={setMaxPrice}
            />
          )}
        </div>

        {/* ── 第 3 步：接駁方式 ── */}
        <div style={{ display: stepId === 'transfer' ? 'block' : 'none' }}>
          <CheckboxGroup
            label="停車後的接駁方式（可複選）"
            values={transportModes}
            onToggle={handleTransportModeToggle}
            options={[
              { value: 'ubike', label: 'YouBike' },
              { value: 'mrt', label: '捷運' },
            ]}
          />
          <div style={{ fontSize: 11, color: STEP_COLORS.muted, marginTop: 6, marginBottom: 14, lineHeight: 1.5 }}>
            都不勾選代表停好車後直接走路到目的地。
          </div>

          {transportModes.includes('mrt') && (
            <DistanceLimitInput
              label="捷運接駁距離"
              value={mrtDistance}
              onChange={setMrtDistance}
            />
          )}
          {transportModes.includes('ubike') && (
            <DistanceLimitInput
              label="YouBike 接駁距離"
              value={ubikeDistance}
              onChange={setUbikeDistance}
            />
          )}
        </div>

        {/* ── 選擇停車場（只有停車類型選「停車場」時才會有這一步）── */}
        {parkingType === 'lot' && (
          <div style={{ display: stepId === 'lot' ? 'block' : 'none' }}>
            <div style={{ fontSize: 12, color: STEP_COLORS.muted, lineHeight: 1.5, marginBottom: 8 }}>
              終點 {lotRadiusMeters} 公尺內的停車場，請選一座：
            </div>

            {lotsLoading && (
              <div style={{ fontSize: 12, color: STEP_COLORS.muted, padding: '12px 0', textAlign: 'center' }}>
                載入停車場中…
              </div>
            )}
            {!lotsLoading && lotsError && (
              <div style={{ fontSize: 12, color: STEP_COLORS.muted, padding: '12px 0', textAlign: 'center' }}>
                停車場載入失敗（{lotsError}），請稍後再試。
              </div>
            )}
            {!lotsLoading && !lotsError && lotCandidates.length === 0 && (
              <div style={{ fontSize: 12, color: STEP_COLORS.muted, padding: '12px 0', textAlign: 'center' }}>
                範圍內沒有停車場，請回上一步調高接駁距離。
              </div>
            )}

            {!lotsLoading && lotCandidates.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                {lotCandidates.map((lot) => {
                  const selected = lot.pkid === selectedLotId;
                  return (
                    <button
                      key={lot.pkid}
                      onClick={() => setSelectedLotId(lot.pkid)}
                      style={{
                        textAlign: 'left',
                        padding: '8px 10px',
                        fontSize: 13,
                        lineHeight: 1.5,
                        color: STEP_COLORS.text,
                        background: selected ? 'rgba(102, 125, 157, 0.22)' : 'transparent',
                        border: `1px solid ${selected ? STEP_COLORS.accent : STEP_COLORS.line}`,
                        borderRadius: 8,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: selected ? 700 : 500 }}>{lot.name}</div>
                      <div style={{ fontSize: 11, color: STEP_COLORS.muted }}>
                        距終點約 {Math.round(lot.distanceMeters)} 公尺　剩餘汽車位：{formatCarAvailability(lot.available_count)}
                      </div>
                      {lot.payex && (
                        <div style={{ fontSize: 11, color: STEP_COLORS.muted }}>{lot.payex}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── 確認條件 + 規劃路線 ── */}
        <div style={{ display: stepId === 'plan' ? 'block' : 'none' }}>
          <div
            style={{
              border: `1px solid ${STEP_COLORS.line}`,
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: 12,
              lineHeight: 1.8,
            }}
          >
            {conditionSummary.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                {/* 標籤固定寬度、不換行，避免被長地址擠成直排（起/點） */}
                <span style={{ color: STEP_COLORS.muted, whiteSpace: 'nowrap', flexShrink: 0 }}>{k}</span>
                {/* 值只顯示一行，太長的尾巴（郵遞區號、臺灣…）用 … 省略；
                    滑鼠移上去（title）可以看到完整地址 */}
                <span
                  title={v}
                  style={{
                    color: STEP_COLORS.text,
                    textAlign: 'right',
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>

          <PrimaryButton
            onClick={handlePlanRoute}
            disabled={isPlanning}
            style={{ marginTop: 10, padding: '10px 4px', fontSize: 13 }}
          >
            {isPlanning ? '規劃中...' : '▶ 開始規劃路線'}
          </PrimaryButton>
        </div>

        {/* ── 第 5 步：路線結果（規劃成功後自動跳到這頁）── */}
        <div style={{ display: stepId === 'result' ? 'block' : 'none' }}>
          {activeRoute ? (
            <>
              {/* 路線圖例：每條路線的顏色跟地圖上的線一致；點一下就切換成這條，
                  下面的距離／車位統計和 Google Maps 導航都會跟著換成選中的路線 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
                {routeResult.routes.map((route, idx) => {
                  const selected = idx === selectedRouteIndex;
                  const color = getRouteColor(route, idx);
                  return (
                    <button
                      key={route.route_index ?? idx}
                      onClick={() => {
                        if (!route.available) return;
                        setSelectedRouteIndex(idx);
                        setActiveLegIndex(0);
                      }}
                      disabled={!route.available}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 10px',
                        fontSize: 13,
                        textAlign: 'left',
                        color: !route.available ? '#3B4A63' : '#ECECEC',
                        background: selected ? 'rgba(102, 125, 157, 0.22)' : 'transparent',
                        border: `1px solid ${selected ? color : '#16254F'}`,
                        borderRadius: 8,
                        cursor: route.available ? 'pointer' : 'not-allowed',
                      }}
                    >
                      <span
                        style={{
                          width: 22,
                          height: 5,
                          borderRadius: 3,
                          background: route.available ? color : '#3B4A63',
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ flex: 1, fontWeight: selected ? 700 : 500 }}>
                        {route.mode_name}
                        {!route.available ? '（無路線）' : ''}
                      </span>
                      {route.available && route.summary?.totalDistanceMeters != null && (
                        <span style={{ fontSize: 11, color: '#ACBBC6' }}>
                          {(route.summary.totalDistanceMeters / 1000).toFixed(1)} 公里
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <RouteSummary summary={activeRoute.summary} />

              {/* 路線轉折點較多時，Google Maps 單次最多支援 10 個停靠站，
                  會自動切成多段，這裡選第幾段，按 Maps 就開啟那一段的導航 */}
              {googleMapsLegs.length > 1 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, color: '#ACBBC6', marginBottom: 6, lineHeight: 1.5 }}>
                    路線轉折點較多，Google Maps 單次最多支援 10 個停靠站，
                    已自動切成 {googleMapsLegs.length} 段，請選擇要導航哪一段。
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => setActiveLegIndex((i) => Math.max(0, i - 1))}
                      disabled={safeLegIndex === 0}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        border: '1px solid #16254F',
                        background: 'transparent',
                        color: safeLegIndex === 0 ? '#3B4A63' : '#ECECEC',
                        cursor: safeLegIndex === 0 ? 'not-allowed' : 'pointer',
                        fontSize: 14,
                      }}
                    >
                      ←
                    </button>
                    <div style={{ flex: 1, textAlign: 'center', fontSize: 13, color: '#ECECEC' }}>
                      第 {safeLegIndex + 1} / {googleMapsLegs.length} 段
                    </div>
                    <button
                      onClick={() =>
                        setActiveLegIndex((i) => Math.min(googleMapsLegs.length - 1, i + 1))
                      }
                      disabled={safeLegIndex === googleMapsLegs.length - 1}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        border: '1px solid #16254F',
                        background: 'transparent',
                        color: safeLegIndex === googleMapsLegs.length - 1 ? '#3B4A63' : '#ECECEC',
                        cursor: safeLegIndex === googleMapsLegs.length - 1 ? 'not-allowed' : 'pointer',
                        fontSize: 14,
                      }}
                    >
                      →
                    </button>
                  </div>
                </div>
              )}

              {/* 開啟 Google Maps 導航（多段時開的是上面選的那一段） */}
              <SecondaryButton
                onClick={() => handleOpenGoogleMapsLeg(safeLegIndex)}
                style={{ marginTop: 10, padding: '10px 4px', fontSize: 13 }}
              >
                <img
                  src="https://www.google.com/images/branding/product/ico/maps15_bnuw3a_32dp.ico"
                  width="16"
                  height="16"
                  style={{ marginRight: 4, verticalAlign: 'middle' }}
                  alt=""
                />
                {googleMapsLegs.length > 1
                  ? `用 Google Maps 導航第 ${safeLegIndex + 1} 段`
                  : '用 Google Maps 導航'}
              </SecondaryButton>
            </>
          ) : (
            <div style={{ fontSize: 12, color: STEP_COLORS.muted, textAlign: 'center', padding: '16px 0' }}>
              還沒有路線結果，請回上一步按「開始規劃路線」。
            </div>
          )}
        </div>

        {/* 不能前進時，告訴使用者還缺什麼 */}
        {stepBlocker && panelStep < RESULT_STEP && (
          <div style={{ fontSize: 11, color: STEP_COLORS.muted, marginTop: 10 }}>
            ⓘ {stepBlocker}
          </div>
        )}

        <StepNav
          current={panelStep}
          total={PANEL_STEPS.length}
          onPrev={goPrevStep}
          onNext={goNextStep}
          nextDisabled={!!stepBlocker}
        />
      </PanelShell>
      )}

      {/* 右下角浮動按鈕群 */}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          alignItems: 'center',
        }}
      >
        {/* 免責聲明按鈕 */}
        <button
          onClick={() => setDisclaimerOpen(true)}
          title="使用聲明"
          aria-label="使用聲明"
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'rgba(6, 8, 23, 0.92)',
            border: '1px solid rgba(102, 125, 157, 0.45)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(8px)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.12)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.5)';
            e.currentTarget.style.borderColor = 'rgba(172, 187, 198, 0.7)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.4)';
            e.currentTarget.style.borderColor = 'rgba(102, 125, 157, 0.45)';
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1.12)')}
        >
          <img
            src="/disclaimer-icon.png"
            alt="使用聲明"
            style={{ width: 24, height: 24, objectFit: 'contain', display: 'block' }}
          />
        </button>

        {/* 回報問題按鈕 */}
        <button
          onClick={() => setBugModalOpen(true)}
          title="回報問題"
          aria-label="回報問題"
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: 'rgba(6, 8, 23, 0.92)',
            border: '1px solid rgba(102, 125, 157, 0.45)',
            boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(8px)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.12)';
            e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.5)';
            e.currentTarget.style.borderColor = 'rgba(172, 187, 198, 0.7)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.4)';
            e.currentTarget.style.borderColor = 'rgba(102, 125, 157, 0.45)';
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1.12)')}
        >
          <img
            src="/bug-report-icon.png"
            alt="回報問題"
            style={{ width: 24, height: 24, objectFit: 'contain', display: 'block' }}
          />
        </button>
      </div>

      <MapView
        data={data}
        roadsideSpots={roadsideSpots}
        ubikeStations={ubikeStations}
        mrtExits={mrtExits}
        start={start}
        end={end}
        priorityMode={priorityMode}
        routes={routeResult?.routes || []}
        selectedRouteIndex={selectedRouteIndex}
        /* 選擇停車場那一步時，地圖畫出搜尋範圍圓圈；選好的停車場一直用醒目圖示標出 */
        lotSearch={
          parkingType === 'lot' && stepId === 'lot' && end && lotRadiusMeters > 0
            ? { center: { lat: end.lat, lng: end.lng }, radius: lotRadiusMeters }
            : null
        }
        selectedLot={parkingType === 'lot' ? selectedLot : null}
        onMapMove={handleMapMove}
      />

      {/* Toast 容器：放在最後渲染，確保一定畫在所有圖層最上面 */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}