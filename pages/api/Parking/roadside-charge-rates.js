// 路邊停車費率表（幾乎不變，長快取）
import { createProxy, CACHE } from '../../../lib/teammateProxy';

export default createProxy('/api/parking/roadside-charge-rates', { cache: CACHE.static });
