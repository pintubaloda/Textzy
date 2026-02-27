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

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function subscribePush(vapidPublicKey) {
  if (!vapidPublicKey) return null;
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await ensureServiceWorkerRegistered();
  if (!reg) return null;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });
  }
  return sub ? sub.toJSON() : null;
}
