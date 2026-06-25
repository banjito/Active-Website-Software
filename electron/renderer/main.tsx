import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import OfflineApp from "./OfflineApp";
import "@/index.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <OfflineApp />
    </StrictMode>
  );
}
