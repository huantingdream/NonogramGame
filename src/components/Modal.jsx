import { useEffect, useRef } from 'react';
export function Modal({ open, onClose, children, className = '', ...props }) {
  const ref = useRef(null);
  useEffect(() => { if (open && !ref.current.open) ref.current.showModal(); else if (!open && ref.current.open) ref.current.close(); }, [open]);
  return <dialog {...props} ref={ref} className={`modal ${className}`} onClose={onClose} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const r = event.currentTarget.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose();
  }}>{children}</dialog>;
}
