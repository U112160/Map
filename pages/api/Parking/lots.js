// 停車場基本資料 + 剩餘車位
import { createAreaProxy, CACHE } from '../../../lib/teammateProxy';

export default createAreaProxy('/api/parking/lots', CACHE.dynamic);
