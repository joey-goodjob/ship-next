"use client";

const VISITOR_KEY = "bug_radar_visitor_id";
const SESSION_KEY = "bug_radar_session_id";

export type BugEventPayload = {
  eventType: string;
  severity?: "info" | "warning" | "error";
  source?: string;
  flow?: string;
  action?: string;
  pathname?: string;
  pageTitle?: string;
  message?: string;
  stack?: string;
  component?: string;
  apiPath?: string;
  method?: string;
  statusCode?: number;
  projectId?: string;
  runId?: string;
  metadata?: Record<string, unknown>;
  isTest?: boolean;
};

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function getOrCreateLocalStorageId(key: string) {
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const next = makeId();
    window.localStorage.setItem(key, next);
    return next;
  } catch {
    return "";
  }
}

function getOrCreateSessionStorageId(key: string) {
  try {
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const next = makeId();
    window.sessionStorage.setItem(key, next);
    return next;
  } catch {
    return "";
  }
}

function sendBugEvent(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon("/api/bug-events", blob);
    return;
  }

  void fetch("/api/bug-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export function reportBugEvent(event: BugEventPayload) {
  if (typeof window === "undefined") return;

  sendBugEvent({
    severity: "info",
    source: "client",
    pathname: window.location.pathname,
    pageTitle: document.title || "",
    locale: document.documentElement.lang || "",
    visitorId: getOrCreateLocalStorageId(VISITOR_KEY),
    sessionId: getOrCreateSessionStorageId(SESSION_KEY),
    ...event,
  });
}

export function reportVisibleUserError(message: string, metadata?: Record<string, unknown>) {
  reportBugEvent({
    eventType: "user_error_visible",
    severity: "warning",
    flow: metadata?.flow ? String(metadata.flow) : "unknown",
    action: "toast_error",
    message,
    metadata,
  });
}
