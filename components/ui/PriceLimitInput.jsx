export function PriceLimitInput({ label, value, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#ECECEC', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number"
          min="0"
          step="10"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="例如：50"
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
        <span style={{ fontSize: 13, color: '#ACBBC6' }}>元以下</span>
      </div>
    </div>
  );
}
