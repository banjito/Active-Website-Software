import React from "react";
import { createRoot } from "react-dom/client";
import { CheckCircle, AlertCircle, Info, X, BellRing } from "lucide-react";

export interface ToastProps {
  title: string;
  description?: string;
  variant?: "default" | "success" | "warning" | "destructive" | "info";
  duration?: number;
  /** When true the toast stays until the user dismisses it (ignores duration). */
  persistent?: boolean;
  /** Optional action button rendered below the message. */
  action?: { label: string; onClick: () => void };
  onClose?: () => void;
}

export interface ToastOptions extends Omit<ToastProps, "onClose"> {}

const ToastContainer: React.FC<ToastProps> = ({
  title,
  description,
  variant = "default",
  duration = 5000,
  persistent = false,
  action,
  onClose,
}) => {
  const [isVisible, setIsVisible] = React.useState(true);

  const dismiss = React.useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      onClose?.();
    }, 300); // Animation duration
  }, [onClose]);

  React.useEffect(() => {
    // Persistent toasts (e.g. "update available") stay until dismissed.
    if (persistent) return;

    const timer = setTimeout(() => {
      dismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, persistent, dismiss]);

  const getVariantStyles = () => {
    switch (variant) {
      case "success":
        return "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800";
      case "warning":
        return "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800";
      case "destructive":
        return "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800";
      case "info":
        return "bg-white dark:bg-dark-150 border-neutral-200 dark:border-neutral-700";
      default:
        return "bg-white dark:bg-dark-150 border-neutral-200 dark:border-neutral-700";
    }
  };

  const getIcon = () => {
    switch (variant) {
      case "success":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "warning":
        return <AlertCircle className="h-5 w-5 text-amber-500" />;
      case "destructive":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case "info":
        return (
          <BellRing className="h-5 w-5 text-neutral-500 dark:text-white" />
        );
      default:
        return <Info className="h-5 w-5 text-neutral-500 dark:text-white" />;
    }
  };

  return (
    <div
      className={`
        fixed top-4 right-4 z-50 max-w-sm
        transform transition-all duration-300 ease-in-out
        ${isVisible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}
        ${getVariantStyles()}
        border rounded-lg shadow-md p-4
      `}
      role="alert"
    >
      <div className="flex items-start">
        <div className="flex-shrink-0 mr-3 mt-0.5">{getIcon()}</div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {title}
          </h3>
          {description && (
            <div className="mt-1 text-sm text-neutral-700 dark:text-white">
              {description}
            </div>
          )}
          {action && (
            <button
              type="button"
              className="mt-2 inline-flex items-center rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-400"
              onClick={() => {
                action.onClick();
                dismiss();
              }}
            >
              {action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          className="ml-4 inline-flex flex-shrink-0 text-neutral-400 hover:text-neutral-500 focus:outline-none"
          onClick={dismiss}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

let toastContainer: HTMLDivElement | null = null;

const createToastContainer = () => {
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "toast-container";
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
};

export const toast = (options: ToastOptions) => {
  const container = createToastContainer();
  const toastId = `toast-${Date.now()}`;

  const toastElement = document.createElement("div");
  toastElement.id = toastId;
  container.appendChild(toastElement);

  const root = createRoot(toastElement);

  const onClose = () => {
    root.unmount();
    if (toastElement.parentNode) {
      toastElement.parentNode.removeChild(toastElement);
    }
  };

  root.render(<ToastContainer {...options} onClose={onClose} />);

  return {
    close: onClose,
  };
};

export default toast;
