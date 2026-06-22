import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/lib/AuthContext";
import { BrandingProvider } from "@/lib/BrandingContext";
import { ThemeProvider } from "@/lib/ThemeContext";
import App from "@/App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrandingProvider>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </BrandingProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
