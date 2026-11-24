// 停車場即時剩餘車位
import { createAreaProxy, CACHE } from '../../../lib/teammateProxy';

export default createAreaProxy('/api/parking/lots/dynamic', CACHE.dynamic);
