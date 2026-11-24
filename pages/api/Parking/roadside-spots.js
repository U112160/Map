// 路邊停車格位置
import { createAreaProxy, CACHE } from '../../../lib/teammateProxy';

export default createAreaProxy('/api/parking/roadside-spots', CACHE.dynamic);
