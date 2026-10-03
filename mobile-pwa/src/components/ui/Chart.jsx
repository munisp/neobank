import React from 'react';

// Minimal inline-SVG chart: type="line"|"bar", data=[{label,value}] or numbers.
export const Chart = ({ type = 'line', data = [], height = 120, color = '#2563eb', className = '' }) => {
  const values = data.map((d) => (typeof d === 'object' ? d.value : d));
  if (!values.length) return <ChartPlaceholder height={height} />;
  const max = Math.max(...values, 1);
  const w = 100 / Math.max(values.length - 1, 1);

  if (type === 'bar') {
    const bw = 100 / values.length;
    return (
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ height }} className={`w-full ${className}`}>
        {values.map((v, i) => (
          <rect key={i} x={i * bw + bw * 0.15} y={40 - (v / max) * 38} width={bw * 0.7} height={(v / max) * 38} fill={color} rx="1" />
        ))}
      </svg>
    );
  }
  const points = values.map((v, i) => `${i * w},${40 - (v / max) * 38}`).join(' ');
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ height }} className={`w-full ${className}`}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
};

export const ChartPlaceholder = ({ height = 120, label = 'No data yet' }) => (
  <div className="flex items-center justify-center bg-gray-50 rounded-md text-gray-400 text-sm" style={{ height }}>
    {label}
  </div>
);
export default Chart;
