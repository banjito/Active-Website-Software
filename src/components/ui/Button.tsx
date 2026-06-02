import React, { ButtonHTMLAttributes } from 'react';
import { LoadingSpinner } from './LoadingSpinner';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'link' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth,
  className = '',
  disabled,
  type = 'button',
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed';
  
  const variantStyles = {
    primary: 'bg-[#f26722] hover:bg-[#f26722]/90 text-white focus:ring-[#f26722] shadow-sm',
    secondary: 'bg-dark-secondary/20 hover:bg-dark-secondary/30 text-dark-primary focus:ring-dark-secondary shadow-sm dark:bg-dark-700 dark:hover:bg-dark-700/90 dark:text-white',
    outline: 'border border-dark-accent/30 hover:bg-dark-accent/10 text-dark-primary focus:ring-dark-accent dark:border-dark-700 dark:hover:bg-dark-700/20 dark:text-white',
    ghost: 'hover:bg-dark-accent/10 text-dark-primary focus:ring-dark-accent dark:hover:bg-dark-700/20 dark:text-dark-700 dark:hover:text-dark-700/90',
    link: 'text-dark-accent hover:text-dark-accent/90 underline-offset-4 hover:underline focus:ring-0 dark:text-dark-700 dark:hover:text-dark-700/90',
    destructive: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500 shadow-sm dark:bg-red-800 dark:hover:bg-red-700'
  };
  
  const sizeStyles = {
    sm: 'text-sm px-3 py-1.5 rounded-lg',
    md: 'text-base px-4 py-2 rounded-lg',
    lg: 'text-lg px-6 py-3 rounded-xl',
    icon: 'p-2 rounded-lg'
  };
  
  const widthClass = fullWidth ? 'w-full' : '';
  
  return (
    <button
      type={type}
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthClass} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <LoadingSpinner
          size="xs"
          variant={variant === 'primary' || variant === 'destructive' ? 'light' : 'brand'}
          className="-ml-1 mr-2"
        />
      )}
      
      {!isLoading && leftIcon && <span className="mr-2">{leftIcon}</span>}
      <span>{children}</span>
      {!isLoading && rightIcon && <span className="ml-2">{rightIcon}</span>}
    </button>
  );
};

export default Button; 