// YouBike 即時可借/可還
import { createAreaProxy, CACHE } from '../../../lib/teammateProxy';

export default createAreaProxy('/api/ubike/availability', CACHE.dynamic);
