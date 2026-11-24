import { motion, useReducedMotion } from "framer-motion";
import GridScan from "@/components/ui/GridScan";
import { BRAND_COLOR } from "@/lib/companyConfig";

/** Total time on screen. Must match the redirect delay in AuthCallback. */
export const AUTH_SUCCESS_MS = 2800;
/** When the whole screen starts fading out (seconds). The fade takes 0.3s. */
const FADE_AT = AUTH_SUCCESS_MS / 1000 - 0.3;

const WORD = "Success";


/**
 * Sign-in link success screen: React Bits Grid Scan sweep, a drawn check mark,
 * blur-in letters (React Bits "BlurText" style), a progress line, then a fade out.
 */
export default function AuthSuccess() {
  const reduce = useReducedMotion();
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  return (
    <motion.div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-white p-4 dark:bg-neutral-950"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0, filter: reduce ? "none" : "blur(6px)" }}
      transition={{ delay: FADE_AT, duration: 0.3, ease: "easeIn" }}
    >
      <GridScan
        className="!absolute inset-0"
        scanColor={BRAND_COLOR}
        lightMode={!isDark}
        intro
        autoScan={false}
        clickEffect="none"
        interactive={false}
        enableWebcam={false}
      />

      <div className="relative flex flex-col items-center">
        <motion.div
          className="mb-6 flex h-16 w-16 items-center justify-center rounded-none bg-brand"
          initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 18 }}
        >
          <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none">
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="white"
              strokeWidth={2.75}
              strokeLinecap="square"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.15, duration: 0.3, ease: "easeOut" }}
            />
          </svg>
        </motion.div>

        <h2 className="flex text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
          {WORD.split("").map((ch, i) => (
            <motion.span
              key={i}
              initial={{
                opacity: 0,
                y: reduce ? 0 : 10,
                filter: reduce ? "none" : "blur(8px)",
              }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ delay: 0.12 + i * 0.035, duration: 0.35 }}
            >
              {ch}
            </motion.span>
          ))}
        </h2>

        <motion.p
          className="mt-2 text-sm text-neutral-500 dark:text-neutral-400"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.3 }}
        >
          Taking you in
        </motion.p>

        <div className="mt-6 h-0.5 w-40 overflow-hidden rounded-none bg-neutral-200 dark:bg-neutral-800">
          <motion.div
            className="h-full rounded-none bg-brand"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: FADE_AT, ease: "easeInOut" }}
          />
        </div>
      </div>
    </motion.div>
  );
}
