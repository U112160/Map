import { useState, useEffect } from 'react';

const DISCLAIMER_ITEMS = [
  { icon: 'Ⅰ.', text: '停車費率僅供參考，實際收費依現場公告為準。' },
  { icon: 'Ⅱ.', text: '車位即時資料來源為政府開放資料，更新有延遲，無法保證抵達時車位仍有空缺。' },
  { icon: 'Ⅲ.', text: '路線規劃結果為演算法建議，實際行駛請依現場交通狀況及標誌為準。' },
  { icon: 'Ⅳ.', text: 'YouBike站點與捷運出口資訊僅供參考，如有異動以主管機關公告為主。' },
  { icon: 'Ⅴ.', text: '本系統資料不得作為商業用途或法律依據，使用者需自行承擔相關風險。' },
];

export function DisclaimerModal({ onClose }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 250);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: `rgba(0,0,0,${visible ? 0.65 : 0})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        transition: 'background 0.25s',
      }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        style={{
          width: 420,
          maxWidth: 'calc(100vw - 32px)',
          background: 'rgba(6, 8, 23, 0.99)',
          border: '1px solid rgba(102, 125, 157, 0.4)',
          borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.25s, opacity 0.25s',
        }}
      >
        {/* 標題列 */}
        <div
          style={{
            padding: '14px 18px',
            background: 'linear-gradient(135deg, #060817, #16254F)',
            borderBottom: '2px solid #667D9D',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img
              src="/disclaimer-icon.png"
              alt="使用聲明"
              style={{ width: 26, height: 26, objectFit: 'contain', borderRadius: 4 }}
            />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#ECECEC', letterSpacing: 0.5 }}>使用聲明</span>
          </div>
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', color: '#667D9D', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ECECEC')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#667D9D')}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '18px 20px 20px' }}>
          <p style={{ fontSize: 13, color: '#ACBBC6', marginBottom: 16, lineHeight: 1.65 }}>
            使用本系統前，請詳閱以下聲明。繼續使用即表示您已知悉並同意下列事項。
          </p>

          <div style={{
            padding: '12px 14px',
            background: 'rgba(102, 125, 157, 0.08)',
            border: '1px solid rgba(102, 125, 157, 0.2)',
            borderRadius: 8,
            marginBottom: 20,
          }}>
            {DISCLAIMER_ITEMS.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: i < 4 ? 8 : 0 }}>
                <span style={{ fontSize: 13, color: '#ACBBC6', flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
                <span style={{ fontSize: 13, color: '#ACBBC6', lineHeight: 1.6 }}>{item.text}</span>
              </div>
            ))}
          </div>

          <button
            onClick={handleClose}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: 14,
              fontWeight: 700,
              color: '#ECECEC',
              background: 'linear-gradient(135deg, #16254F, #060817)',
              border: '1px solid #667D9D',
              borderRadius: 10,
              cursor: 'pointer',
              letterSpacing: 0.5,
              transition: 'filter 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.25)')}
            onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
          >
            我已了解，繼續使用
          </button>
        </div>
      </div>
    </div>
  );
}
