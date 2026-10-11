// 步驟指示器：參考設計稿的「4-STEP PROCESS」
// - 已完成的步驟：主色外框 + 數字，可點擊回到該步驟
// - 目前步驟：主色實心 + 光暈
// - 尚未到達的步驟：灰色外框，不可點擊（要用「下一步」才能前進，確保驗證有跑過）
//
// 顏色集中在這裡，要換主題色改這幾個常數就好
export const STEP_COLORS = {
  accent: '#2B8A8A',        // 主色（設計稿的深青綠，在深色面板上提亮一點）
  accentGlow: 'rgba(43, 138, 138, 0.35)',
  text: '#ECECEC',
  muted: '#ACBBC6',
  inactive: '#3B4A63',
  line: '#16254F',
};

export function StepIndicator({ steps, current, onStepClick }) {
  const C = STEP_COLORS;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 14 }}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = done && typeof onStepClick === 'function';

        return (
          <div key={label} style={{ flex: 1, position: 'relative', textAlign: 'center' }}>
            {/* 連接線：從這一顆的中心連到下一顆的中心 */}
            {i < steps.length - 1 && (
              <div
                style={{
                  position: 'absolute',
                  top: 13,
                  left: '50%',
                  width: '100%',
                  height: 2,
                  background: done ? C.accent : C.line,
                  transition: 'background 0.25s',
                }}
              />
            )}

            <button
              type="button"
              onClick={clickable ? () => onStepClick(i) : undefined}
              disabled={!clickable}
              aria-current={active ? 'step' : undefined}
              aria-label={`第 ${i + 1} 步：${label}`}
              style={{
                position: 'relative',
                zIndex: 1,
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: `2px solid ${active || done ? C.accent : C.inactive}`,
                background: active ? C.accent : 'rgba(6, 8, 23, 0.95)',
                color: active ? '#fff' : done ? C.accent : C.muted,
                fontSize: 12,
                fontWeight: 700,
                lineHeight: '24px',
                padding: 0,
                cursor: clickable ? 'pointer' : 'default',
                boxShadow: active ? `0 0 0 4px ${C.accentGlow}` : 'none',
                transition: 'all 0.25s',
              }}
            >
              {i + 1}
            </button>

            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                fontWeight: active ? 700 : 400,
                color: active ? C.text : C.muted,
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 上一步／下一步按鈕列
export function StepNav({ current, total, onPrev, onNext, nextDisabled, nextLabel = '下一步 →' }) {
  const C = STEP_COLORS;
  const isFirst = current === 0;
  const isLast = current === total - 1;

  const base = {
    flex: 1,
    padding: '9px 4px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    transition: 'all 0.15s',
  };

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
      <button
        type="button"
        onClick={onPrev}
        disabled={isFirst}
        style={{
          ...base,
          border: `1px solid ${C.line}`,
          background: 'transparent',
          color: isFirst ? C.inactive : C.text,
          cursor: isFirst ? 'not-allowed' : 'pointer',
        }}
      >
        ← 上一步
      </button>

      {!isLast && (
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          style={{
            ...base,
            border: 'none',
            background: nextDisabled ? C.inactive : C.accent,
            color: nextDisabled ? C.muted : '#fff',
            cursor: nextDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          {nextLabel}
        </button>
      )}
    </div>
  );
}