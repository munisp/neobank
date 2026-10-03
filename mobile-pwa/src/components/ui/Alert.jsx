import React from 'react';

const VARIANTS = {
  default: 'bg-gray-50 border-gray-200 text-gray-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  success: 'bg-green-50 border-green-200 text-green-800',
  warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  destructive: 'bg-red-50 border-red-200 text-red-800',
};

export const Alert = ({ variant, type, title, description, children, className = '' }) => {
  const v = VARIANTS[variant || type] || VARIANTS.default;
  return (
    <div role="alert" className={`border rounded-md p-3 text-sm ${v} ${className}`}>
      {title && <div className="font-semibold mb-0.5">{title}</div>}
      {description && <div>{description}</div>}
      {children}
    </div>
  );
};
export default Alert;
