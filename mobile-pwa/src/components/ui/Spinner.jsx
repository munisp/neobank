import React from 'react';

const SIZES = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' };

export const Spinner = ({ size = 'md', className = '' }) => (
  <div
    role="status"
    aria-label="Loading"
    className={`animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 ${SIZES[size] || SIZES.md} ${className}`}
  />
);
export default Spinner;
