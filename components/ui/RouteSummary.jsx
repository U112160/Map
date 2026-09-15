export function RouteSummary({ summary }) {
  if (!summary) return null;

  const stats = [
    { label: '總距離', value: (summary.totalDistanceMeters / 1000).toFixed(2), unit: '公里' },
    { label: '沿路可用車位', value: summary.totalAvailableSpaces, unit: '個' },
  ];

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        background: 'rgba(102, 125, 157, 0.12)',
        border: '1px solid rgba(102, 125, 157, 0.3)',
        borderRadius: 10,
        display: 'flex',
        gap: 8,
      }}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          style={{
            flex: 1,
            textAlign: 'center',
            padding: '8px 4px',
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, color: '#ECECEC', lineHeight: 1.2 }}>
            {stat.value}
            <span style={{ fontSize: 12, fontWeight: 400, color: '#ACBBC6', marginLeft: 3 }}>
              {stat.unit}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#ACBBC6', marginTop: 4 }}>
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}
