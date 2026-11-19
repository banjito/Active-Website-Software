import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Button } from "@/components/ui/Button";

/**
 * Small "are you sure?" bubble anchored to the button that opened it (above it
 * by default, with an arrow), instead of window.confirm(). Use for quick
 * row-level actions like Delete. For bigger decisions use confirmDialog().
 *
 *   <ConfirmPopover message='Delete "test"?' confirmLabel="Delete" destructive
 *     onConfirm={() => remove(id)}>
 *     <Button>Delete</Button>
 *   </ConfirmPopover>
 */
interface ConfirmPopoverProps {
  /** The button that opens the bubble. Must accept a ref (our Button does). */
  children: React.ReactElement;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button. */
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}

export function ConfirmPopover({
  children,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  side = "top",
  align = "center",
}: ConfirmPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>{children}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className="z-[9999] w-64 rounded-none border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-dark-150 p-3 shadow-lg outline-none"
        >
          <p className="text-sm text-neutral-800 dark:text-neutral-100">
            {message}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              {cancelLabel}
            </Button>
            <Button
              size="sm"
              variant={destructive ? "secondary" : undefined}
              onClick={handleConfirm}
              disabled={busy}
              className={
                destructive
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : undefined
              }
            >
              {confirmLabel}
            </Button>
          </div>
          <PopoverPrimitive.Arrow
            width={12}
            height={6}
            className="fill-white dark:fill-dark-150"
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export default ConfirmPopover;
