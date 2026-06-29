"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { getCookie, setCookie } from "@/lib/cookie";
import { isTrackablePath, TRAFFIC_EVENT_TYPES } from "@/lib/traffic";

const VISITOR_COOKIE = "traffic_visitor_id";
const VISITOR_COOKIE_DAYS = 365;
const SESSION_STORAGE_KEY = "traffic_session_id";
const ATTRIBUTION_STORAGE_KEY = "traffic_attribution";
const HEARTBEAT_INTERVAL_MS = 60 * 1000;

type Attribution = {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
};

function generateId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function getOrCreateVisitorId() {
  const existing = getCookie(VISITOR_COOKIE);
  if (existing) return existing;

  const nextValue = generateId();
  setCookie(VISITOR_COOKIE, nextValue, VISITOR_COOKIE_DAYS);
  return nextValue;
}

function getOrCreateSessionId() {
  const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;

  const nextValue = generateId();
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, nextValue);
  return nextValue;
}

function readStoredAttribution(): Attribution {
  const raw = window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
  if (!raw) {
    return { utmSource: "", utmMedium: "", utmCampaign: "" };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      utmSource: String(parsed?.utmSource || ""),
      utmMedium: String(parsed?.utmMedium || ""),
      utmCampaign: String(parsed?.utmCampaign || ""),
    };
  } catch {
    return { utmSource: "", utmMedium: "", utmCampaign: "" };
  }
}

function resolveAttribution(searchParams: URLSearchParams) {
  const current = {
    utmSource: searchParams.get("utm_source") || "",
    utmMedium: searchParams.get("utm_medium") || "",
    utmCampaign: searchParams.get("utm_campaign") || "",
  };

  if (current.utmSource || current.utmMedium || current.utmCampaign) {
    window.sessionStorage.setItem(
      ATTRIBUTION_STORAGE_KEY,
      JSON.stringify(current)
    );
    return current;
  }

  return readStoredAttribution();
}

function sendTrafficEvent(payload: Record<string, string>) {
  const body = JSON.stringify(payload);

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function"
  ) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon("/api/analytics/traffic", blob);
    return;
  }

  void fetch("/api/analytics/traffic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  });
}

export function SiteTrafficTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchText = searchParams?.toString() || "";

  const postEvent = useCallback(
    (eventType: string) => {
      const currentPath = pathname || window.location.pathname;
      if (!isTrackablePath(currentPath)) return;

      const attribution = resolveAttribution(
        new URLSearchParams(window.location.search || searchText)
      );

      sendTrafficEvent({
        eventType,
        pathname: currentPath,
        visitorId: getOrCreateVisitorId(),
        sessionId: getOrCreateSessionId(),
        pageTitle: document.title || "",
        referrer: document.referrer || "",
        locale: document.documentElement.lang || "",
        utmSource: attribution.utmSource,
        utmMedium: attribution.utmMedium,
        utmCampaign: attribution.utmCampaign,
      });
    },
    [pathname, searchText]
  );

  useEffect(() => {
    if (!pathname || !isTrackablePath(pathname)) return;

    postEvent(TRAFFIC_EVENT_TYPES.PAGEVIEW);

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        postEvent(TRAFFIC_EVENT_TYPES.HEARTBEAT);
      }
    }, HEARTBEAT_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        postEvent(TRAFFIC_EVENT_TYPES.HEARTBEAT);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pathname, searchText, postEvent]);

  return null;
}
