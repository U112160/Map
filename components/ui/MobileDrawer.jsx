import { useEffect, useState } from 'react';
import { STEP_COLORS } from './StepIndicator';

// 手機版的選單面板：貼在畫面左側的抽屜，右邊有一個把手可以收起／展開。
// 收起時整個抽屜滑到畫面外，只留下把手，地圖就能完整顯示。
//
// 抽屜收起時只是移到畫面外（transform），內容沒有卸載，
// 所以輸入框裡打過的字、目前在第幾步都會保留。

export const MOBILE_BREAKPOINT = 768; // px，小於等於這個寬度視為手機

// 判斷目前是不是手機寬度。
// 伺服器端渲染時拿不到 window，先回傳 null（「還不知道」），
// 讓呼叫端在知道之前先不要渲染面板，避免先閃一下桌機版再換成手機版。
export function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  const [isMobile, setIsMobile] = useState(null);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpoint]);

  return isMobile;
}

const PANEL_BG = 'rgba(6, 8, 23, 0.95)';
const PANEL_BORDER = 'rgba(102, 125, 157, 0.45)';

export function MobileDrawer({ open, onToggle, children }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        left: 0,
        // 寬度留一點空間給右下角的浮動按鈕跟把手
        width: 'min(80vw, 320px)',
        zIndex: 1002, // 蓋過 Leaflet 的圖層與控制項（約 1000）
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease',
      }}
    >
      {/* 面板本體：內容太長時在抽屜裡面捲動，不會把整個網頁撐長 */}
      <div
        style={{
          maxHeight: 'calc(100dvh - 24px)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          background: PANEL_BG,
          border: `1px solid ${PANEL_BORDER}`,
          borderLeft: 'none',
          borderRadius: '0 14px 14px 0',
          boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
          padding: '14px 12px',
          boxSizing: 'border-box',
          color: STEP_COLORS.text,
        }}
      >
        {children}
      </div>

      {/* 把手：黏在抽屜右緣外側，抽屜收起時也看得到。
          放在比較下面（top: 90），避開 Leaflet 左上角的放大縮小按鈕 */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={open ? '收起選單' : '展開選單'}
        aria-expanded={open}
        style={{
          position: 'absolute',
          top: 90,
          right: -38,
          width: 38,
          height: 64,
          border: `1px solid ${PANEL_BORDER}`,
          borderLeft: 'none',
          borderRadius: '0 12px 12px 0',
          background: PANEL_BG,
          boxShadow: '4px 4px 14px rgba(0,0,0,0.35)',
          color: STEP_COLORS.text,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          padding: 0,
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>{open ? '‹' : '›'}</span>
        <span style={{ fontSize: 10, color: STEP_COLORS.muted }}>{open ? '收起' : '選單'}</span>
      </button>
    </div>
  );
}