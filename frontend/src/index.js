import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import TextzyMobile from "@/textzy-mobile";
import { ensureServiceWorkerRegistered } from "@/lib/browserNotifications";

const params = new URLSearchParams(window.location.search);
const desktopShell = params.get("desktopShell") === "1";
const mobileShell =
  params.get("mobileShell") === "1" ||
  window.location.pathname.startsWith("/mobile-shell") ||
  window.location.href.includes("mobileShell=1") ||
  window.location.hash.toLowerCase().includes("mobileshell") ||
  window.location.hash.toLowerCase().includes("mobile-shell") ||
  window.navigator.userAgent.includes("TextzyMobileShell/1");

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    {mobileShell ? <TextzyMobile /> : desktopShell ? <TextzyMobile /> : <App />}
  </React.StrictMode>,
);

ensureServiceWorkerRegistered().catch(() => {});
