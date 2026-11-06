import React, { useMemo, useState } from "react";
import { Input } from "@/components/ui/Input";
import { searchSymbols, type DiagramSearchItem } from "@/lib/diagrams/search";

interface DiagramSearchProps {
  items: DiagramSearchItem[];
  activeDiagramId: string;
  onPick: (item: DiagramSearchItem) => void;
}

/** Enter jumps to the highlighted result, and the arrow keys move the highlight. */
export default function DiagramSearch({ items, activeDiagramId, onPick }: DiagramSearchProps) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const results = useMemo(
    () => searchSymbols(items, query, activeDiagramId),
    [items, query, activeDiagramId],
  );

  const pick = (item: DiagramSearchItem) => {
    setQuery("");
    setHighlight(0);
    onPick(item);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setQuery("");
    } else if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setHighlight((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setHighlight((current) => (current - 1 + results.length) % results.length);
    } else if (event.key === "Enter" && results[highlight]) {
      event.preventDefault();
      pick(results[highlight]);
    }
  };

  return (
    <div className="relative w-36 [&>div]:mb-0">
      <Input
        aria-label="Search this site's diagrams"
        placeholder="Search"
        className="!py-1.5 !text-sm"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlight(0);
        }}
        onKeyDown={onKeyDown}
      />

      {query.trim() && (
        <div className="absolute left-0 top-full z-20 mt-1 w-64 max-w-[calc(100vw-2rem)] border border-neutral-200 bg-white shadow-md dark:border-neutral-700 dark:bg-neutral-800">
          {results.length === 0 && (
            <p className="p-2 text-sm text-neutral-500 dark:text-neutral-400">No matches.</p>
          )}
          {results.map((item, index) => (
            <button
              key={item.symbolId}
              type="button"
              className={`block w-full px-2 py-1.5 text-left ${
                index === highlight ? "bg-neutral-100 dark:bg-neutral-700" : ""
              }`}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => pick(item)}
            >
              <span className="block truncate text-sm font-medium">{item.name}</span>
              <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                {item.diagramName}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
