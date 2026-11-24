// 路段收費時段，請帶 segment_id（一次一個）
import { createProxy, CACHE } from '../../../lib/teammateProxy';

export default createProxy('/api/parking/roadside-charge', {
  params: ['segment_id'],
  cache: CACHE.static,
});
