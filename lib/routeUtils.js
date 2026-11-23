// 把 { name, lat, lng } 精簡成只剩經緯度，送給後端不需要地址文字
// 注意：輸出的欄位名稱是 lon（不是 lng），對齊隊友那邊約定的格式
export function toCoords(point) {
  if (!point) return null;
  return { lat: point.lat, lon: point.lng };
}

// 計算 A→B 這段路的方位角（0~360 度，正北為 0）
export function bearing(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// 找出路線中「真正有轉彎」的點：比較每個點前後兩段路的方位角差異，
// 差異超過 turnThresholdDeg 才算是明顯轉彎，單純同一直線上的密集座標點會被忽略。
// 這樣挑出來的點通常天生就遠少於 maxWaypoints，比死板的等距取樣更貼近實際路況。
export function findTurningPoints(routeGeometry, turnThresholdDeg = 25) {
  if (!routeGeometry || routeGeometry.length <= 2) return [];

  const turns = [];
  for (let i = 1; i < routeGeometry.length - 1; i++) {
    const prev = routeGeometry[i - 1];
    const curr = routeGeometry[i];
    const next = routeGeometry[i + 1];

    const bearingIn = bearing(prev, curr);
    const bearingOut = bearing(curr, next);
    let diff = Math.abs(bearingOut - bearingIn);
    if (diff > 180) diff = 360 - diff; // 處理角度環繞（例如 350° 跟 10° 其實只差 20°）

    if (diff >= turnThresholdDeg) {
      turns.push(curr);
    }
  }
  return turns;
}

// 把路線壓縮成適合放進 Google Maps 網址的轉折點：
// 1. 優先挑出「真正轉彎」的點（見 findTurningPoints）
// 2. 如果轉彎點數量還是超過上限（例如路線很曲折），才退而求其次用等距取樣再壓縮一次
export function sampleWaypoints(routeGeometry, maxWaypoints = 8) {
  if (!routeGeometry || routeGeometry.length <= 2) return [];

  const turningPoints = findTurningPoints(routeGeometry);

  // 如果偵測到的轉彎點已經在上限內，直接使用，這是最貼近實際路況的結果
  if (turningPoints.length > 0 && turningPoints.length <= maxWaypoints) {
    return turningPoints;
  }

  // 轉彎點太多，或完全沒偵測到轉彎（例如筆直的路），退回等距取樣當備援
  const fallbackSource = turningPoints.length > 0 ? turningPoints : routeGeometry.slice(1, -1);
  if (fallbackSource.length <= maxWaypoints) return fallbackSource;

  const step = Math.ceil(fallbackSource.length / maxWaypoints);
  return fallbackSource.filter((_, index) => index % step === 0);
}

// 把完整路線（起點 + 所有轉折點 + 終點）切成多段，每段最多 maxStopsPerLeg 個停靠點
// （Google Maps 一次最多接受 10 個停靠站：起點 + 終點 + 最多 8 個中繼點）
// 段與段之間會「共用交界點」：第一段的終點 = 第二段的起點，確保路線接得起來
export function splitRouteIntoLegs(routeGeometry, maxStopsPerLeg = 10) {
  if (!routeGeometry || routeGeometry.length < 2) return [];

  const turningPoints = findTurningPoints(routeGeometry);
  const fullStops = [routeGeometry[0], ...turningPoints, routeGeometry[routeGeometry.length - 1]];
  return splitStopsIntoLegs(fullStops, maxStopsPerLeg);
}

// 把一串「已經決定好」的停靠點切成多段，每段最多 maxStopsPerLeg 個（規則同上）
export function splitStopsIntoLegs(fullStops, maxStopsPerLeg = 10) {
  if (!fullStops || fullStops.length < 2) return [];

  if (fullStops.length <= maxStopsPerLeg) {
    return [fullStops]; // 一段就夠，不用切
  }

  const newPointsPerLeg = maxStopsPerLeg - 1;
  const legs = [];
  let cursor = 0;

  while (cursor < fullStops.length - 1) {
    const legEnd = Math.min(cursor + newPointsPerLeg, fullStops.length - 1);
    legs.push(fullStops.slice(cursor, legEnd + 1));
    cursor = legEnd; // 下一段從這一段的終點開始，達成交界點共用
  }

  return legs;
}

// ── 「起點 → 終點」交給 Google、「終點之後」照演算法 ──
// 三種路線（純開車、捷運轉乘、YouBike 轉乘）都是先開到終點放人，再由演算法決定之後怎麼開：
//   - 純開車：終點 → 在附近繞圈找車位
//   - 捷運／YouBike 轉乘：終點 → 開到外圍的上車站／借車站附近停車（駕駛再搭捷運／騎車回來）
// 演算法回傳的 routeGeometry 也是從終點附近開始畫的，所以「起點 → 終點」一律交給 Google。
//
// 拆出這次路線的幾個關鍵點；看不出這種結構（沒有起點或終點）就回傳 null
function getRouteLegs(route) {
  if (!route) return null;
  const geometry = route.routeGeometry || [];
  const waypoints = route.waypoints || [];
  const destWp = waypoints.find((w) => w.type === 'destination');
  if (geometry.length < 2 || !waypoints[0] || waypoints[0].type !== 'start' || !destWp) return null;

  const destPt = pickLatLng(destWp);
  const splitIndex = findDestinationIndex(geometry, destPt);

  // 開車要開到哪裡為止：
  //   純開車 → 演算法路線的最後一點（繞路終點／停車位）
  //   轉乘   → 停車位（type 是 roadside／lot），停好車之後就改搭捷運／騎 YouBike，不用再導航
  let endIndex = geometry.length - 1;
  if (route.mode !== 'drive') {
    const parkingWp = waypoints.find((w) => w.type === 'roadside' || w.type === 'lot' || w.type === 'parking');
    if (parkingWp) endIndex = Math.max(splitIndex, findNearestIndex(geometry, parkingWp, splitIndex));
  }

  return {
    startPt: pickLatLng(waypoints[0]),
    destPt,
    splitIndex,
    endIndex,
    endPt: pickLatLng(geometry[endIndex]),
  };
}

// Google Maps 導航停靠點：[起點, 終點, ...終點之後演算法路線的轉彎點, 開車終點]
//   1. 起點 → 終點：只給 Google 起點和終點，讓 Google Maps 自己算路
//      （以前整條線都拿轉彎點去湊，常常被切成 5～8 段導航）
//   2. 終點之後：照隊友演算法的路線走，用它的轉彎點當中繼點
//      （只給停車位座標的話，Google 會直接走最短路，不會照演算法的路線開）
// 看不出路線結構時回傳 null，由呼叫端退回舊做法（整條 routeGeometry 取轉彎點）。
export function buildNavigationStops(route) {
  const legs = getRouteLegs(route);
  if (!legs) return null;
  return [legs.startPt, legs.destPt, ...getAfterDestTurningPoints(route, legs), legs.endPt];
}

// 終點之後那一段的轉彎點。
// TODO：隊友之後會直接在回傳裡提供這一段的轉彎點，到時候改成直接回傳那個欄位，
// 例如 `if (route.<隊友的欄位>?.length) return route.<隊友的欄位>.map(pickLatLng);`
// 目前先從 routeGeometry 裡「終點 → 開車終點」的部分自己找轉彎點。
function getAfterDestTurningPoints(route, legs) {
  const segment = route.routeGeometry.slice(legs.splitIndex, legs.endIndex + 1);
  return findTurningPoints(segment).map(pickLatLng);
}

// 從 fromIndex 開始，找路線上離 pt 最近的點
function findNearestIndex(geometry, pt, fromIndex = 0) {
  let best = fromIndex;
  let bestDist = Infinity;
  for (let i = fromIndex; i < geometry.length; i++) {
    const d = Math.hypot(geometry[i].lat - pt.lat, geometry[i].lng - pt.lng);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

// 在路線座標裡找「經過終點」的位置。終點本身常常不在路上（例如在建築物裡），
// 所以找最靠近的點；繞圈找車位的路線可能會再經過終點附近，
// 取「跟最近距離差不多近（約 30 公尺內）的第一個點」，避免切到後面繞回來的那次
export function findDestinationIndex(geometry, destPt) {
  const dist = (p) => Math.hypot(p.lat - destPt.lat, p.lng - destPt.lng);
  let minDist = Infinity;
  for (const p of geometry) minDist = Math.min(minDist, dist(p));
  const tolerance = 0.0003; // 經緯度約 30 公尺
  const idx = geometry.findIndex((p) => dist(p) <= minDist + tolerance);
  return idx >= 0 ? idx : 0;
}

function pickLatLng(p) {
  return { lat: p.lat, lng: p.lng };
}

// 路線在「地圖上」的畫法（三種路線都一樣）：起點 → 終點換成 Google Maps 推薦的路線（googlePath），
// 終點之後維持演算法算的那段。跟導航的組法一致（見 buildNavigationStops）。
// 看不出路線結構、或沒有 Google 路線時，原樣回傳。
export function withGoogleStartLeg(route, googlePath) {
  if (!googlePath?.length) return route;
  const legs = getRouteLegs(route);
  if (!legs) return route;
  return { ...route, routeGeometry: [...googlePath, ...route.routeGeometry.slice(legs.splitIndex)] };
}

// 把一段停靠點（[起點, ...中繼點, 終點]）組成 Google Maps 導航網址
export function buildGoogleMapsUrl(leg) {
  const origin = `${leg[0].lat},${leg[0].lng}`;
  const destination = `${leg[leg.length - 1].lat},${leg[leg.length - 1].lng}`;
  const waypoints = leg.slice(1, -1).map((p) => `${p.lat},${p.lng}`).join('|');

  const params = new URLSearchParams({ api: '1', origin, destination, travelmode: 'driving' });
  if (waypoints) params.set('waypoints', waypoints);

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

// 隊友的演算法後端改版後，routes[].waypoints / routeGeometry / alongRouteParkings，
// 還有 transfer_stations 裡的 board/alight，座標欄位全部從 lng 改成 lon。
// 這裡統一轉換成 App 其他地方（尤其是 Map.jsx）慣用的 lat/lng 命名，
// 這樣只有這個檔案要認得 lon 這個欄位名稱，其他地方完全不用改。
// 同時也相容舊格式（如果某個點本來就有 lng，直接沿用，不會被 lon 覆蓋掉）。
function toLatLng(point) {
  if (!point) return point;
  const { lon, ...rest } = point;
  return { ...rest, lng: point.lng ?? lon };
}

function normalizeRoute(route) {
  if (!route) return route;
  return {
    ...route,
    waypoints: (route.waypoints || []).map(toLatLng),
    routeGeometry: (route.routeGeometry || []).map(toLatLng),
    alongRouteParkings: (route.alongRouteParkings || []).map(toLatLng),
  };
}

function normalizeStation(station) {
  if (!station) return station;
  return {
    board: toLatLng(station.board),
    alight: toLatLng(station.alight),
  };
}

// 把後端新版「多路線」回傳格式整個轉換成前端慣用的 lat/lng 命名。
// 新格式長這樣：
//   {
//     status, message?,
//     summary: { transportMode, total_routes, available_routes },  // 這是「整批」的摘要
//     transfer_stations: { mrt?: {board, alight}, ubike?: {board, alight} },
//     routes: [
//       { route_index, mode: "drive"|"mrt"|"ubike", mode_name, available,
//         summary: {...},   // 這是「這一條路線自己」的摘要，跟上面那個 summary 不是同一個東西
//         waypoints, routeGeometry, alongRouteParkings },
//       ...
//     ]
//   }
// 呼叫端要自己從 routes[] 裡挑一條（通常是第一條 available 的）當作「目前顯示的路線」，
// 傳給 MapView 的 routeResult 其實是挑出來的那一條，不是整包原始回應。
export function normalizeRouteResult(raw) {
  if (!raw) return raw;
  return {
    ...raw,
    routes: (raw.routes || []).map(normalizeRoute),
    transfer_stations: raw.transfer_stations
      ? {
          mrt: normalizeStation(raw.transfer_stations.mrt),
          ubike: normalizeStation(raw.transfer_stations.ubike),
        }
      : undefined,
  };
}

// 把「接駁方式」的複選結果（陣列）轉成單一字串：
// 兩個都選 → "both"；都沒選 → "none"；只選一個 → 該選項本身的值（"ubike" 或 "mrt"）
export function transportModesToString(modes) {
  if (modes.includes('ubike') && modes.includes('mrt')) return 'both';
  if (modes.length === 0) return 'none';
  return modes[0];
}
