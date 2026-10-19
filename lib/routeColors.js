// 三種路線在地圖線條、圖例上共用同一組顏色，兩邊才會對得起來。
// 刻意避開紅／綠：地圖上路邊停車格的狀態已經用紅（已佔用）、綠（空位）表示。
export const ROUTE_COLORS = {
  drive: '#422013', // 純開車直達：藍
  mrt: '#ddaf5e',   // 捷運轉乘：橘
  ubike: '#ce2342', // YouBike 轉乘：紫
};

const FALLBACK_COLORS = ['#422013', '#ddaf5e', '#991930', '#00ACC1'];

export function getRouteColor(route, index = 0) {
  return ROUTE_COLORS[route?.mode] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}
