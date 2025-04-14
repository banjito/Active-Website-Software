import React, { SelectHTMLAttributes, forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ 
    label, 
    error, 
    hint, 
    options, 
    className = '', 
    size = 'md', 
    fullWidth = true,
    icon,
    id,
    ...props 
  }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    
    const sizeClasses = {
      sm: 'py-1.5 text-sm',
      md: 'py-2.5',
      lg: 'py-3 text-lg'
    };
    
    return (
      <div className={`${fullWidth ? 'w-full' : ''} mb-4`}>
        {label && (
          <label 
            htmlFor={inputId} 
            className="block mb-1.5 text-sm font-medium text-cozy-wood-800 dark:text-dark-800"
          >
            {label}
          </label>
        )}
        
        <div className="relative">
          {icon && (
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <span className="text-cozy-wood-500 dark:text-dark-500">{icon}</span>
            </div>
          )}
          
          <select
            ref={ref}
            id={inputId}
            className={`
              appearance-none w-full px-4 ${sizeClasses[size]} 
              bg-white dark:bg-dark-200 text-cozy-wood-900 dark:text-dark-900
              border ${error ? 'border-red-500' : 'border-cozy-wood-300 dark:border-dark-400'} 
              rounded-lg shadow-sm
              focus:outline-none focus:ring-2 focus:ring-offset-0 
              ${error ? 'focus:ring-red-500' : 'focus:ring-cozy-terracotta-500 dark:focus:ring-cozy-terracotta-400'}
              ${icon ? 'pl-10' : ''}
              pr-10
              disabled:bg-cozy-wood-50 dark:disabled:bg-dark-300 
              disabled:text-cozy-wood-500 dark:disabled:text-dark-600
              disabled:cursor-not-allowed
              transition-colors
              ${className}
            `}
            {...props}
          >
            {options.map((option) => (
              <option 
                key={option.value} 
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>
          
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <ChevronDown className="h-4 w-4 text-cozy-wood-500 dark:text-dark-500" />
          </div>
        </div>
        
        {(error || hint) && (
          <p className={`mt-1.5 text-sm ${error ? 'text-red-500' : 'text-cozy-wood-500 dark:text-dark-600'}`}>
            {error || hint}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export default Select; 