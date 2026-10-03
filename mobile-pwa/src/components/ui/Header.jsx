import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export const Header = ({ title, showBack = false, rightContent }) => {
  const navigate = useNavigate();
  return (
    <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-10">
      <div className="flex items-center gap-2">
        {showBack && (
          <button aria-label="Back" onClick={() => navigate(-1)} className="p-1 text-gray-600">
            <ArrowLeft size={20} />
          </button>
        )}
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      {rightContent && <div>{rightContent}</div>}
    </header>
  );
};
export default Header;
