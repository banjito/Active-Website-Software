import React from "react";
import { Toaster } from "react-hot-toast";

/** Displays every react-hot-toast message in the app. Mount it once, at the root. */
export default function AppToaster() {
  return (
    <Toaster
      position="bottom-center"
      toastOptions={{ className: "!rounded-none dark:!bg-neutral-800 dark:!text-neutral-100" }}
    />
  );
}
