import React from 'react';

export const ToggleSwitch = ({ enabled, checked, onChange, label, disabled = false }) => {
  const on = enabled !== undefined ? enabled : checked;
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={!!on}
        disabled={disabled}
        onClick={() => onChange?.(!on)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${on ? 'bg-blue-600' : 'bg-gray-300'} ${disabled ? 'opacity-50' : ''}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
      {label && <span className="text-sm">{label}</span>}
    </label>
  );
};
export default ToggleSwitch;
