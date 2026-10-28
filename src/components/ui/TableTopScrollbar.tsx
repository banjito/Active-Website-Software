import React, { useEffect, useRef, useState } from "react";

interface TableTopScrollbarProps {
  // The element that scrolls sideways (the overflow-x-auto wrapper).
  scrollRef: React.RefObject<HTMLElement>;
  // Re-measure when this changes (e.g. row count), since rows change width.
  watch?: unknown;
}

// Brand-colored horizontal scrollbar shown above a wide table, so users can
// scroll sideways without going to the bottom of a long list. Same look and
// behavior as the one on the Opportunities list.
export function TableTopScrollbar({ scrollRef, watch }: TableTopScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({
    scrollWidth: 0,
    clientWidth: 0,
    scrollLeft: 0,
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartScrollLeftRef = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () =>
      setMetrics({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollLeft: el.scrollLeft,
      });
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(el);
    if (el.firstElementChild) resizeObserver.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      resizeObserver.disconnect();
    };
  }, [scrollRef, watch]);

  const maxScrollLeft = Math.max(0, metrics.scrollWidth - metrics.clientWidth);
  const thumbWidthPct =
    metrics.scrollWidth > 0
      ? Math.min(
          100,
          Math.max((metrics.clientWidth / metrics.scrollWidth) * 100, 10),
        )
      : 100;
  const thumbLeftPct =
    maxScrollLeft > 0
      ? (metrics.scrollLeft / maxScrollLeft) * (100 - thumbWidthPct)
      : 0;

  const scrollTo = (next: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, Math.min(next, maxScrollLeft));
  };

  const handleTrackMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current || maxScrollLeft <= 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    scrollTo(ratio * maxScrollLeft);
  };

  const handleThumbMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (maxScrollLeft <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    dragStartScrollLeftRef.current = metrics.scrollLeft;
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (event: MouseEvent) => {
      if (!trackRef.current || maxScrollLeft <= 0) return;
      const trackWidth = trackRef.current.getBoundingClientRect().width;
      if (trackWidth <= 0) return;
      const thumbTravel = Math.max(
        1,
        trackWidth - trackWidth * (thumbWidthPct / 100),
      );
      const deltaX = event.clientX - dragStartXRef.current;
      scrollTo(
        dragStartScrollLeftRef.current + (deltaX / thumbTravel) * maxScrollLeft,
      );
    };
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, maxScrollLeft, thumbWidthPct]);

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-neutral-100 dark:border-dark-200 bg-white dark:bg-dark-150 print:hidden">
      <div
        ref={trackRef}
        className="relative min-w-0 flex-1 h-2 bg-neutral-200 dark:bg-dark-200 cursor-pointer"
        onMouseDown={handleTrackMouseDown}
        aria-label="Horizontal table scrollbar"
      >
        <div
          className={`absolute top-0 h-2 bg-brand ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
          style={{ width: `${thumbWidthPct}%`, left: `${thumbLeftPct}%` }}
          onMouseDown={handleThumbMouseDown}
          aria-hidden
        />
      </div>
    </div>
  );
}

export default TableTopScrollbar;
