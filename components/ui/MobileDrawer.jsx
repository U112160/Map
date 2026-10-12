import { useEffect, useRef, useState } from 'react';
import { STEP_COLORS } from './StepIndicator';

// 手機版的選單面板：貼在畫面左側的抽屜。
// - 展開時：「收起選單」按鈕固定在面板最下方（不跟著內容捲動）
// - 收起時：整個抽屜滑到畫面外，左下角只留一顆「選單」按鈕可以再打開
// 所有元素都在螢幕範圍內，不會有東西凸出畫面造成左右捲動。
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
  const drawerRef = useRef(null);
  const openBtnRef = useRef(null);
  const isFirstRender = useRef(true);

  // 收起時用 inert 而不是 aria-hidden：
  // aria-hidden 只是「對螢幕閱讀器隱藏」，但焦點還會留在裡面的按鈕上，
  // Chrome 會跳出 "Blocked aria-hidden on an element because its descendant retained focus" 警告。
  // inert 會讓整塊不能被點、不能被 Tab 到，瀏覽器也會自動把焦點移出來。
  // （用 ref 直接設 DOM 屬性，React 18 / 19 都能用）
  useEffect(() => {
    if (drawerRef.current) drawerRef.current.inert = !open;

    // 第一次渲染不要搶焦點；之後每次收起，把焦點交給左下角的「選單」按鈕，
    // 鍵盤／螢幕閱讀器使用者才不會「掉」在看不見的地方
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!open) openBtnRef.current?.focus({ preventScroll: true });
  }, [open]);

  return (
    <>
      {/* ── 抽屜本體 ── */}
      <div
        ref={drawerRef}
        style={{
          position: 'fixed',
          top: 12,
          left: 0,
          width: 'min(85vw, 320px)',
          maxHeight: 'calc(100dvh - 24px)',
          zIndex: 1002, // 蓋過 Leaflet 的圖層與控制項（約 1000）
          display: 'flex',
          flexDirection: 'column',
          background: PANEL_BG,
          border: `1px solid ${PANEL_BORDER}`,
          borderLeft: 'none',
          borderRadius: '0 14px 14px 0',
          boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
          boxSizing: 'border-box',
          color: STEP_COLORS.text,
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          // 收起後連陰影也移出畫面，不會在左邊留一條影子
          visibility: open ? 'visible' : 'hidden',
          transition: open
            ? 'transform 0.25s ease, visibility 0s'
            : 'transform 0.25s ease, visibility 0s linear 0.25s',
        }}
      >
        {/* 內容區：太長時只在這裡捲動 */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            padding: '14px 12px 8px',
          }}
        >
          {children}
        </div>

        {/* 收起按鈕：固定在面板最下方 */}
        <button
          type="button"
          onClick={onToggle}
          aria-label="收起選單"
          style={{
            flexShrink: 0,
            width: '100%',
            padding: '10px 0',
            border: 'none',
            borderTop: `1px solid ${STEP_COLORS.line}`,
            borderRadius: '0 0 14px 0',
            background: 'transparent',
            color: STEP_COLORS.muted,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          ‹ 收起選單
        </button>
      </div>

      {/* ── 收起時：左下角的「選單」按鈕 ──
          右下角已經有使用聲明／回報問題按鈕，所以放左下角，不會撞在一起 */}
      {!open && (
        <button
          ref={openBtnRef}
          type="button"
          onClick={onToggle}
          aria-label="展開選單"
          style={{
            position: 'fixed',
            left: 12,
            bottom: 24,
            zIndex: 1002,
            height: 44,
            padding: '0 16px',
            borderRadius: 22,
            border: `1px solid ${PANEL_BORDER}`,
            background: PANEL_BG,
            boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            color: STEP_COLORS.text,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>☰</span>
          選單
        </button>
      )}
    </>
  );
}