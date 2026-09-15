import { useState } from 'react';
import { searchPlace } from '../../lib/geocode';

export function SearchInput({ label, value, onSelect, onError }) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);

  const iconSrc =
    label === '起點'
      ? '/placeholder-green.png'
      : '/placeholder-red.png';

  const handleSearch = async () => {
    if (!keyword.trim()) {
      onError?.('warning', '請輸入關鍵字', `請先輸入${label}的地址或地名再搜尋`);
      return;
    }
    setLoading(true);
    try {
      const data = await searchPlace(keyword);
      setResults(data);
      if (data.length === 0) {
        onError?.('info', '找不到地點', `「${keyword}」沒有符合的搜尋結果，請嘗試其他關鍵字`);
      }
    } catch (err) {
      onError?.('error', '地址搜尋失敗', '無法連線至地圖服務，請確認網路連線後再試');
    } finally {
      setLoading(false);
    }
  };

  // 只有「起點」欄位會用到：抓瀏覽器的目前定位，直接覆蓋成新的起點
  // 一定要使用者按下允許授權才拿得到座標，這是瀏覽器強制的規則，無法略過
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      onError?.('error', '瀏覽器不支援定位', '此瀏覽器沒有提供定位功能，請改用地址搜尋起點');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        onSelect({ name: '目前位置', lat: latitude, lng: longitude });
        setKeyword('');
        setResults([]);
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          onError?.('warning', '未取得定位權限', '請允許瀏覽器的定位權限後再試一次，或改用地址搜尋起點');
        } else {
          onError?.('error', '定位失敗', '無法取得目前位置，請確認裝置的定位服務已開啟，或改用地址搜尋');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'nowrap' }}>
        <img
          src={iconSrc}
          alt={label}
          style={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0 }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#ECECEC', flexShrink: 0 }}>
          {label}{value ? '：' : ''}
        </span>
        {value && (
          <span
            style={{
              fontSize: 12,
              color: '#ACBBC6',
              lineHeight: 1.5,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {value.name}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {label === '起點' && (
          <button
            onClick={handleUseCurrentLocation}
            disabled={locating}
            style={{
              flexShrink: 0,
              padding: '8px 10px',
              fontSize: 12,
              fontWeight: 600,
              color: locating ? '#667D9D' : '#ACBBC6',
              background: 'transparent',
              border: '1px solid #16254F',
              borderRadius: 8,
              cursor: locating ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              if (locating) return;
              e.currentTarget.style.background = 'rgba(102, 125, 157, 0.15)';
              e.currentTarget.style.borderColor = '#667D9D';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = '#16254F';
            }}
          >
            {locating ? '📍定位中…' : '當前位置'}
          </button>
        )}
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder={`搜尋${label}...`}
          style={{
            flex: 1,
            padding: '8px 10px',
            fontSize: 13,
            border: '1px solid #16254F',
            borderRadius: 8,
            outline: 'none',
            background: '#0d1530',
            color: '#ECECEC',
          }}
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          style={{
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: 700,
            color: '#060817',
            background: loading ? '#667D9D' : '#ACBBC6',
            border: 'none',
            borderRadius: 8,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? '...' : '搜尋'}
        </button>
      </div>

      {results.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            margin: '6px 0 0',
            padding: 0,
            maxHeight: 160,
            overflowY: 'auto',
            border: '1px solid #16254F',
            borderRadius: 8,
            background: '#060817',
          }}
        >
          {results.map((r, i) => (
            <li
              key={r.place_id}
              onClick={() => {
                onSelect({ name: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) });
                setResults([]);
                setKeyword('');
              }}
              style={{
                padding: '8px 10px',
                cursor: 'pointer',
                fontSize: 12,
                color: '#ECECEC',
                borderBottom: i < results.length - 1 ? '1px solid #16254F' : 'none',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(102, 125, 157, 0.18)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {r.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}