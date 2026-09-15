// 呼叫 Nominatim（OpenStreetMap 的地址搜尋服務）
export async function searchPlace(keyword) {
  if (!keyword) return [];
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(keyword)}&countrycodes=tw&limit=5`
  );
  return res.json();
}
