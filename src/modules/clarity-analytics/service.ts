import { getAllConfigs } from "@/modules/config/service";
import { db } from "@/core/db";
import { clarityMetricRow, claritySyncRun } from "@/config/db/schema";
import { getUuid } from "@/lib/hash";
import { desc, eq } from "drizzle-orm";

const CLARITY_ENDPOINT =
  "https://www.clarity.ms/export-data/api/v1/project-live-insights";
const CLARITY_DIMENSIONS = ["URL", "Source", "Device"] as const;

export const CLARITY_INSIGHT_PROFILES = [
  {
    key: "problem_pages",
    label: "Problem Pages",
    dimensions: ["URL", "Device", "Source"],
  },
  {
    key: "traffic_quality",
    label: "Traffic Quality",
    dimensions: ["Channel", "Source", "Campaign"],
  },
  {
    key: "device_issues",
    label: "Device Issues",
    dimensions: ["Device", "OS", "Browser"],
  },
] as const;

export type ClarityMetricRow = {
  label: string;
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
};

export type ClarityMetricGroup = {
  name: string;
  label: string;
  rows: ClarityMetricRow[];
};

export type ClarityAnalyticsData = {
  configured: boolean;
  days: number;
  fetchedAt: string | null;
  groups: ClarityMetricGroup[];
  error?: "missing_token" | "clarity_request_failed" | "invalid_response";
  status?: number;
  message?: string;
};

export type ClaritySyncRunStatus = "running" | "success" | "failed";

export type ClarityStoredRun = {
  id: string;
  days: number;
  profiles: string[];
  status: ClaritySyncRunStatus;
  rowCount: number;
  errorMessage: string | null;
  startedAt: string;
  fetchedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type ClarityStoredRow = {
  id: string;
  syncRunId: string;
  profile: string;
  metricName: string;
  metricLabel: string;
  rowLabel: string;
  url: string;
  source: string;
  device: string;
  channel: string;
  campaign: string;
  browser: string;
  os: string;
  countryRegion: string;
  pageTitle: string;
  referrerUrl: string;
  dimensions: Record<string, string>;
  metrics: Record<string, number>;
  primaryMetricName: string;
  primaryMetricValue: number;
  createdAt: string;
};

export type ClarityInsightsDashboard = {
  hasTable: boolean;
  configured: boolean;
  latestRun: ClarityStoredRun | null;
  runs: ClarityStoredRun[];
  rows: ClarityStoredRow[];
  profiles: typeof CLARITY_INSIGHT_PROFILES;
};

type FetchFn = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
  }
) => Promise<Response>;

type RawClarityGroup = {
  metricName?: unknown;
  information?: unknown;
};

type RawClarityRow = Record<string, unknown>;
type ClarityInsightProfile = typeof CLARITY_INSIGHT_PROFILES[number];
type NewClarityMetricRow = typeof clarityMetricRow.$inferInsert;
type ClaritySyncRunRecord = typeof claritySyncRun.$inferSelect;

const METRIC_LABELS: Record<string, string> = {
  Traffic: "Traffic",
  PopularPages: "Popular Pages",
  "Popular Pages": "Popular Pages",
  Browser: "Browser",
  Device: "Device",
  OS: "OS",
  "Country/Region": "Country / Region",
  "Page Title": "Page Title",
  "Referrer URL": "Referrer URL",
  "Dead Click Count": "Dead Clicks",
  "Excessive Scroll": "Excessive Scrolls",
  "Rage Click Count": "Rage Clicks",
  "Quickback Click": "Quickbacks",
  "Script Error Count": "Script Errors",
  "Error Click Count": "Error Clicks",
};

const DIMENSION_KEYS = new Set([
  "Browser",
  "Device",
  "Country/Region",
  "OS",
  "Source",
  "Medium",
  "Campaign",
  "Channel",
  "URL",
  "url",
  "name",
  "Page Title",
  "Referrer URL",
]);

export function normalizeClarityDays(value?: string | number | null) {
  const days = Number(value);
  if (!Number.isFinite(days)) return 1;
  return Math.min(3, Math.max(1, Math.trunc(days)));
}

function numberFromValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stringFromValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toLabel(name: string) {
  return METRIC_LABELS[name] || name.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function pickRowLabel(row: RawClarityRow) {
  const candidates = [
    row.URL,
    row.url,
    row.name,
    row.Source,
    row.Device,
    row.Browser,
    row.OS,
    row["Country/Region"],
    row.Channel,
    row.Medium,
    row.Campaign,
    row["Page Title"],
    row["Referrer URL"],
  ];

  return candidates.map(stringFromValue).find(Boolean) || "Unknown";
}

function normalizeRows(rows: unknown): ClarityMetricRow[] {
  if (!Array.isArray(rows)) return [];

  return rows
    .filter((row): row is RawClarityRow => !!row && typeof row === "object")
    .map((row) => {
      const dimensions: Record<string, string> = {};
      const metrics: Record<string, number> = {};

      for (const [key, value] of Object.entries(row)) {
        if (DIMENSION_KEYS.has(key)) {
          const normalized = stringFromValue(value);
          if (normalized) dimensions[key] = normalized;
          continue;
        }

        const metricValue = numberFromValue(value);
        if (metricValue !== 0) metrics[key] = metricValue;
      }

      return {
        label: pickRowLabel(row),
        dimensions,
        metrics,
      };
    })
    .filter((row) => Object.keys(row.metrics).length > 0)
    .slice(0, 12);
}

function normalizePayload(payload: unknown): ClarityMetricGroup[] {
  if (!Array.isArray(payload)) {
    throw new Error("invalid_response");
  }

  return payload
    .filter((group): group is RawClarityGroup => !!group && typeof group === "object")
    .map((group) => {
      const name = stringFromValue(group.metricName) || "Metric";
      return {
        name,
        label: toLabel(name),
        rows: normalizeRows(group.information),
      };
    })
    .filter((group) => group.rows.length > 0);
}

function buildClarityUrl(days: number, dimensions: readonly string[] = CLARITY_DIMENSIONS) {
  const url = new URL(CLARITY_ENDPOINT);
  url.searchParams.set("numOfDays", String(days));

  dimensions.forEach((dimension, index) => {
    url.searchParams.set(`dimension${index + 1}`, dimension);
  });

  return url.toString();
}

async function readErrorMessage(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return "";

  try {
    const parsed = JSON.parse(text);
    return stringFromValue(parsed?.message || parsed?.error || text);
  } catch {
    return text.slice(0, 160);
  }
}

export async function getClarityAnalyticsData({
  days,
  token,
  fetchFn = fetch,
}: {
  days?: string | number | null;
  token?: string | null;
  fetchFn?: FetchFn;
} = {}): Promise<ClarityAnalyticsData> {
  const normalizedDays = normalizeClarityDays(days);
  const apiToken = await resolveClarityToken(token);
  const cleanToken = stringFromValue(apiToken);

  if (!cleanToken) {
    return {
      configured: false,
      days: normalizedDays,
      fetchedAt: null,
      groups: [],
      error: "missing_token",
    };
  }

  let response: Response;
  try {
    response = await fetchFn(buildClarityUrl(normalizedDays), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    return {
      configured: true,
      days: normalizedDays,
      fetchedAt: null,
      groups: [],
      error: "clarity_request_failed",
      message: error?.message || "Request failed",
    };
  }

  if (!response.ok) {
    return {
      configured: true,
      days: normalizedDays,
      fetchedAt: null,
      groups: [],
      error: "clarity_request_failed",
      status: response.status,
      message: await readErrorMessage(response),
    };
  }

  try {
    const payload = await response.json();
    return {
      configured: true,
      days: normalizedDays,
      fetchedAt: new Date().toISOString(),
      groups: normalizePayload(payload),
    };
  } catch {
    return {
      configured: true,
      days: normalizedDays,
      fetchedAt: null,
      groups: [],
      error: "invalid_response",
    };
  }
}

async function resolveClarityToken(token?: string | null) {
  return token === undefined
    ? (await getAllConfigs()).clarity_api_token
    : token;
}

async function fetchClarityGroups({
  days,
  token,
  dimensions,
  fetchFn,
}: {
  days: number;
  token: string;
  dimensions: readonly string[];
  fetchFn: FetchFn;
}): Promise<ClarityMetricGroup[]> {
  const response = await fetchFn(buildClarityUrl(days, dimensions), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const status = response.status ? ` (${response.status})` : "";
    const message = await readErrorMessage(response);
    throw new Error(`Clarity request failed${status}${message ? `: ${message}` : ""}`);
  }

  return normalizePayload(await response.json());
}

function getPrimaryMetric(metrics: Record<string, number>) {
  const entries = Object.entries(metrics);
  if (entries.length === 0) return { name: "", value: 0 };

  const preferred =
    entries.find(([key]) => /rage|dead|error|quickback|scroll|engagement|session|traffic|count/i.test(key)) ||
    entries[0];

  return { name: preferred[0], value: preferred[1] };
}

function dimensionValue(
  dimensions: Record<string, string>,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = dimensions[key];
    if (value) return value;
  }
  return "";
}

function flattenClarityRows({
  runId,
  profile,
  groups,
}: {
  runId: string;
  profile: ClarityInsightProfile;
  groups: ClarityMetricGroup[];
}): NewClarityMetricRow[] {
  return groups.flatMap((group) =>
    group.rows.map((row) => {
      const primaryMetric = getPrimaryMetric(row.metrics);

      return {
        id: getUuid(),
        syncRunId: runId,
        profile: profile.key,
        metricName: group.name,
        metricLabel: group.label,
        rowLabel: row.label,
        url: dimensionValue(row.dimensions, "URL", "url"),
        source: dimensionValue(row.dimensions, "Source", "Medium"),
        device: dimensionValue(row.dimensions, "Device"),
        channel: dimensionValue(row.dimensions, "Channel"),
        campaign: dimensionValue(row.dimensions, "Campaign"),
        browser: dimensionValue(row.dimensions, "Browser"),
        os: dimensionValue(row.dimensions, "OS"),
        countryRegion: dimensionValue(row.dimensions, "Country/Region"),
        pageTitle: dimensionValue(row.dimensions, "Page Title", "name"),
        referrerUrl: dimensionValue(row.dimensions, "Referrer URL"),
        dimensions: JSON.stringify(row.dimensions),
        metrics: JSON.stringify(row.metrics),
        primaryMetricName: primaryMetric.name,
        primaryMetricValue: String(primaryMetric.value),
      };
    })
  );
}

function parseJsonRecord(value: string | null) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function serializeRun(run: typeof claritySyncRun.$inferSelect): ClarityStoredRun {
  return {
    id: run.id,
    days: run.days,
    profiles: Object.keys(parseJsonRecord(run.profiles)),
    status: run.status as ClaritySyncRunStatus,
    rowCount: run.rowCount,
    errorMessage: run.errorMessage,
    startedAt: toIso(run.startedAt) || "",
    fetchedAt: toIso(run.fetchedAt),
    completedAt: toIso(run.completedAt),
    createdAt: toIso(run.createdAt) || "",
  };
}

function serializeRow(row: typeof clarityMetricRow.$inferSelect): ClarityStoredRow {
  return {
    id: row.id,
    syncRunId: row.syncRunId,
    profile: row.profile,
    metricName: row.metricName,
    metricLabel: row.metricLabel,
    rowLabel: row.rowLabel,
    url: row.url,
    source: row.source,
    device: row.device,
    channel: row.channel,
    campaign: row.campaign,
    browser: row.browser,
    os: row.os,
    countryRegion: row.countryRegion,
    pageTitle: row.pageTitle,
    referrerUrl: row.referrerUrl,
    dimensions: parseJsonRecord(row.dimensions) as Record<string, string>,
    metrics: parseJsonRecord(row.metrics) as Record<string, number>,
    primaryMetricName: row.primaryMetricName,
    primaryMetricValue: Number(row.primaryMetricValue) || 0,
    createdAt: toIso(row.createdAt) || "",
  };
}

function isMissingTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /clarity_sync_run|clarity_metric_row|does not exist|no such table/i.test(message);
}

export async function syncClarityInsights({
  days,
  token,
  fetchFn = fetch,
}: {
  days?: string | number | null;
  token?: string | null;
  fetchFn?: FetchFn;
} = {}) {
  const normalizedDays = normalizeClarityDays(days);
  const cleanToken = stringFromValue(await resolveClarityToken(token));

  if (!cleanToken) {
    return {
      configured: false,
      run: null,
      rows: [],
      error: "missing_token" as const,
    };
  }

  const runId = getUuid();
  const now = new Date();
  const profileMap = Object.fromEntries(
    CLARITY_INSIGHT_PROFILES.map((profile) => [profile.key, profile.dimensions])
  );

  await db().insert(claritySyncRun).values({
    id: runId,
    days: normalizedDays,
    profiles: JSON.stringify(profileMap),
    status: "running",
    rowCount: 0,
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  try {
    const rows: NewClarityMetricRow[] = [];

    for (const profile of CLARITY_INSIGHT_PROFILES) {
      const groups = await fetchClarityGroups({
        days: normalizedDays,
        token: cleanToken,
        dimensions: profile.dimensions,
        fetchFn,
      });
      rows.push(...flattenClarityRows({ runId, profile, groups }));
    }

    if (rows.length > 0) {
      await db().insert(clarityMetricRow).values(rows);
    }

    const completedAt = new Date();
    const [updatedRun] = await db()
      .update(claritySyncRun)
      .set({
        status: "success",
        rowCount: rows.length,
        fetchedAt: completedAt,
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(claritySyncRun.id, runId))
      .returning();

    return {
      configured: true,
      run: serializeRun(updatedRun),
      rows: rows.map((row) =>
        serializeRow({
          ...row,
          createdAt: row.createdAt || completedAt,
        } as typeof clarityMetricRow.$inferSelect)
      ),
    };
  } catch (error: any) {
    const completedAt = new Date();
    const message = error?.message || "Clarity sync failed";
    const [updatedRun] = await db()
      .update(claritySyncRun)
      .set({
        status: "failed",
        errorMessage: message,
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(claritySyncRun.id, runId))
      .returning();

    return {
      configured: true,
      run: serializeRun(updatedRun),
      rows: [],
      error: "clarity_request_failed" as const,
      message,
    };
  }
}

export async function getClarityInsightsDashboard(): Promise<ClarityInsightsDashboard> {
  const configured = !!stringFromValue((await getAllConfigs()).clarity_api_token);

  try {
    const runs = await db()
      .select()
      .from(claritySyncRun)
      .orderBy(desc(claritySyncRun.createdAt))
      .limit(10);
    const latestRun = runs.find((run: ClaritySyncRunRecord) => run.status === "success") || null;
    const rows = latestRun
      ? await db()
          .select()
          .from(clarityMetricRow)
          .where(eq(clarityMetricRow.syncRunId, latestRun.id))
          .orderBy(desc(clarityMetricRow.createdAt))
      : [];

    return {
      hasTable: true,
      configured,
      latestRun: latestRun ? serializeRun(latestRun) : null,
      runs: runs.map(serializeRun),
      rows: rows.map(serializeRow),
      profiles: CLARITY_INSIGHT_PROFILES,
    };
  } catch (error) {
    if (!isMissingTableError(error)) throw error;

    return {
      hasTable: false,
      configured,
      latestRun: null,
      runs: [],
      rows: [],
      profiles: CLARITY_INSIGHT_PROFILES,
    };
  }
}
