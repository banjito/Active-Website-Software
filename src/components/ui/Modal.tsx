import React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  className,
  size = "md",
}: ModalProps) {
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const sizeClasses = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-full w-full h-full m-0 rounded-none",
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm",
        size === "full" ? "overflow-hidden" : "overflow-y-auto",
      )}
      onClick={handleBackdropClick}
    >
      <div
        className={cn(
          "bg-white dark:bg-dark-150 shadow-xl relative transform transition-all duration-200 ease-in-out",
          size === "full" ? "rounded-none" : "rounded-lg",
          size === "full" ? "w-full h-full" : "w-full mx-4 my-8",
          sizeClasses[size],
          size === "full" && "flex flex-col",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={cn(
            "flex items-center justify-between border-b dark:border-zinc-700 flex-shrink-0",
            size === "full" ? "px-6 py-4" : "px-6 py-4",
          )}
        >
          {title && (
            <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
              {title}
            </h3>
          )}
          <button
            type="button"
            className="text-zinc-400 hover:text-zinc-500 focus:outline-none"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div
          className={cn(
            size === "full"
              ? "flex-1 min-h-0 flex flex-col overflow-hidden"
              : "px-6 py-4",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
