// YouBike 站點
import { createAreaProxy, CACHE } from '../../../lib/teammateProxy';

export default createAreaProxy('/api/ubike/stations', CACHE.dynamic);
