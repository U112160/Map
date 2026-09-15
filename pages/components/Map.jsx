import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon, divIcon, point } from 'leaflet';
import MarkerClusterGroup from "react-leaflet-cluster";
import "../pages/index.css"
import { useMemo, useEffect, useState } from 'react';
import L from 'leaflet';

// ── 白色圓框圖示工廠 ───────────────────────────────────────────────
// size: 圖示顯示大小(px)；padding: 圓框內縮量(px)；shadow: 是否加陰影
function makeCircleIcon(iconUrl, size = 24, padding = 4, shadow = true) {
  const total = size + padding * 2;
  return divIcon({
    html: `<div style="
      width:${total}px;height:${total}px;
      border-radius:50%;
      background:white;
      box-shadow:${shadow ? '0 2px 6px rgba(0,0,0,0.35)' : 'none'};
      display:flex;align-items:center;justify-content:center;
      box-sizing:border-box;
    ">
      <img src="${iconUrl}" style="width:${size}px;height:${size}px;object-fit:contain;" />
    </div>`,
    className: '',          // 清除 leaflet 預設的白色方框
    iconSize: [total, total],
    iconAnchor: [total / 2, total],
    popupAnchor: [0, -total],
  });
}

// ── 依狀態上色的圓框圖示工廠（路邊停車格用）─────────────────────────
// 跟 makeCircleIcon 一樣，只是背景色可以指定（不是固定白色）
function makeStatusCircleIcon(iconUrl, bgColor, size = 18, padding = 4, shadow = true) {
  const total = size + padding * 2;
  return divIcon({
    html: `<div style="
      width:${total}px;height:${total}px;
      border-radius:50%;
      background:${bgColor};
      box-shadow:${shadow ? '0 2px 6px rgba(0,0,0,0.35)' : 'none'};
      display:flex;align-items:center;justify-content:center;
      box-sizing:border-box;
    ">
      <img src="${iconUrl}" style="width:${size}px;height:${size}px;object-fit:contain;" />
    </div>`,
    className: '',
    iconSize: [total, total],
    iconAnchor: [total / 2, total],
    popupAnchor: [0, -total],
  });
}

// ── 路邊停車格狀態碼對照表（依隊友 API 文件）─────────────────────────
const ROADSIDE_STATUS_MAP = {
  '0': { label: '未知',  color: '#9e9e9e' }, // 灰色
  '1': { label: '已佔用', color: '#e53935' }, // 紅色
  '2': { label: '空位',  color: '#43a047' }, // 綠色
};
function getRoadsideStatusInfo(status) {
  return ROADSIDE_STATUS_MAP[status] ?? { label: `未知代碼(${status})`, color: '#9e9e9e' };
}

// 停車場「汽車剩餘車位數」的特殊代碼：
//   -9  本停車場目前無法提供即時車位數資訊
//   -11 沒有確切格數，但剩餘格位足夠
//   -12 沒有確切格數，剩餘格位不足半數
//   -13 沒有確切格數，剩餘格數嚴重不足
//   >=0 實際剩餘車位數
const CAR_AVAIL_CODE = {
  '-9':  '目前無法提供即時資訊',
  '-11': '剩餘車位足夠',
  '-12': '剩餘車位不足半數',
  '-13': '剩餘車位嚴重不足',
};
function formatCarAvailability(value) {
  if (value == null) return '無資料';
  if (value >= 0) return `${value} 位`;
  return CAR_AVAIL_CODE[String(value)] ?? '無資料';
}

// 隊友 /api/parking/lots/dynamic 的 updatetime 是 Java Date.toString() 格式，
// 例如 "Mon Sep 14 14:53:00 CST 2026"。JS 內建的 new Date() 解析這種格式時，
// "CST" 縮寫是歧義的（常被當成美國中部時區 UTC-6，不是台灣的 UTC+8，差 14 小時），
// 所以自己手動解析，時區一律當成台北時間，不管字串裡寫的縮寫是什麼。
const MONTH_MAP = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
function parseJavaDateString(raw) {
  const m = raw.match(/^\w{3} (\w{3}) (\d{2}) (\d{2}):(\d{2}):(\d{2}) \w+ (\d{4})$/);
  if (!m) return null;
  const [, monStr, day, hh, mm, ss, year] = m;
  const month = MONTH_MAP[monStr];
  if (month == null) return null;
  const iso = `${year}-${String(month + 1).padStart(2, '0')}-${day}T${hh}:${mm}:${ss}+08:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

// 隊友 API 回來的時間字串有時候沒有時區標記（沒有結尾的 Z 或 +08:00），
// 這種情況一律當成台北時間 (+08:00) 解析，避免被瀏覽器誤判成 UTC，
// 顯示出來變成晚 8 小時的「未來時間」。
function formatApiTime(raw) {
  if (!raw) return null;

  const javaDate = parseJavaDateString(raw);
  if (javaDate) return javaDate.toLocaleString('zh-TW');

  const hasTimezone = /Z$|[+-]\d{2}:?\d{2}$/.test(raw);
  const d = new Date(hasTimezone ? raw : `${raw}+08:00`);
  return isNaN(d.getTime()) ? null : d.toLocaleString('zh-TW');
}

// ── zoom 閾值：低於此數字就不顯示對應 marker ────────────────────────
const ZOOM_SHOW_MRT      = 14;  // 捷運出口
const ZOOM_SHOW_UBIKE    = 15;  // YouBike 站點
const ZOOM_SHOW_ROADSIDE = 16;  // 路邊停車格（數量最多，最晚出現）
// 停車場（data）永遠顯示，因為數量少

// ── 飛到起/終點 ────────────────────────────────────────────────────
function FlyToLocation({ start, end }) {
  const map = useMap();
  useEffect(() => {
    if (end)        map.flyTo([end.lat,   end.lng],   17, { duration: 1.2 });
    else if (start) map.flyTo([start.lat, start.lng], 17, { duration: 1.2 });
  }, [start, end, map]);
  return null;
}

// ── 地圖移動 / 縮放事件 ───────────────────────────────────────────
function MapEventHandler({ onMapMove, onZoomChange }) {
  useMapEvents({
    moveend: (e) => {
      if (!onMapMove) return;
      const center = e.target.getCenter();
      onMapMove({ lat: center.lat, lng: center.lng });
    },
    zoomend: (e) => {
      if (onZoomChange) onZoomChange(e.target.getZoom());
    },
  });
  return null;
}

export default function Map({
  data,
  roadsideSpots = [],
  ubikeStations = [],
  mrtExits = [],
  start,
  end,
  priorityMode,
  routeResult,
  onMapMove,
}) {
  // 目前 zoom 層級，控制哪些 marker 要渲染
  const [zoom, setZoom] = useState(13);

  // ── 圖示（白色圓框） ───────────────────────────────────────────────
  // makeCircleIcon(圖片路徑, 圖片大小px, 圓框padding px, 是否陰影)
  const customIcon            = useMemo(() => makeCircleIcon('/parking.png',                  20, 4), []);
  const ubikeIcon             = useMemo(() => makeCircleIcon('/bicycle.png',                  18, 4), []);
  const mrtExitIcon           = useMemo(() => makeCircleIcon('/MRT.png',                      18, 4), []);
  const recommendedParkingIcon= useMemo(() => makeCircleIcon('/parking-recommended.png',      22, 5), []);

  // 路邊停車格：依狀態碼上色（0=未知/灰、1=已佔用/紅、2=空位/綠）
  // 路邊停車格：依狀態碼上色（0=未知/灰、1=已佔用/紅、2=空位/綠），
  // 有充電樁的用不同圖示（roadside-parking-charging.png）疊加同一套顏色
  const roadsideIconByStatus = useMemo(() => ({
    '0': {
      normal:   makeStatusCircleIcon('/roadside-parking.png',          ROADSIDE_STATUS_MAP['0'].color, 18, 4),
      charging: makeStatusCircleIcon('/roadside-parking-charging.png', ROADSIDE_STATUS_MAP['0'].color, 18, 4),
    },
    '1': {
      normal:   makeStatusCircleIcon('/roadside-parking.png',          ROADSIDE_STATUS_MAP['1'].color, 18, 4),
      charging: makeStatusCircleIcon('/roadside-parking-charging.png', ROADSIDE_STATUS_MAP['1'].color, 18, 4),
    },
    '2': {
      normal:   makeStatusCircleIcon('/roadside-parking.png',          ROADSIDE_STATUS_MAP['2'].color, 18, 4),
      charging: makeStatusCircleIcon('/roadside-parking-charging.png', ROADSIDE_STATUS_MAP['2'].color, 18, 4),
    },
  }), []);
  const roadsideIconUnknown = useMemo(() => ({
    normal:   makeStatusCircleIcon('/roadside-parking.png',          '#9e9e9e', 18, 4),
    charging: makeStatusCircleIcon('/roadside-parking-charging.png', '#9e9e9e', 18, 4),
  }), []);

  // 起終點保留原本的 pin 造型，不加圓框
  const startIcon = useMemo(() => new Icon({
    iconUrl: '/placeholder-green.png', iconSize: [35, 35], iconAnchor: [17, 35],
  }), []);
  const endIcon = useMemo(() => new Icon({
    iconUrl: '/placeholder-red.png', iconSize: [35, 35], iconAnchor: [17, 35],
  }), []);

  // ── Cluster 圖示 ──────────────────────────────────────────────────
  const createCustomClusterIcon = (cluster) => new divIcon({
    html: `<div class="cluster-icon">${cluster.getChildCount()}</div>`,
    className: "custom-marker-icon", iconSize: point(33, 33, true),
  });
  const createRoadsideClusterIcon = (cluster) => new divIcon({
    html: `<div class="cluster-icon cluster-icon--roadside">${cluster.getChildCount()}</div>`,
    className: "custom-marker-icon", iconSize: point(33, 33, true),
  });
  const createUbikeClusterIcon = (cluster) => new divIcon({
    html: `<div class="cluster-icon cluster-icon--ubike">${cluster.getChildCount()}</div>`,
    className: "custom-marker-icon", iconSize: point(33, 33, true),
  });
  const createMrtClusterIcon = (cluster) => new divIcon({
    html: `<div class="cluster-icon cluster-icon--mrt">${cluster.getChildCount()}</div>`,
    className: "custom-marker-icon", iconSize: point(33, 33, true),
  });

  // ── 路線座標轉換 ───────────────────────────────────────────────────
  const routePositions = useMemo(() => {
    if (!routeResult?.routeGeometry) return [];
    return routeResult.routeGeometry.map((p) => [p.lat, p.lng]);
  }, [routeResult]);

  return (
    <MapContainer center={[25.0330, 121.5654]} zoom={13} style={{ height: '100vh', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <FlyToLocation start={start} end={end} />
      <MapEventHandler onMapMove={onMapMove} onZoomChange={setZoom} />

      {/* ── 停車場（永遠顯示，cluster 整合）── */}
      <MarkerClusterGroup chunkedLoading iconCreateFunction={createCustomClusterIcon}>
        {data.map((item, index) => (
          <Marker key={index} position={[item.lat, item.lng]} icon={customIcon}>
            <Popup autoPan={false}>
              <b>{item.name}</b><br />
              {item.address}<br />
              剩餘汽車位：{formatCarAvailability(item.available_count)}<br />
              剩餘機車位：{item.available_motor}<br />
              {item.payex && <><small>{item.payex}</small><br /></>}
              {item.updatetime && (
                <small style={{ color: '#888' }}>
                  更新：{formatApiTime(item.updatetime)}
                </small>
              )}
              </Popup>
            </Marker>
        ))}
      </MarkerClusterGroup>

      {/* ── 捷運出口（zoom >= 14，cluster 整合）── */}
      {zoom >= ZOOM_SHOW_MRT && (
        <MarkerClusterGroup chunkedLoading iconCreateFunction={createMrtClusterIcon}>
          {mrtExits.map((exit) => (
            <Marker
              key={`mrt-${exit.station_id}-${exit.exit_id}`}
              position={[exit.lat, exit.lon]}
              icon={mrtExitIcon}
            >
              <Popup autoPan={false}>
                <b>{exit.station_name_zh} {exit.exit_name_zh}</b><br />
                {exit.location_description}<br />
                {exit.has_stair ? '有樓梯　' : ''}
                {exit.has_elevator ? '有電梯　' : ''}
                {exit.escalator_count > 0 ? `手扶梯 ${exit.escalator_count} 座` : ''}
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      )}

      {/* ── YouBike 站點（zoom >= 15，cluster 整合）── */}
      {zoom >= ZOOM_SHOW_UBIKE && (
        <MarkerClusterGroup chunkedLoading iconCreateFunction={createUbikeClusterIcon}>
          {ubikeStations.map((station) => (
            <Marker
              key={`ubike-${station.station_uid}`}
              position={[station.lat, station.lon]}
              icon={ubikeIcon}
            >
              <Popup autoPan={false}>
                <b>{station.name_zh}</b><br />
                {station.address_zh}<br />
                可借：{station.available_rent ?? '-'} 台
                可還：{station.available_return ?? '-'} 格<br />
                電動車：{station.electric_bikes ?? '-'} 台<br />
                站點容量：{station.bikes_capacity}<br />
                {station.update_time && (
                  <small style={{ color: '#888' }}>
                    更新：{formatApiTime(station.update_time)}
                  </small>
                )}
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      )}

      {/* ── 路邊停車格（zoom >= 16，cluster 整合）──
          依 status 代碼上色：0=未知(灰)、1=已佔用(紅)、2=空位(綠)
          有充電樁的用 roadside-parking-charging.png 圖示
      */}
      {zoom >= ZOOM_SHOW_ROADSIDE && (
        <MarkerClusterGroup chunkedLoading iconCreateFunction={createRoadsideClusterIcon}>
          {roadsideSpots
            .filter((spot) => typeof spot.lat === 'number' && typeof spot.lng === 'number')
            .map((spot) => {
              const statusInfo = getRoadsideStatusInfo(spot.status);
              const iconSet = roadsideIconByStatus[spot.status] ?? roadsideIconUnknown;
              const icon = spot.has_charging ? iconSet.charging : iconSet.normal;
              return (
                <Marker
                  key={`roadside-${spot.pkid}`}
                  position={[spot.lat, spot.lng]}
                  icon={icon}
                >
                  <Popup autoPan={false}>
                    <b>路邊停車格 {spot.pkid}</b><br />
                    {spot.segment_name_zh && <>路段：{spot.segment_name_zh}<br /></>}
                    狀態：<span style={{ color: statusInfo.color, fontWeight: 'bold' }}>{statusInfo.label}</span><br />
                    {spot.has_charging && <>⚡ 有充電樁<br /></>}
                    {spot.feeSchedule && spot.feeSchedule.length > 0 && (
                      <>
                        收費：
                        {spot.feeSchedule.map((f, i) => (
                          <div key={i} style={{ marginLeft: 8 }}>
                            {f.startTime}–{f.endTime}：${f.price}
                            {f.rateName && <small style={{ color: '#888' }}>（{f.rateName}）</small>}
                          </div>
                        ))}
                      </>
                    )}
                    {spot.distance_km != null && (
                      <small style={{ color: '#888' }}>
                        距離：{spot.distance_km.toFixed(2)} 公里
                      </small>
                    )}
                  </Popup>
                </Marker>
              );
            })}
        </MarkerClusterGroup>
      )}

      {/* ── 路線 ── */}
      {routePositions.length > 0 && (
        <Polyline
          positions={routePositions}
          pathOptions={{ color: 'blue', weight: 5, opacity: 0.7 }}
        />
      )}

      {/* ── 演算法推薦停車格（不 cluster，保持突出顯示）── */}
      {routeResult?.alongRouteParkings?.map((spot) => (
        <Marker
          key={`recommend-${spot.id}`}
          position={[spot.lat, spot.lng]}
          icon={recommendedParkingIcon}
        >
          <Popup autoPan={false}>
            <b>🅿️ {spot.name}</b><br />
            費率：{spot.fee} 元/小時<br />
            車位類型：{spot.spaceType}<br />
            {spot.hasCharging ? '⚡ 有充電樁　' : ''}
            {spot.isAvailable ? '目前有空位' : '目前無空位'}
          </Popup>
        </Marker>
      ))}

      {/* ── 起終點（不 cluster）── */}
      {start && (
        <Marker position={[start.lat, start.lng]} icon={startIcon}>
          <Popup autoPan={false}>起點：{start.name}</Popup>
        </Marker>
      )}
      {end && (
        <Marker position={[end.lat, end.lng]} icon={endIcon}>
          <Popup autoPan={false}>終點：{end.name}</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}