import { and, desc, eq, gte, sql } from "drizzle-orm";

import { envConfigs } from "@/config";
import { bugProblemEvent, lyricVideoGenerationStep, user as userTable } from "@/config/db/schema";
import { db } from "@/core/db";
import { getUuid, md5 } from "@/lib/hash";

export type BugRadarSeverity = "info" | "warning" | "error";
export type BugRadarPriority = "critical" | "high" | "medium" | "low";

export type BugRadarEventInput = {
  eventType?: string;
  severity?: string;
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
  visitorId?: string;
  sessionId?: string;
  locale?: string;
  metadata?: Record<string, unknown> | null;
  isTest?: boolean;
};

export type BugRadarEventLike = {
  eventType: string;
  severity: string;
  source: string;
  flow: string;
  action: string;
  pathname: string;
  pageTitle?: string | null;
  message?: string | null;
  stack?: string | null;
  component?: string | null;
  apiPath?: string | null;
  method?: string | null;
  statusCode?: number | null;
  projectId?: string | null;
  runId?: string | null;
  visitorId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  userAgent?: string | null;
  locale?: string | null;
  metadataJson?: string | null;
  isTest?: boolean | number | null;
  createdAt: Date;
};

export type BugRadarProblem = {
  key: string;
  eventType: string;
  flow: string;
  action: string;
  pathname: string;
  priority: BugRadarPriority;
  severity: string;
  affectedUsers: number;
  realAffectedUsers: number;
  count: number;
  realEvents: number;
  testEvents: number;
  lastSeenAt: string;
  browserSummary: string;
  deviceSummary: string;
  summary: string;
  sampleMessage: string;
  sources: string[];
  affectedUsersList: Array<{
    id: string;
    label: string;
    email: string;
    name: string;
    eventCount: number;
  }>;
  examples: Array<{
    eventType: string;
    action: string;
    pathname: string;
    message: string;
    source: string;
    visitorId: string;
    userId: string;
    userName: string;
    userEmail: string;
    createdAt: string;
  }>;
};

export type BugRadarFlowSummary = {
  flow: string;
  events: number;
  failures: number;
  affectedUsers: number;
  lastSeenAt: string;
};

export type BugRadarData = {
  hasTable: boolean;
  generatedAt: string;
  summary: {
    totalEvents: number;
    realEvents: number;
    testEvents: number;
    affectedUsers: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  problems: BugRadarProblem[];
  flows: BugRadarFlowSummary[];
  recentEvents: Array<{
    id?: string;
    eventType: string;
    flow: string;
    action: string;
    pathname: string;
    message: string;
    source: string;
    severity: string;
    isTest: boolean;
    createdAt: string;
  }>;
};

const FAILURE_EVENT_PATTERN = /fail|error|invalid|exception|reject|blocked|timeout|restart|decode/i;
const CRITICAL_EVENT_PATTERN = /upload_failed|generation_failed|provider_error|api_error|task_status_failed|create_task_failed/i;
const HIGH_EVENT_PATTERN = /user_error_visible|login_resume_failed|please_restart_process|audio_duration_failed|file_type_invalid|file_size_invalid/i;
const MEDIUM_EVENT_PATTERN = /frontend_error|unhandled_rejection|resource_load_failed/i;

function cleanText(value: unknown, maxLength: number) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function cleanToken(value: unknown, fallback: string, maxLength = 80) {
  const cleaned = cleanText(value, maxLength)
    .toLowerCase()
    .replace(/[^\w\-.:/]/g, "_")
    .replace(/_+/g, "_");
  return cleaned || fallback;
}

function cleanPath(value: unknown) {
  const raw = cleanText(value, 500);
  if (!raw) return "/";
  try {
    return new URL(raw, "https://local.test").pathname || "/";
  } catch {
    return raw.startsWith("/") ? raw : `/${raw}`;
  }
}

function safeJson(value: unknown) {
  if (!value || typeof value !== "object") return "";
  try {
    return JSON.stringify(value).slice(0, 4000);
  } catch {
    return "";
  }
}

function toDate(value: unknown) {
  return value instanceof Date ? value : new Date(value as string);
}

function eventUserKey(event: BugRadarEventLike) {
  return event.userId || event.visitorId || event.sessionId || "unknown";
}

function eventUserLabel(event: BugRadarEventLike) {
  return event.userEmail || event.userName || event.userId || event.visitorId || event.sessionId || "unknown";
}

function isTestEvent(event: BugRadarEventLike) {
  return event.source === "admin_test" || event.isTest === true || event.isTest === 1;
}

export function normalizeBugRadarMessage(value: unknown) {
  const cleaned = cleanText(value, 220);
  if (!cleaned) return "";
  return cleaned
    .replace(/\s+\(reading ['"][^'"]+['"]\)/i, "")
    .replace(/https?:\/\/\S+/g, "[url]")
    .replace(/[a-f0-9]{24,}/gi, "[id]")
    .replace(/\b\d{6,}\b/g, "[number]")
    .slice(0, 180);
}

export function deriveBugRadarPriority(input: {
  eventType: string;
  severity?: string | null;
  affectedUsers: number;
  count: number;
}): BugRadarPriority {
  if (CRITICAL_EVENT_PATTERN.test(input.eventType) || input.affectedUsers >= 3 || input.count >= 10) return "critical";
  if (HIGH_EVENT_PATTERN.test(input.eventType) || input.severity === "error" || input.affectedUsers >= 2) return "high";
  if (MEDIUM_EVENT_PATTERN.test(input.eventType) || input.severity === "warning") return "medium";
  return "low";
}

function parseBrowser(userAgent: string) {
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/Chrome\//.test(userAgent) && !/Chromium|Edg\//.test(userAgent)) return "Chrome";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) return "Safari";
  return userAgent ? "Other" : "Unknown";
}

function parseDevice(userAgent: string) {
  if (/iPhone|Android.+Mobile/i.test(userAgent)) return "Mobile";
  if (/iPad|Tablet/i.test(userAgent)) return "Tablet";
  if (/Windows|Macintosh|Linux/i.test(userAgent)) return "Desktop";
  return "Unknown";
}

function topLabel(counts: Map<string, number>) {
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || "Unknown";
}

function makeProblemKey(event: BugRadarEventLike) {
  return [
    event.eventType || "unknown",
    event.flow || "unknown",
    event.action || "unknown",
    event.pathname || "/",
    normalizeBugRadarMessage(event.message),
  ].join("|");
}

function makeSummary(eventType: string, count: number, affectedUsers: number, message: string) {
  const base = `${affectedUsers} user${affectedUsers === 1 ? "" : "s"} hit ${eventType} ${count} time${count === 1 ? "" : "s"}`;
  return message ? `${base}: ${message}` : base;
}

export function aggregateBugRadarEvents(
  events: BugRadarEventLike[],
  opts: { now?: Date; includeTestEvents?: boolean } = {},
): BugRadarData {
  const now = opts.now || new Date();
  const included = opts.includeTestEvents ? events : events.filter((event) => !isTestEvent(event));
  const problemMap = new Map<string, BugRadarEventLike[]>();
  const flowMap = new Map<string, BugRadarEventLike[]>();
  const userKeys = new Set<string>();

  for (const event of included) {
    problemMap.set(makeProblemKey(event), [...(problemMap.get(makeProblemKey(event)) || []), event]);
    flowMap.set(event.flow || "unknown", [...(flowMap.get(event.flow || "unknown") || []), event]);
    if (!isTestEvent(event)) userKeys.add(eventUserKey(event));
  }

  const problems = Array.from(problemMap.entries()).map(([key, group]) => {
    const first = group[0];
    const sorted = [...group].sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime());
    const allUsers = new Set(group.map(eventUserKey));
    const realUsers = new Set(group.filter((event) => !isTestEvent(event)).map(eventUserKey));
    const browsers = new Map<string, number>();
    const devices = new Map<string, number>();
    const sources = new Set<string>();
    const affectedUserMap = new Map<string, { id: string; label: string; email: string; name: string; eventCount: number }>();
    for (const event of group) {
      browsers.set(parseBrowser(event.userAgent || ""), (browsers.get(parseBrowser(event.userAgent || "")) || 0) + 1);
      devices.set(parseDevice(event.userAgent || ""), (devices.get(parseDevice(event.userAgent || "")) || 0) + 1);
      if (event.source) sources.add(event.source);
      const id = eventUserKey(event);
      const existing = affectedUserMap.get(id);
      affectedUserMap.set(id, {
        id,
        label: eventUserLabel(event),
        email: event.userEmail || "",
        name: event.userName || "",
        eventCount: (existing?.eventCount || 0) + 1,
      });
    }
    const sampleMessage = normalizeBugRadarMessage(first.message);
    const priority = deriveBugRadarPriority({
      eventType: first.eventType,
      severity: first.severity,
      affectedUsers: realUsers.size || allUsers.size,
      count: group.length,
    });

    return {
      key: md5(key).slice(0, 16),
      eventType: first.eventType,
      flow: first.flow || "unknown",
      action: first.action || "unknown",
      pathname: first.pathname || "/",
      priority,
      severity: first.severity || "info",
      affectedUsers: allUsers.size,
      realAffectedUsers: realUsers.size,
      count: group.length,
      realEvents: group.filter((event) => !isTestEvent(event)).length,
      testEvents: group.filter(isTestEvent).length,
      lastSeenAt: toDate(sorted[0].createdAt).toISOString(),
      browserSummary: topLabel(browsers),
      deviceSummary: topLabel(devices),
      summary: makeSummary(first.eventType, group.length, allUsers.size, sampleMessage),
      sampleMessage,
      sources: Array.from(sources).sort(),
      affectedUsersList: Array.from(affectedUserMap.values())
        .sort((a, b) => b.eventCount - a.eventCount || a.label.localeCompare(b.label))
        .slice(0, 8),
      examples: sorted.slice(0, 5).map((event) => ({
        eventType: event.eventType,
        action: event.action || "",
        pathname: event.pathname || "",
        message: normalizeBugRadarMessage(event.message),
        source: event.source || "",
        visitorId: event.visitorId || "",
        userId: event.userId || "",
        userName: event.userName || "",
        userEmail: event.userEmail || "",
        createdAt: toDate(event.createdAt).toISOString(),
      })),
    };
  });

  problems.sort((a, b) => {
    const weights: Record<BugRadarPriority, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return (
      weights[b.priority] - weights[a.priority] ||
      b.realAffectedUsers - a.realAffectedUsers ||
      b.count - a.count ||
      new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()
    );
  });

  const flows = Array.from(flowMap.entries())
    .map(([flow, group]) => ({
      flow,
      events: group.length,
      failures: group.filter((event) => FAILURE_EVENT_PATTERN.test(event.eventType) || event.severity === "error").length,
      affectedUsers: new Set(group.filter((event) => !isTestEvent(event)).map(eventUserKey)).size,
      lastSeenAt: new Date(Math.max(...group.map((event) => toDate(event.createdAt).getTime()))).toISOString(),
    }))
    .sort((a, b) => b.failures - a.failures || b.events - a.events);

  const realEvents = included.filter((event) => !isTestEvent(event)).length;
  const testEvents = included.filter(isTestEvent).length;

  return {
    hasTable: true,
    generatedAt: now.toISOString(),
    summary: {
      totalEvents: included.length,
      realEvents,
      testEvents,
      affectedUsers: userKeys.size,
      critical: problems.filter((item) => item.priority === "critical").length,
      high: problems.filter((item) => item.priority === "high").length,
      medium: problems.filter((item) => item.priority === "medium").length,
      low: problems.filter((item) => item.priority === "low").length,
    },
    problems,
    flows,
    recentEvents: [...included]
      .sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime())
      .slice(0, 20)
      .map((event) => ({
        eventType: event.eventType,
        flow: event.flow || "",
        action: event.action || "",
        pathname: event.pathname || "",
        message: normalizeBugRadarMessage(event.message),
        source: event.source || "",
        severity: event.severity || "info",
        isTest: isTestEvent(event),
        createdAt: toDate(event.createdAt).toISOString(),
      })),
  };
}

function getRows(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows;
  }
  return [];
}

function isMissingBugRadarTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /bug_problem_event|no such table|does not exist|undefined_table|relation .* does not exist/i.test(message);
}

export async function hasBugProblemEventTable() {
  const provider = envConfigs.database_provider;
  let result: unknown;

  if (provider === "mysql") {
    result = await db().execute(
      sql`select table_name from information_schema.tables where table_schema = database() and table_name = 'bug_problem_event' limit 1`,
    );
  } else if (provider === "sqlite" || provider === "turso" || provider === "d1") {
    result = await db().execute(
      sql`select name from sqlite_master where type = 'table' and name = 'bug_problem_event' limit 1`,
    );
  } else {
    result = await db().execute(sql`select to_regclass('bug_problem_event') as table_name`);
  }

  return getRows(result).some((row) => Object.values(row || {}).some(Boolean));
}

export function normalizeBugRadarEventInput(input: BugRadarEventInput) {
  const eventType = cleanToken(input.eventType, "unknown_event");
  const severity: BugRadarSeverity = input.severity === "info" || input.severity === "warning" || input.severity === "error"
    ? input.severity
    : FAILURE_EVENT_PATTERN.test(eventType)
      ? "error"
      : "info";

  return {
    eventType,
    severity,
    source: cleanToken(input.source, "client", 40),
    flow: cleanToken(input.flow, "unknown", 60),
    action: cleanToken(input.action, eventType, 80),
    pathname: cleanPath(input.pathname),
    pageTitle: cleanText(input.pageTitle, 200),
    message: cleanText(input.message, 500),
    stack: cleanText(input.stack, 2000),
    component: cleanText(input.component, 120),
    apiPath: cleanText(input.apiPath, 300),
    method: cleanToken(input.method, "", 12).toUpperCase(),
    statusCode: Number.isFinite(Number(input.statusCode)) ? Number(input.statusCode) : null,
    projectId: cleanText(input.projectId, 120),
    runId: cleanText(input.runId, 120),
    visitorId: cleanText(input.visitorId, 120),
    sessionId: cleanText(input.sessionId, 120),
    locale: cleanText(input.locale, 24),
    metadataJson: safeJson(input.metadata),
    isTest: Boolean(input.isTest || input.source === "admin_test"),
  };
}

export async function recordBugProblemEvent(input: BugRadarEventInput & { userId?: string | null; userAgent?: string; ip?: string }) {
  const normalized = normalizeBugRadarEventInput(input);

  if (!(await hasBugProblemEventTable())) {
    return { ok: true, skipped: true, reason: "missing_table" as const };
  }

  await db()
    .insert(bugProblemEvent)
    .values({
      id: getUuid(),
      ...normalized,
      userId: input.userId || "",
      userAgent: cleanText(input.userAgent, 500),
      ipHash: input.ip ? md5(input.ip).slice(0, 24) : "",
    });

  return { ok: true, skipped: false };
}

export async function getAdminBugRadarData(opts: { includeTestEvents?: boolean; hours?: number } = {}): Promise<BugRadarData> {
  try {
    if (!(await hasBugProblemEventTable())) {
      return emptyBugRadarData(false);
    }

    const hours = Math.min(168, Math.max(1, Number(opts.hours || 24)));
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const eventRows = await db()
      .select({
        event: bugProblemEvent,
        userName: userTable.name,
        userEmail: userTable.email,
      })
      .from(bugProblemEvent)
      .leftJoin(userTable, eq(userTable.id, bugProblemEvent.userId))
      .where(and(gte(bugProblemEvent.createdAt, since)))
      .orderBy(desc(bugProblemEvent.createdAt))
      .limit(500);
    const rows = eventRows.map((row: any) => ({
      ...row.event,
      userName: row.userName || "",
      userEmail: row.userEmail || "",
    }));
    const failedSteps = await db()
      .select({
        step: lyricVideoGenerationStep,
        userName: userTable.name,
        userEmail: userTable.email,
      })
      .from(lyricVideoGenerationStep)
      .leftJoin(userTable, eq(userTable.id, lyricVideoGenerationStep.userId))
      .where(and(eq(lyricVideoGenerationStep.status, "failed"), gte(lyricVideoGenerationStep.updatedAt, since)))
      .orderBy(desc(lyricVideoGenerationStep.updatedAt))
      .limit(200);
    const stepEvents: BugRadarEventLike[] = failedSteps.map((row: any) => {
      const step = row.step;
      return {
      eventType: step.provider ? "provider_error" : "task_status_failed",
      severity: "error",
      source: "generation_step",
      flow: "lyric_video_generation",
      action: step.stage || "generation_step_failed",
      pathname: "/create",
      message: step.errorMessage || "Generation step failed",
      stack: "",
      component: "",
      apiPath: "",
      method: "",
      statusCode: null,
      projectId: step.projectId || "",
      runId: step.runId || "",
      visitorId: "",
      sessionId: "",
      userId: step.userId || "",
      userName: row.userName || "",
      userEmail: row.userEmail || "",
      userAgent: "",
      locale: "",
      metadataJson: JSON.stringify({
        provider: step.provider || "",
        model: step.model || "",
        providerTaskId: step.providerTaskId || "",
        attemptCount: step.attemptCount || 0,
      }),
      isTest: false,
      createdAt: step.updatedAt || step.createdAt || new Date(),
      };
    });

    return aggregateBugRadarEvents([...(rows as BugRadarEventLike[]), ...stepEvents], {
      includeTestEvents: opts.includeTestEvents,
    });
  } catch (error) {
    if (isMissingBugRadarTableError(error)) return emptyBugRadarData(false);
    throw error;
  }
}

export function emptyBugRadarData(hasTable = true): BugRadarData {
  return {
    hasTable,
    generatedAt: new Date().toISOString(),
    summary: {
      totalEvents: 0,
      realEvents: 0,
      testEvents: 0,
      affectedUsers: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    },
    problems: [],
    flows: [],
    recentEvents: [],
  };
}
