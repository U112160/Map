import { useState, useRef, useCallback } from 'react';

// useToast hook：管理通知佇列
export function useToast() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  // 依照類型對應到不同的 console 方法，方便在 F12 用篩選功能快速找到警告/錯誤
  const addToast = useCallback((type, title, message) => {
    const logFn =
      type === 'error' ? console.error :
      type === 'warning' ? console.warn :
      console.log;
    logFn(`[${type}] ${title}${message ? '：' + message : ''}`);
    // 不再 setToasts，畫面上不會顯示任何訊息，全部只在 Console 看得到
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}
