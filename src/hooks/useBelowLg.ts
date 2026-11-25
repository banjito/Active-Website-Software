import { useEffect, useState } from "react";

// "screen" keeps printing on the desktop layout: paper is narrower than 1024px.
const BELOW_LG = "screen and (max-width: 1023.98px)";

/** True below Tailwind's lg breakpoint: phones and upright iPads. */
export function useBelowLg(): boolean {
  const [isBelowLg, setIsBelowLg] = useState(
    () => window.matchMedia(BELOW_LG).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(BELOW_LG);
    const update = () => setIsBelowLg(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isBelowLg;
}
