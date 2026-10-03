import React from 'react';
import Spinner from './Spinner';

export const LoadingSpinner = ({ message = 'Loading...', size = 'lg' }) => (
  <div className="flex flex-col items-center justify-center gap-2 p-6">
    <Spinner size={size} />
    {message && <p className="text-sm text-gray-500">{message}</p>}
  </div>
);
export default LoadingSpinner;
