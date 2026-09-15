import { useState } from 'react';

// 錯誤報告表單：讓使用者自行填寫 bug 回報
export function BugReportModal({ onClose, onSubmit, prefillError }) {
  const [desc, setDesc] = useState(prefillError ? `` : '');
  const [contact, setContact] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!desc.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({ description: desc, contact }); // 真的等 API 回來，不再假設一定成功
      setSent(true);
    } catch (err) {
      setError(err.message || '送出失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: 400,
          background: 'rgba(6, 8, 23, 0.99)',
          border: '1px solid rgba(102, 125, 157, 0.4)',
          borderRadius: 16,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          overflow: 'hidden',
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
              src="/bug-report-icon.png"
              alt="回報問題"
              style={{ width: 26, height: 26, objectFit: 'contain', borderRadius: 4 }}
            />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#ECECEC', letterSpacing: 0.5 }}>回報問題</span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#667D9D', fontSize: 18, cursor: 'pointer' }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {sent ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#5CE07A', marginBottom: 6 }}>回報已送出</div>
              <div style={{ fontSize: 13, color: '#ACBBC6' }}>感謝您的回報，我們會盡快處理</div>
              <button
                onClick={onClose}
                style={{
                  marginTop: 20,
                  padding: '10px 28px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#ECECEC',
                  background: 'linear-gradient(135deg, #16254F, #060817)',
                  border: '1px solid #667D9D',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                關閉
              </button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: '#ACBBC6', marginBottom: 14, lineHeight: 1.6 }}>
                請描述您遇到的問題，有助於我們快速修復。
              </div>

              <label style={{ fontSize: 13, fontWeight: 600, color: '#ECECEC', display: 'block', marginBottom: 6 }}>
                問題描述 <span style={{ color: '#E05C5C' }}>*</span>
              </label>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="請描述您遇到了什麼問題…"
                rows={5}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 11px',
                  fontSize: 13,
                  border: '1px solid #16254F',
                  borderRadius: 8,
                  background: '#0d1530',
                  color: '#ECECEC',
                  resize: 'vertical',
                  outline: 'none',
                  lineHeight: 1.55,
                  marginBottom: 14,
                }}
              />

              <label style={{ fontSize: 13, fontWeight: 600, color: '#ECECEC', display: 'block', marginBottom: 6 }}>
                聯絡方式（選填）
              </label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="E-mail 或其他聯絡方式"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 11px',
                  fontSize: 13,
                  border: '1px solid #16254F',
                  borderRadius: 8,
                  background: '#0d1530',
                  color: '#ECECEC',
                  outline: 'none',
                  marginBottom: 18,
                }}
              />

              <button
                onClick={handleSubmit}
                disabled={!desc.trim() || submitting}
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: 14,
                  fontWeight: 700,
                  color: desc.trim() && !submitting ? '#ECECEC' : '#667D9D',
                  background: desc.trim() && !submitting
                    ? 'linear-gradient(135deg, #16254F, #060817)'
                    : 'rgba(22,37,79,0.4)',
                  border: `1px solid ${desc.trim() && !submitting ? '#667D9D' : '#16254F'}`,
                  borderRadius: 10,
                  cursor: desc.trim() && !submitting ? 'pointer' : 'not-allowed',
                  letterSpacing: 0.5,
                  transition: 'filter 0.15s',
                }}
                onMouseEnter={(e) => { if (desc.trim() && !submitting) e.currentTarget.style.filter = 'brightness(1.25)'; }}
                onMouseLeave={(e) => (e.currentTarget.style.filter = 'brightness(1)')}
              >
                {submitting ? '送出中…' : '送出回報'}
              </button>

              {error && (
                <div style={{ marginTop: 10, fontSize: 12.5, color: '#E05C5C', lineHeight: 1.5 }}>
                  {error}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}