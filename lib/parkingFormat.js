// 停車場「汽車剩餘車位數」的特殊代碼：
//   -9  本停車場目前無法提供即時車位數資訊
//   -11 沒有確切格數，但剩餘格位足夠
//   -12 沒有確切格數，剩餘格位不足半數
//   -13 沒有確切格數，剩餘格數嚴重不足
//   >=0 實際剩餘車位數
// 地圖彈窗（Map.jsx）和「選擇停車場」清單（pages/index.js）共用
const CAR_AVAIL_CODE = {
  '-9': '目前無法提供即時資訊',
  '-11': '剩餘車位足夠',
  '-12': '剩餘車位不足半數',
  '-13': '剩餘車位嚴重不足',
};

export function formatCarAvailability(value) {
  if (value == null) return '無資料';
  if (value >= 0) return `${value} 位`;
  return CAR_AVAIL_CODE[String(value)] ?? '無資料';
}
