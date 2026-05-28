import React, { useState } from 'react';
import { Newspaper } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CommunityBoardPanel } from '@/components/community/CommunityBoardPanel';
import { cn } from '@/lib/utils';

type Align = 'start' | 'center' | 'end';

type Props = {
  /** Popover alignment relative to the trigger. Default centers the panel under the icon. */
  align?: Align;
  /** Optional extra classes on the icon trigger button. */
  triggerClassName?: string;
};

export function CommunityBoardPopover({ align = 'end', triggerClassName = '' }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Open community board"
          aria-expanded={open}
          className={cn(
            'rounded-full w-10 h-10 p-0 flex items-center justify-center text-gray-600 dark:text-white hover:text-[#f26722] dark:hover:text-[#f26722] focus:outline-none focus:ring-2 focus:ring-[#f26722] focus:ring-offset-2 data-[state=open]:text-[#f26722] data-[state=open]:bg-[#f26722]/10 data-[state=open]:ring-2 data-[state=open]:ring-[#f26722]/30',
            triggerClassName
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
          'z-50 !w-[min(calc(100vw-1.5rem),420px)] max-h-[min(90vh,680px)] !p-0 overflow-hidden rounded-md border shadow-md outline-none',
          'border-gray-200 bg-white dark:border-gray-700 dark:bg-dark-150'
        )}
      >
        {open ? <CommunityBoardPanel /> : null}
      </PopoverContent>
    </Popover>
  );
}
