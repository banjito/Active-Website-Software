import React, { HTMLAttributes } from 'react';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  rounded?: 'full' | 'md';
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  rounded = 'full',
  className = '',
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium';
  
  // Only apply variant styles if no custom background color is provided
  const variantStyles = !className.includes('bg-') ? {
    primary: 'bg-dark-accent/10 text-dark-accent border border-dark-accent/20 dark:bg-dark-accent/5 dark:text-dark-secondary dark:border-dark-accent/10',
    secondary: 'bg-dark-primary/10 text-dark-primary border border-dark-primary/20 dark:bg-dark-secondary/5 dark:text-dark-secondary dark:border-dark-secondary/10',
    success: 'bg-green-100 text-green-800 border border-green-200 dark:bg-green-900/20 dark:text-green-200 dark:border-green-800',
    warning: 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-800',
    danger: 'bg-red-100 text-red-800 border border-red-200 dark:bg-red-900/20 dark:text-red-200 dark:border-red-800',
    info: 'bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-200 dark:border-blue-800',
    outline: 'bg-white border border-dark-accent/30 text-dark-primary dark:bg-dark-200 dark:border-dark-accent/20 dark:text-dark-secondary'
  } : {};
  
  const sizeStyles = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-0.5',
    lg: 'text-base px-3 py-1'
  };
  
  const roundedStyles = {
    full: 'rounded-full',
    md: 'rounded-md'
  };
  
  return (
    <span
      className={`${baseStyles} ${variantStyles[variant] || ''} ${sizeStyles[size]} ${roundedStyles[rounded]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};

export default Badge; 