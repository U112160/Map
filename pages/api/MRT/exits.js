// 以中心點半徑取得捷運出口
// 欄位：station_id, exit_id, station_name_zh, exit_name_zh, lat, lon,
// location_description, has_stair, has_elevator, escalator_count
import { createAreaProxy, CACHE } from '../../../lib/teammateProxy';

export default createAreaProxy('/api/mrt/exits', CACHE.static);
