import React from 'react';

/** NBCard — surfaces with token radius/elevation; dark uses tint+border. */
export function NBCard({ children, padding = 24, elevated = false, className = '', style = {}, ...props }) {
  return (
    <div
      className={`nb-card ${className}`}
      style={{ padding, boxShadow: elevated ? 'var(--nb-elev-2)' : 'var(--nb-card-shadow)', ...style }}
      {...props}
    >
      {children}
    </div>
  );
}
export default NBCard;
