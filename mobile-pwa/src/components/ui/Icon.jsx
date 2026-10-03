import React from 'react';
import * as LucideIcons from 'lucide-react';

// kebab-case or plain name -> lucide component (e.g. 'arrow-left' -> ArrowLeft)
const toPascal = (name) =>
  String(name).split(/[-_\s]+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');

export const Icon = ({ name, size = 20, className = '', ...props }) => {
  const Cmp = LucideIcons[toPascal(name)] || LucideIcons.Circle;
  return <Cmp size={size} className={className} {...props} />;
};
export default Icon;
