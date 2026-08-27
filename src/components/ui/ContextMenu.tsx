import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";

/**
 * A menu anchored at the pointer.
 *
 * Radix ships a context-menu primitive, but it isn't a dependency here and pulling one in
 * for this would mean every white-labelled instance re-installing for one menu. Parking a
 * zero-size trigger at the cursor and opening the dropdown against it gives the same
 * behaviour — portalled, focus-managed, dismissed on Escape or an outside click — out of
 * the primitive the app already ships.
 *
 * Render it only while a menu is wanted: it mounts open, and unmounts on dismiss. That is
 * also what makes a second right-click somewhere else reposition correctly, since Radix
 * measures the trigger once, when it opens.
 */
export function ContextMenu({
  x,
  y,
  onClose,
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu
      open
      // Not modal: a modal menu locks body scroll and blanks pointer events behind it,
      // which is heavy for something dismissed by looking away.
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DropdownMenuTrigger asChild>
        {/* No aria-hidden: Radix puts aria-haspopup/aria-expanded on whatever it is given,
            and hiding an element that carries those is a contradiction. It is empty and
            zero-sized, so there is nothing to announce beyond the menu itself. */}
        <span
          // Fixed, because the coordinates come from the pointer event and the list the
          // row lives in scrolls.
          style={{ position: "fixed", left: x, top: y, width: 0, height: 0 }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={0}
        className="max-h-[70vh] overflow-y-auto"
        // The row underneath is clickable; a click that lands on the menu is for the menu.
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ContextMenu;
