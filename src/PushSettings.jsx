// PushSettings — de kaart "Meldingen op je telefoon" in Instellingen → Planning.
//
// Web push via de service worker (public/sw.js) en de VAPID-sleutel uit
// shared.jsx. Eén abonnement per apparaat/browser; de rij staat in
// push_subscriptions (RLS: alleen eigen rijen) en wordt gebruikt door de edge
// function send-push-notification, die book-appointment/cancel-appointment
// aanroepen.
//
// Platformregels die hier het verschil maken:
//  - iPhone/iPad: push bestaat alleen in een PWA die op het beginscherm staat
//    (iOS 16.4+). In Safari-zelf ontbreekt PushManager → we tonen de
//    installatie-uitleg in plaats van een knop die niets doet.
//  - Android/desktop Chrome, Firefox, Edge: werkt direct in de browser.
//  - Abonnementen verlopen (OS-herinstallatie, browserdata gewist): de edge
//    function ruimt 404/410 zelf op; deze kaart toont de browser-status en
//    zet de DB-rij desnoods opnieuw (upsert op endpoint).
import { useEffect, useState } from "react";
import { supabase } from "./supabase.js";
import { VAPID_PUBLIC_KEY } from "./shared.jsx";

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceLabel() {
  const ua = navigator.userAgent || "";
  const os = /iphone|ipad|ipod/i.test(ua) ? "iPhone" : /android/i.test(ua) ? "Android" : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "Mac" : "Apparaat";
  const br = /edg\//i.test(ua) ? "Edge" : /chrome|crios/i.test(ua) ? "Chrome" : /firefox|fxios/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "Browser";
  return `${os} · ${br}`;
}

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent || "");
const isStandalone = () => (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export default function PushSettingsCard({ userId, t, accent, c, toast, SL }) {
  const [state, setState] = useState("loading"); // loading | unsupported | ios-install | denied | off | on
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(null);
  const [endpoint, setEndpoint] = useState(null);

  const refreshCount = async () => {
    if (!userId) return;
    const { count: n } = await supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", userId);
    setCount(typeof n === "number" ? n : null);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pushSupported()) { setState(isIOS() && !isStandalone() ? "ios-install" : "unsupported"); return; }
      if (Notification.permission === "denied") { setState("denied"); return; }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (sub) {
          const j = sub.toJSON();
          setEndpoint(j.endpoint);
          // Rij zeker stellen (bijv. na een DB-opruiming) — onschuldig als hij al bestaat.
          await supabase.from("push_subscriptions").upsert(
            { user_id: userId, endpoint: j.endpoint, p256dh_key: j.keys?.p256dh, auth_key: j.keys?.auth, device_label: deviceLabel(), last_used_at: null },
            { onConflict: "endpoint", ignoreDuplicates: true },
          );
          setState("on");
        } else {
          setState("off");
        }
      } catch { setState("off"); }
      refreshCount();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
      const j = sub.toJSON();
      const { error } = await supabase.from("push_subscriptions").upsert(
        { user_id: userId, endpoint: j.endpoint, p256dh_key: j.keys?.p256dh, auth_key: j.keys?.auth, device_label: deviceLabel() },
        { onConflict: "endpoint" },
      );
      if (error) throw error;
      setEndpoint(j.endpoint);
      setState("on");
      refreshCount();
    } catch (e) {
      console.error("push enable failed:", e);
      toast?.show?.(t.somethingWrong || "Er ging iets mis", "error");
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      const ep = sub?.endpoint || endpoint;
      if (sub) await sub.unsubscribe();
      if (ep) await supabase.from("push_subscriptions").delete().eq("endpoint", ep);
      setEndpoint(null);
      setState("off");
      refreshCount();
    } catch (e) {
      console.error("push disable failed:", e);
      toast?.show?.(t.somethingWrong || "Er ging iets mis", "error");
    } finally { setBusy(false); }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-push-notification", {
        body: { user_id: userId, title: "Vellu", body: t.pushTestSent, url: "/owner", tag: "vellu-test" },
      });
      if (error || data?.error) throw (error || new Error(data.error));
      toast?.show?.(t.pushTestSent, "success");
    } catch (e) {
      console.error("push test failed:", e);
      toast?.show?.(t.somethingWrong || "Er ging iets mis", "error");
    } finally { setBusy(false); }
  };

  const Title = SL || (({ children }) => <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{children}</div>);
  const btn = (primary) => ({
    padding: "9px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: busy ? "wait" : "pointer",
    border: `1px solid ${primary ? accent : c.border}`, background: primary ? accent : "transparent",
    color: primary ? "#fff" : c.text, opacity: busy ? 0.6 : 1,
  });

  return (
    <div style={{ background: c.bgCard, border: "1px solid " + c.border, borderRadius: 20, padding: 16, marginBottom: 12 }}>
      <Title>{t.pushTitle}</Title>
      <div style={{ fontSize: 11, color: c.textLabel, marginBottom: 12 }}>{t.pushDesc}</div>

      {state === "loading" && <div style={{ fontSize: 12, color: c.textSub }}>{t.pushBusy}</div>}
      {state === "unsupported" && <div style={{ fontSize: 12, color: c.textSub }}>{t.pushUnsupported}</div>}
      {state === "ios-install" && (
        <div style={{ fontSize: 12, color: c.text, lineHeight: 1.5, padding: "10px 12px", borderRadius: 12, background: `${accent}0d`, border: `1px solid ${accent}33` }}>
          {t.pushIosHint}
        </div>
      )}
      {state === "denied" && <div style={{ fontSize: 12, color: c.textSub, lineHeight: 1.5 }}>{t.pushDenied}</div>}

      {(state === "off" || state === "on") && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 500, marginRight: "auto" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: state === "on" ? "#2e7d32" : c.inputBorder, display: "inline-block" }} />
            {state === "on" ? t.pushOn : t.pushOff}
            {typeof count === "number" && count > 0 && (
              <span style={{ color: c.textSub, fontWeight: 400 }}>· {t.pushDevices.replace("{n}", String(count))}</span>
            )}
          </div>
          {state === "off" && <button type="button" disabled={busy} onClick={enable} style={btn(true)}>{t.pushEnable}</button>}
          {state === "on" && <button type="button" disabled={busy} onClick={sendTest} style={btn(false)}>{t.pushTest}</button>}
          {state === "on" && <button type="button" disabled={busy} onClick={disable} style={btn(false)}>{t.pushDisable}</button>}
        </div>
      )}
    </div>
  );
}
