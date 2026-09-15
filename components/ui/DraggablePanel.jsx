import { useState, useRef, useEffect } from 'react';

export function DraggablePanel({ children }) {
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const dragRef = useRef(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);

  const handleMouseDown = (e) => {
    draggingRef.current = true;
    offsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!draggingRef.current) return;
      setPosition({
        x: e.clientX - offsetRef.current.x,
        y: e.clientY - offsetRef.current.y,
      });
    };
    const handleMouseUp = () => {
      draggingRef.current = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        top: position.y,
        left: position.x,
        zIndex: 1000,
        width: 380,
        background: 'rgba(6, 8, 23, 0.97)',
        backdropFilter: 'blur(8px)',
        borderRadius: 14,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(102, 125, 157, 0.3)',
        userSelect: 'none',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* 拖曳把手 */}
      <div
        ref={dragRef}
        onMouseDown={handleMouseDown}
        style={{
          padding: '12px 16px',
          background: 'linear-gradient(135deg, #060817, #16254F)',
          cursor: 'move',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '2px solid #667D9D',
        }}
      >
        <span style={{ fontSize: 16, color: '#ACBBC6', opacity: 0.9 }}>⠿</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#ECECEC', letterSpacing: 0.5 }}>
          路線規劃
        </span>
      </div>

      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}