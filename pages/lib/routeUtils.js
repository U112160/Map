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

// 把一段停靠點（[起點, ...中繼點, 終點]）組成 Google Maps 導航網址
export function buildGoogleMapsUrl(leg) {
  const origin = `${leg[0].lat},${leg[0].lng}`;
  const destination = `${leg[leg.length - 1].lat},${leg[leg.length - 1].lng}`;
  const waypoints = leg.slice(1, -1).map((p) => `${p.lat},${p.lng}`).join('|');

  const params = new URLSearchParams({ api: '1', origin, destination, travelmode: 'driving' });
  if (waypoints) params.set('waypoints', waypoints);

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

// 把「接駁方式」的複選結果（陣列）轉成單一字串：
// 兩個都選 → "both"；都沒選 → "none"；只選一個 → 該選項本身的值（"ubike" 或 "mrt"）
export function transportModesToString(modes) {
  if (modes.includes('ubike') && modes.includes('mrt')) return 'both';
  if (modes.length === 0) return 'none';
  return modes[0];
}
