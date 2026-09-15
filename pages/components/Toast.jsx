import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const TOAST_ICONS = {
  error:   '✕',
  warning: '⚠',
  success: '✓',
  info:    'ℹ',
};

const TOAST_COLORS = {
  error:   { bar: '#E05C5C', icon: '#E05C5C', text: '#ECECEC', bg: 'rgba(224,92,92,0.12)', border: 'rgba(224,92,92,0.35)' },
  warning: { bar: '#E0A85C', icon: '#E0A85C', text: '#ECECEC', bg: 'rgba(224,168,92,0.12)', border: 'rgba(224,168,92,0.35)' },
  success: { bar: '#5CE07A', icon: '#5CE07A', text: '#ECECEC', bg: 'rgba(92,224,122,0.12)', border: 'rgba(92,224,122,0.35)' },
  info:    { bar: '#5CA8E0', icon: '#5CA8E0', text: '#ECECEC', bg: 'rgba(92,168,224,0.12)', border: 'rgba(92,168,224,0.35)' },
};

function Toast({ id, type, title, message, onClose }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const c = TOAST_COLORS[type] || TOAST_COLORS.info;

  // 進場動畫
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const handleClose = useCallback(() => {
    setLeaving(true);
    setTimeout(() => onClose(id), 280);
  }, [id, onClose]);

  // 自動消失（error 不自動消失，需手動關）
  useEffect(() => {
    if (type === 'error') return;
    const t = setTimeout(handleClose, type === 'success' ? 3000 : 5000);
    return () => clearTimeout(t);
  }, [type, handleClose]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 14px',
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderLeft: `4px solid ${c.bar}`,
        borderRadius: 10,
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        maxWidth: 340,
        width: '100%',
        transition: 'opacity 0.28s, transform 0.28s',
        opacity: visible && !leaving ? 1 : 0,
        transform: visible && !leaving ? 'translateX(0)' : 'translateX(24px)',
        pointerEvents: leaving ? 'none' : 'auto',
      }}
    >
      {/* 圖示 */}
      <div
        style={{
          flexShrink: 0,
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          fontWeight: 700,
          color: c.icon,
          marginTop: 1,
        }}
      >
        {TOAST_ICONS[type]}
      </div>

      {/* 文字 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div style={{ fontSize: 13, fontWeight: 700, color: c.text, marginBottom: message ? 3 : 0, lineHeight: 1.35 }}>
            {title}
          </div>
        )}
        {message && (
          <div style={{ fontSize: 12, color: '#ACBBC6', lineHeight: 1.5, wordBreak: 'break-word' }}>
            {message}
          </div>
        )}
      </div>

      {/* 關閉鈕 */}
      <button
        onClick={handleClose}
        aria-label="關閉通知"
        style={{
          flexShrink: 0,
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          color: '#667D9D',
          fontSize: 14,
          cursor: 'pointer',
          borderRadius: 4,
          marginTop: 1,
          transition: 'color 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#ECECEC')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#667D9D')}
      >
        ×
      </button>
    </div>
  );
}

// Toast 容器：固定在右下角，以 stack 方式排列
// 用 createPortal 直接掛到 document.body，跳脫地圖（Leaflet）可能造成的疊層情境問題，
// 不管地圖內部圖層怎麼排，Toast 永遠是 body 的直接子元素，不會被蓋住
export function ToastContainer({ toasts, onClose }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []); // 只有在瀏覽器端才能拿到 document，SSR 階段先不渲染

  if (!mounted) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 2147483647,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        alignItems: 'flex-end',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <Toast {...t} onClose={onClose} />
        </div>
      ))}
    </div>,
    document.body
  );
}
