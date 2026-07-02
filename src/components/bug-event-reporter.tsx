"use client";

import { useEffect } from "react";

import { reportBugEvent } from "@/lib/bug-radar-client";

function messageFromReason(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason || "Unhandled promise rejection");
  }
}

function stackFromReason(reason: unknown) {
  return reason instanceof Error ? reason.stack || "" : "";
}

export function BugEventReporter() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      reportBugEvent({
        eventType: "frontend_error",
        severity: "error",
        flow: "frontend_runtime",
        action: "window_error",
        message: event.message || "Window error",
        stack: event.error?.stack || "",
        component: event.filename || "",
        metadata: {
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      reportBugEvent({
        eventType: "unhandled_rejection",
        severity: "error",
        flow: "frontend_runtime",
        action: "unhandledrejection",
        message: messageFromReason(event.reason),
        stack: stackFromReason(event.reason),
      });
    };

    const handleResourceError = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tagName = target.tagName?.toLowerCase();
      const source = target.getAttribute("src") || target.getAttribute("href") || "";
      if (!tagName || !source) return;

      reportBugEvent({
        eventType: "resource_load_failed",
        severity: "warning",
        flow: "resource_loading",
        action: tagName,
        message: `Failed to load ${tagName}`,
        metadata: { source },
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    window.addEventListener("error", handleResourceError, true);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
      window.removeEventListener("error", handleResourceError, true);
    };
  }, []);

  return null;
}
