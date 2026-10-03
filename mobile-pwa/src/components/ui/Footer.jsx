import React from 'react';

export const Footer = ({ children, className = '' }) => (
  <footer className={`px-4 py-6 text-center text-xs text-gray-400 border-t border-gray-100 ${className}`}>
    {children || 'NeoBank — Digital banking for Africa'}
  </footer>
);
export default Footer;
