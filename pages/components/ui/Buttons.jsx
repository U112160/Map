// 主要動作按鈕：用於「開始規劃路線」這種整個面板最重要的操作
export function PrimaryButton({ children, onClick, disabled, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '12px',
        marginTop: 10,
        fontSize: 14,
        fontWeight: 700,
        color: disabled ? '#667D9D' : '#ECECEC',
        background: disabled
          ? 'rgba(22,37,79,0.4)'
          : 'linear-gradient(135deg, #16254F, #060817)',
        border: `1px solid ${disabled ? '#16254F' : '#667D9D'}`,
        borderRadius: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        letterSpacing: 0.5,
        transition: 'filter 0.15s, transform 0.1s',
        ...style,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.filter = 'brightness(1.25)'; }}
      onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(0.98)'; }}
      onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      {children}
    </button>
  );
}

// 次要動作按鈕：用於「使用 Google Maps 規劃路線」「測試：載入假路線」這類輔助功能
export function SecondaryButton({ children, onClick, disabled, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '10px',
        marginTop: 8,
        fontSize: 13,
        fontWeight: 600,
        color: disabled ? '#667D9D' : '#ACBBC6',
        background: 'transparent',
        border: '1px solid #16254F',
        borderRadius: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = 'rgba(102, 125, 157, 0.15)';
        e.currentTarget.style.borderColor = '#667D9D';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.borderColor = '#16254F';
      }}
    >
      {children}
    </button>
  );
}
