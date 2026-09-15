// 複選核取方塊群組：用於「接駁方式」這類可以同時勾選多個、或都不勾（代表只走路）的情境
// 不用真的 checkbox 圖示，改成點擊整個按鈕切換，選中時用背景反白表示狀態
export function CheckboxGroup({ label, options, values, onToggle }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#ECECEC', marginBottom: 6 }}>
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: 4,
          background: '#0d1530',
          border: '1px solid #16254F',
          borderRadius: 8,
        }}
      >
        {options.map((opt) => {
          const checked = values.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggle(opt.value)}
              aria-pressed={checked}
              style={{
                flex: 1,
                padding: '7px 8px',
                fontSize: 12,
                fontWeight: 700,
                color: checked ? '#060817' : '#ACBBC6',
                background: checked ? '#ACBBC6' : 'transparent',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}