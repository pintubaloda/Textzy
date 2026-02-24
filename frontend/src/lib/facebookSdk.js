let fbSdkPromise = null;

export function loadFacebookSdk(appId) {
  if (!appId) {
    return Promise.reject(new Error("Missing Facebook App ID"));
  }

  if (window.FB && typeof window.FB.init === "function") {
    try {
      window.FB.init({ appId, cookie: true, xfbml: false, version: "v21.0" });
      return Promise.resolve(window.FB);
    } catch (e) {
      // fall through and reload with a clean promise path
    }
  }

  if (fbSdkPromise) return fbSdkPromise;

  fbSdkPromise = new Promise((resolve, reject) => {
    const onReady = () => {
      if (!window.FB || typeof window.FB.init !== "function") {
        reject(new Error("Facebook SDK unavailable"));
        fbSdkPromise = null;
        return;
      }
      try {
        window.FB.init({ appId, cookie: true, xfbml: false, version: "v21.0" });
        resolve(window.FB);
      } catch (e) {
        reject(e);
        fbSdkPromise = null;
      }
    };

    const existing = document.getElementById("facebook-jssdk");
    if (existing) {
      if (window.FB) {
        onReady();
        return;
      }
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener(
        "error",
        () => {
          reject(new Error("Failed to load Facebook SDK"));
          fbSdkPromise = null;
        },
        { once: true }
      );
      return;
    }

    window.fbAsyncInit = onReady;
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = () => {
      reject(new Error("Failed to load Facebook SDK"));
      fbSdkPromise = null;
    };

    const timeout = window.setTimeout(() => {
      reject(new Error("Facebook SDK load timeout"));
      fbSdkPromise = null;
    }, 12000);

    script.onload = () => window.clearTimeout(timeout);
    document.body.appendChild(script);
  });

  return fbSdkPromise;
}

