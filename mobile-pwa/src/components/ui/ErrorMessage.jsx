import React from 'react';

export const ErrorMessage = ({ message, error, onRetry, className = '' }) => {
  const text = message || (error && (error.message || String(error)));
  if (!text) return null;
  return (
    <div className={`bg-red-50 border border-red-200 text-red-700 rounded-md p-3 text-sm ${className}`} role="alert">
      <div>{text}</div>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 text-red-800 underline text-xs">Try again</button>
      )}
    </div>
  );
};
export default ErrorMessage;
