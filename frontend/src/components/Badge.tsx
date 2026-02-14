import React from 'react';

interface Badge {
  label: string;
  color: 'primary' | 'success' | 'warning' | 'danger' | 'secondary';
}

const Badge: React.FC<Badge> = ({ label, color }) => {
  const colorClasses = {
    primary: 'bg-primary-100 text-primary-700',
    success: 'bg-success-100 text-success-700',
    warning: 'bg-warning-100 text-warning-700',
    danger: 'bg-danger-100 text-danger-700',
    secondary: 'bg-secondary-100 text-secondary-700',
  };

  return (
    <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${colorClasses[color]}`}>
      {label}
    </span>
  );
};

export default Badge;
