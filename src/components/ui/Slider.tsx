import React, { useState, useEffect, useRef } from "react";

interface SliderProps {
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
}

export const Slider: React.FC<SliderProps> = ({
  min = 0,
  max = 100,
  step = 1,
  value,
  onChange,
  className = "",
  disabled = false,
}) => {
  const [currentValue, setCurrentValue] = useState<number>(value);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    setCurrentValue(newValue);
    onChange(newValue);
  };

  const percentage = ((currentValue - min) / (max - min)) * 100;

  return (
    <div className={`relative w-full ${className}`}>
      <div
        ref={trackRef}
        className="relative h-1.5 w-full rounded-none bg-neutral-200 dark:bg-dark-150"
      >
        <div
          className="absolute h-full rounded-none bg-blue-600 dark:bg-blue-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={currentValue}
        onChange={handleChange}
        className="absolute inset-0 h-1.5 w-full cursor-pointer appearance-none bg-transparent opacity-0 disabled:cursor-not-allowed"
        disabled={disabled}
      />
      <div className="mt-2 flex justify-between text-xs text-neutral-500 dark:text-white">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
};
