const SW_PATH = "/sw.js";

export async function ensureServiceWorkerRegistered() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW_PATH);
  } catch {
    return null;
  }
}

export async function requestDesktopNotificationPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export async function showDesktopNotification({ title, body, tag, data } = {}) {
  if (typeof document !== "undefined" && !document.hidden) return false;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;

  if ("serviceWorker" in navigator) {
    const reg = await ensureServiceWorkerRegistered();
    if (reg?.active) {
      reg.active.postMessage({
        type: "SHOW_NOTIFICATION",
        title,
        body,
        tag,
        data
      });
      return true;
    }
  }

  try {
    new Notification(title || "New message", {
      body: body || "You received a new message",
      tag: tag || "textzy-inbox",
      data: data || {}
    });
    return true;
  } catch {
    return false;
  }
}

