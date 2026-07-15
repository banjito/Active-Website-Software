import React, { useState } from "react";
import { Newspaper } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CommunityBoardPanel } from "@/components/community/CommunityBoardPanel";
import { cn } from "@/lib/utils";

type Align = "start" | "center" | "end";

type Props = {
  /** Popover alignment relative to the trigger. Default centers the panel under the icon. */
  align?: Align;
  /** Optional extra classes on the icon trigger button. */
  triggerClassName?: string;
};

export function CommunityBoardPopover({
  align = "end",
  triggerClassName = "",
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Open community board"
          aria-expanded={open}
          className={cn(
            "rounded-none w-10 h-10 p-0 flex items-center justify-center text-neutral-600 dark:text-white hover:text-brand dark:hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 data-[state=open]:text-brand data-[state=open]:bg-brand/10 data-[state=open]:ring-2 data-[state=open]:ring-brand/30",
            triggerClassName,
          )}
        >
          <Newspaper className="h-5 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side="bottom"
        sideOffset={8}
        collisionPadding={12}
        className={cn(
          "z-50 !w-[min(calc(100vw-1.5rem),420px)] max-h-[min(90vh,680px)] !p-0 overflow-hidden rounded-none border shadow-md outline-none",
          "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-dark-150",
        )}
      >
        {open ? <CommunityBoardPanel /> : null}
      </PopoverContent>
    </Popover>
  );
}
