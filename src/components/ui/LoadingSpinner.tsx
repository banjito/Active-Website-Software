import { cn } from '@/lib/utils';
import './LoadingSpinner.css';

export type LoadingSpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type LoadingSpinnerVariant = 'brand' | 'light';

const SIZE_SCALE: Record<LoadingSpinnerSize, number> = {
  xs: 16 / 55,
  sm: 24 / 55,
  md: 32 / 55,
  lg: 48 / 55,
  xl: 64 / 55,
  '2xl': 128 / 55,
};

export interface LoadingSpinnerProps {
  size?: LoadingSpinnerSize;
  /** brand = the site brand color; light = white (e.g. on brand-colored buttons) */
  variant?: LoadingSpinnerVariant;
  className?: string;
  /** Wraps spinner in a centered flex container with vertical padding */
  centered?: boolean;
  label?: string;
}

export function LoadingSpinner({
  size = 'md',
  variant = 'brand',
  className,
  centered = false,
  label = 'Loading',
}: LoadingSpinnerProps) {
  const scale = SIZE_SCALE[size];
  const dimension = 55 * scale;

  const spinner = (
    <div
      role="status"
      aria-label={label}
      className={cn('inline-block shrink-0 overflow-hidden', className)}
      style={{ width: dimension, height: dimension }}
    >
      <div
        className={cn('amp-loader', variant === 'light' && 'amp-loader--light')}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
        }}
      />
    </div>
  );

  if (centered) {
    return (
      <div className="flex items-center justify-center py-8">
        {spinner}
      </div>
    );
  }

  return spinner;
}

export default LoadingSpinner;
