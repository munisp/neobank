import React, { useEffect } from 'react';

export const Modal = ({ isOpen, onClose, title, children, footer, className = '' }) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-4 ${className}`}>
        <div className="flex items-center justify-between mb-3">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          <button aria-label="Close" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div>{children}</div>
        {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
};
export default Modal;
