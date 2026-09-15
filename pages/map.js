import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';

// ── 頁面外部資源 ─────────────────────────────────────────────────
import { mockRouteResult } from './lib/mockRouteResult';
import { toCoords, splitRouteIntoLegs, buildGoogleMapsUrl, transportModesToString } from './lib/routeUtils';
import { useToast } from './hooks/useToast';

// ── UI 元件 ──────────────────────────────────────────────────────
import { SearchInput } from './components/ui/SearchInput';
import { PreferenceToggle } from './components/ui/PreferenceToggle';
import { CheckboxGroup } from './components/ui/CheckboxGroup';
import { PriceLimitInput } from './components/ui/PriceLimitInput';
import { DistanceLimitInput } from './components/ui/DistanceLimitInput';
import { PrimaryButton, SecondaryButton } from './components/ui/Buttons';
import { RouteSummary } from './components/ui/RouteSummary';
import { DraggablePanel } from './components/ui/DraggablePanel';
import { ToastContainer } from './components/Toast';
import { DisclaimerModal } from './components/DisclaimerModal';
import { BugReportModal } from './components/BugReportModal';

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
  const [priorityMode, setPriorityMode] = useState('space');
  const [maxPrice, setMaxPrice] = useState('');
  const [routeResult, setRouteResult] = useState(null);
  const [ubikeStations, setUbikeStations] = useState([]);
  const [mrtExits, setMrtExits] = useState([]);
  const [isPlanning, setIsPlanning] = useState(false);
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

  function buildPayload() {
    const payload = {
      priorityMode,
      start: toCoords(start),
      end: toCoords(end),
      maxRate: Number(maxPrice) || 0,
      transportMode: transportModesToString(transportModes),
      maxDistance: Number(maxDistance) || 0,
    };
    return payload;
  }

  // 測試用：直接載入寫死的假資料，讓「畫路線」跟「Google Maps 轉折點」這兩個功能
  // 不用等真正的演算法接通也能測試，routeResult 一旦有值，後面的邏輯就跟真實情況完全一樣
  function handleLoadMockRoute() {
    setRouteResult(mockRouteResult);
    addToast('info', '測試模式', '已載入假資料路線，可以測試地圖繪製與 Google Maps 功能');
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
    if (priorityMode === 'rate' && !maxPrice) {
      addToast('warning', '請輸入費率上限', '已選擇「費率優先」，請填入每小時可接受的最高費率');
      return;
    }
    if (priorityMode === 'rate' && Number(maxPrice) <= 0) {
      addToast('warning', '費率上限無效', '費率上限必須大於 0');
      return;
    }

    setIsPlanning(true);
    try {
      const payload = buildPayload();
      console.log('送給演算法的 JSON:', payload); // 開發測試用：F12 → Console 可以看到完整內容
      console.log('可直接複製的字串:', JSON.stringify(payload, null, 2));

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

      const result = await response.json();
      setRouteResult(result);
      console.log('路線規劃完成:', `找到 ${result.summary?.totalAvailableSpaces ?? 0} 個沿路可用車位`);

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

  // 把目前的路線結果切成多段（每段都在 Google Maps 的 10 站上限內）
  // 只有在真的超過上限時才會超過 1 段，一般情況下 googleMapsLegs.length === 1
  const googleMapsLegs = useMemo(() => {
    if (!routeResult?.routeGeometry) return [];
    return splitRouteIntoLegs(routeResult.routeGeometry, 10);
  }, [routeResult]);

  // 開啟指定那一段的 Google Maps 導航；每次都是使用者親自點擊觸發，符合瀏覽器對開新分頁的要求
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

      // 隊友的 /api/parking/lots 有時候 lat/lon 兩個欄位會反過來
      // （例如 lon 欄位裡放的其實是緯度）。台灣緯度大約在 21~26 之間、
      // 經度大約在 118~123 之間，用這個範圍自動偵測、抓反就自動校正，
      // 這樣不管隊友那邊之後有沒有修，這段都不會誤判
      const fixLatLng = (lat, lon) => {
        const looksLikeLat = (v) => typeof v === 'number' && v >= 20 && v <= 27;
        const looksLikeLon = (v) => typeof v === 'number' && v >= 117 && v <= 123;
        if (looksLikeLon(lat) && looksLikeLat(lon)) {
          return { lat: lon, lng: lat }; // 反了，校正回來
        }
        return { lat, lng: lon }; // 正常
      };

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
      // 一次套用，讓 React 18 合併成一次重新渲染
      if (mrtRes.status === 'fulfilled') setMrtExits(mrtRes.value);
      else setMrtExits([]);

      if (lotsRes.status === 'fulfilled') setData(lotsRes.value.data);
      else setData([]);

      if (ubikeRes.status === 'fulfilled') setUbikeStations(ubikeRes.value.data);
      else setUbikeStations([]);

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
            setRoadsideSpots([]);
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
          setRoadsideSpots(merged);
        } catch (err) {
          if (requestIdRef.current !== requestId) return;
          if (err.name !== 'AbortError') {
            addToast('warning', '路邊停車格資料載入失敗', `${err.message}，部分地圖資訊可能不顯示`);
            setRoadsideSpots([]);
          }
        }
      })();
    } else {
      setRoadsideSpots([]);
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
      <DraggablePanel>
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
        
        <DistanceLimitInput
          label="可接受的最遠距離"
          value={maxDistance}
          onChange={setMaxDistance}
        />

        <PreferenceToggle
          label="費率優先還是車位優先"
          value={priorityMode}
          onChange={handlePriorityModeChange}
          options={[
            { value: 'space', label: '車位優先' },
            { value: 'rate', label: '費率優先' },
          ]}
        />

        {priorityMode === 'rate' && (
          <PriceLimitInput
            label="每小時費率上限"
            value={maxPrice}
            onChange={setMaxPrice}
          />
        )}

        <CheckboxGroup
          label="停車後的接駁方式（可複選）"
          values={transportModes}
          onToggle={handleTransportModeToggle}
          options={[
            { value: 'ubike', label: 'YouBike' },
            { value: 'mrt', label: '捷運' },
          ]}
        />

        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <PrimaryButton
            onClick={handlePlanRoute}
            disabled={isPlanning}
            style={{ marginTop: 0, padding: '10px 4px', fontSize: 13, width: 'auto', flex: 1 }}
          >
            {isPlanning ? '⏳' : '▶ 開始規劃路線'}
          </PrimaryButton>

          <SecondaryButton
            onClick={handleLoadMockRoute}
            style={{ marginTop: 0, padding: '10px 4px', fontSize: 13, width: 'auto', flex: 1 }}
          >
            測試
          </SecondaryButton>

          {googleMapsLegs.length <= 1 && (
            <SecondaryButton
              onClick={() => handleOpenGoogleMapsLeg(0)}
              disabled={!routeResult}
              style={{ marginTop: 0, padding: '10px 4px', fontSize: 13, width: 'auto', flex: 1 }}
            >
              <img
                src="https://www.google.com/images/branding/product/ico/maps15_bnuw3a_32dp.ico"
                width="16"
                height="16"
                style={{ marginRight: 4, verticalAlign: 'middle' }}
                alt=""
              />
              Maps
            </SecondaryButton>
          )}
        </div>

        {googleMapsLegs.length > 1 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: '#ACBBC6', marginBottom: 6, lineHeight: 1.5 }}>
              路線轉折點較多，Google Maps 單次最多支援 10 個停靠站，
              已自動切成 {googleMapsLegs.length} 段。請走完一段後手動點開下一段。
            </div>
            {googleMapsLegs.map((leg, index) => (
              <SecondaryButton
                key={index}
                onClick={() => handleOpenGoogleMapsLeg(index)}
                disabled={!routeResult}
                style={{ marginBottom: 6 }}
              >
                <img
                  src="https://www.google.com/images/branding/product/ico/maps15_bnuw3a_32dp.ico"
                  width="16"
                  height="16"
                  style={{ marginRight: 6, verticalAlign: 'middle' }}
                  alt=""
                />
                第 {index + 1}/{googleMapsLegs.length} 段
              </SecondaryButton>
            ))}
          </div>
        )}
      </DraggablePanel>

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
        routeResult={routeResult}
        onMapMove={handleMapMove}
      />

      {/* Toast 容器：放在最後渲染，確保一定畫在所有圖層最上面 */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}