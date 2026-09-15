export function PreferenceToggle({ label, options, value, onChange }) {
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
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={active}
              style={{
                flex: 1,
                padding: '7px 8px',
                fontSize: 12,
                fontWeight: 700,
                color: active ? '#060817' : '#ACBBC6',
                background: active ? '#ACBBC6' : 'transparent',
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
