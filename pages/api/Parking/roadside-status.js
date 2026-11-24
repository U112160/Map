// 路邊停車格即時狀態，pkid 可用逗號串多個
import { createProxy, CACHE } from '../../../lib/teammateProxy';

export default createProxy('/api/parking/roadside-status', {
  params: ['pkid'],
  required: ['pkid'],
  cache: CACHE.dynamic,
});
