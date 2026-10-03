import React from 'react';

// Select supporting either an `options` prop ([{value,label}] or strings)
// or native <option> children.
export const Select = ({ label, name, value, onChange, options, children, className = '', ...props }) => (
  <div className="flex flex-col gap-1">
    {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
    <select
      name={name}
      value={value}
      onChange={onChange}
      className={`border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
      {...props}
    >
      {options
        ? options.map((opt) => {
            const o = typeof opt === 'object' ? opt : { value: opt, label: opt };
            return <option key={o.value} value={o.value}>{o.label}</option>;
          })
        : children}
    </select>
  </div>
);
export const SelectDropdown = Select;
export default Select;
