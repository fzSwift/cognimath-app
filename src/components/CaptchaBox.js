/* Cloudflare Turnstile widget. Renders nothing until TURNSTILE_SITE_KEY
   is set. Web uses the official script; native uses a tiny WebView. */
import React, { createElement, useEffect, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { TURNSTILE_SITE_KEY } from "../config";

export function botProtectionOn() {
  return Boolean(TURNSTILE_SITE_KEY);
}

let _script = null;
function loadTurnstile() {
  if (typeof document === "undefined") return Promise.resolve(null);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (_script) return _script;
  _script = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-cm-turnstile]");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.turnstile));
      existing.addEventListener("error", reject);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.dataset.cmTurnstile = "1";
    s.onload = () => resolve(window.turnstile);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return _script;
}

export default function CaptchaBox({ onToken, resetKey }) {
  const host = useRef(null);
  const widget = useRef(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || Platform.OS !== "web") return undefined;
    let gone = false;
    (async () => {
      const ts = await loadTurnstile();
      if (gone || !ts || !host.current) return;
      if (widget.current != null) {
        try { ts.remove(widget.current); } catch (e) { /* first paint */ }
      }
      host.current.innerHTML = "";
      widget.current = ts.render(host.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: token => onToken && onToken(token),
        "expired-callback": () => onToken && onToken(""),
        "error-callback": () => onToken && onToken(""),
        theme: "light",
      });
    })();
    return () => {
      gone = true;
      try {
        if (window.turnstile && widget.current != null) window.turnstile.remove(widget.current);
      } catch (e) { /* unmount */ }
      widget.current = null;
    };
  }, [onToken, resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;

  if (Platform.OS === "web") {
    return createElement("div", { ref: host, style: { minHeight: 68 } });
  }

  let WebView = null;
  try { WebView = require("react-native-webview").WebView; } catch (e) { WebView = null; }
  if (!WebView) return null;
  const html = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>html,body{margin:0;background:#FBF6E9;display:flex;justify-content:center;}</style>
</head><body>
<div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}" data-callback="ok" data-expired-callback="exp"></div>
<script>
function ok(t){window.ReactNativeWebView.postMessage(JSON.stringify({token:t}))}
function exp(){window.ReactNativeWebView.postMessage(JSON.stringify({token:""}))}
</script>
</body></html>`;
  return (
    <View style={styles.native}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        onMessage={e => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            onToken && onToken(msg.token || "");
          } catch (err) { /* ignore */ }
        }}
        style={styles.webview}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  native: { height: 72, overflow: "hidden" },
  webview: { backgroundColor: "transparent", height: 72 },
});
