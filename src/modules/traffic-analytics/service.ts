import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";

import { envConfigs } from "@/config";
import { trafficEvent } from "@/config/db/schema";
import { db } from "@/core/db";
import {
  getCanonicalChannelDetail,
  getTrafficSourceLabel,
  isMissingTrafficTableError,
  normalizeStoredChannel,
  normalizeTrafficText,
  TRAFFIC_EVENT_TYPES,
} from "@/lib/traffic";

export type TrafficAnalyticsRangePreset = "today" | "yesterday" | "custom";

export type TrafficSummaryCard = {
  uniqueVisitors: number;
  pageViews: number;
  onlineVisitors: number;
};

export type TrafficTrendPoint = {
  label: string;
  pageViews: number;
  uniqueVisitors: number;
};

export type TrafficPageRow = {
  pathname: string;
  pageTitle: string;
  pageViews: number;
  uniqueVisitors: number;
};

export type TrafficSourceRow = {
  channel: string;
  label: string;
  detail: string;
  pageViews: number;
  uniqueVisitors: number;
};

export type TrafficLocationRow = {
  country: string;
  region: string;
  pageViews: number;
  uniqueVisitors: number;
};

export type TrafficAnalyticsData = {
  timeZone: string;
  rangePreset: TrafficAnalyticsRangePreset;
  rangeLabel: string;
  startDate: string;
  endDate: string;
  summary: TrafficSummaryCard;
  trend: TrafficTrendPoint[];
  pages: TrafficPageRow[];
  sources: TrafficSourceRow[];
  locations: TrafficLocationRow[];
  hasTable: boolean;
};

type DateRange = {
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
};

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function getRows(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows;
  }
  return [];
}

export async function hasTrafficEventTable() {
  const provider = envConfigs.database_provider;
  let result: unknown;

  if (provider === "mysql") {
    result = await db().execute(
      sql`select table_name from information_schema.tables where table_schema = database() and table_name = 'traffic_event' limit 1`
    );
  } else if (provider === "sqlite" || provider === "turso" || provider === "d1") {
    result = await db().execute(
      sql`select name from sqlite_master where type = 'table' and name = 'traffic_event' limit 1`
    );
  } else {
    result = await db().execute(
      sql`select to_regclass('traffic_event') as table_name`
    );
  }

  return getRows(result).some((row) => {
    if (!row || typeof row !== "object") return false;
    const values = Object.values(row);
    return values.some(Boolean);
  });
}

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    year: toNumber(values.year),
    month: toNumber(values.month),
    day: toNumber(values.day),
    hour: toNumber(values.hour),
    minute: toNumber(values.minute),
    second: toNumber(values.second),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getDatePartsInTimeZone(date, timeZone);

  return (
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    ) - date.getTime()
  );
}

function formatDateInput(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getDayRange(timeZone: string, offsetDays = 0, now = new Date()) {
  const parts = getDatePartsInTimeZone(now, timeZone);
  const startUtcGuess = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays, 0, 0, 0)
  );
  const endUtcGuess = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + offsetDays + 1, 0, 0, 0)
  );

  const start = new Date(
    startUtcGuess.getTime() - getTimeZoneOffsetMs(startUtcGuess, timeZone)
  );
  const end = new Date(
    endUtcGuess.getTime() - getTimeZoneOffsetMs(endUtcGuess, timeZone)
  );

  return {
    start,
    end,
    startDate: formatDateInput(start, timeZone),
    endDate: formatDateInput(new Date(end.getTime() - 1000), timeZone),
  };
}

function parseDateInput(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split("-").map((item) => Number(item));
  if (!year || !month || !day) return null;

  return { year, month, day };
}

function buildCustomRange({
  startDate,
  endDate,
  timeZone,
}: {
  startDate?: string | null;
  endDate?: string | null;
  timeZone: string;
}): DateRange {
  const startParts = parseDateInput(startDate);
  const endParts = parseDateInput(endDate);

  if (!startParts || !endParts) return getDayRange(timeZone, 0);

  const startUtcGuess = new Date(
    Date.UTC(startParts.year, startParts.month - 1, startParts.day, 0, 0, 0)
  );
  const endUtcGuess = new Date(
    Date.UTC(endParts.year, endParts.month - 1, endParts.day + 1, 0, 0, 0)
  );

  const start = new Date(
    startUtcGuess.getTime() - getTimeZoneOffsetMs(startUtcGuess, timeZone)
  );
  const end = new Date(
    endUtcGuess.getTime() - getTimeZoneOffsetMs(endUtcGuess, timeZone)
  );

  if (end <= start) return getDayRange(timeZone, 0);

  return {
    start,
    end,
    startDate: startDate!,
    endDate: endDate!,
  };
}

function resolveRange({
  rangePreset,
  startDate,
  endDate,
  timeZone,
}: {
  rangePreset?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  timeZone: string;
}): { rangePreset: TrafficAnalyticsRangePreset; range: DateRange } {
  if (rangePreset === "yesterday") {
    return {
      rangePreset: "yesterday",
      range: getDayRange(timeZone, -1),
    };
  }

  if (rangePreset === "custom") {
    return {
      rangePreset: "custom",
      range: buildCustomRange({ startDate, endDate, timeZone }),
    };
  }

  return {
    rangePreset: "today",
    range: getDayRange(timeZone, 0),
  };
}

function formatRangeLabel(startDate: string, endDate: string) {
  return startDate === endDate ? startDate : `${startDate} - ${endDate}`;
}

function shouldUseHourlyTrend(start: Date, end: Date) {
  return end.getTime() - start.getTime() <= 2 * 24 * 60 * 60 * 1000;
}

function formatTrendLabel(
  value: Date,
  timeZone: string,
  granularity: "hour" | "day"
) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "2-digit",
    day: "2-digit",
    ...(granularity === "hour"
      ? { hour: "2-digit", minute: "2-digit", hour12: false }
      : {}),
  }).format(value);
}

function buildTrendBuckets({
  start,
  end,
  timeZone,
  granularity,
}: {
  start: Date;
  end: Date;
  timeZone: string;
  granularity: "hour" | "day";
}) {
  const buckets: TrafficTrendPoint[] = [];
  const cursor = new Date(start);
  const stepMs = granularity === "hour" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  while (cursor < end) {
    buckets.push({
      label: formatTrendLabel(cursor, timeZone, granularity),
      pageViews: 0,
      uniqueVisitors: 0,
    });
    cursor.setTime(cursor.getTime() + stepMs);
  }

  return buckets;
}

type RawSourceRow = {
  channel: string | null;
  detail: string;
  pageViews: number | bigint | string;
  uniqueVisitors: number | bigint | string;
};

type RawPageRow = {
  pathname: string;
  pageTitle: string;
  pageViews: number | bigint | string;
  uniqueVisitors: number | bigint | string;
};

type RawLocationRow = {
  country: string;
  region: string;
  pageViews: number | bigint | string;
  uniqueVisitors: number | bigint | string;
};

function mergeSourceRows(rows: RawSourceRow[]): TrafficSourceRow[] {
  const merged = new Map<
    string,
    { pageViews: number; uniqueVisitors: number; rawDetail: string }
  >();

  for (const row of rows) {
    const raw = row.channel || "direct";
    const channel = normalizeStoredChannel(raw);
    const pv = toNumber(row.pageViews);
    const uv = toNumber(row.uniqueVisitors);
    const detail = normalizeTrafficText(row.detail, 120);

    const existing = merged.get(channel);
    if (existing) {
      merged.set(channel, {
        pageViews: existing.pageViews + pv,
        uniqueVisitors: existing.uniqueVisitors + uv,
        rawDetail: pv > existing.pageViews ? detail : existing.rawDetail,
      });
    } else {
      merged.set(channel, { pageViews: pv, uniqueVisitors: uv, rawDetail: detail });
    }
  }

  return Array.from(merged.entries())
    .sort((a, b) => b[1].pageViews - a[1].pageViews)
    .slice(0, 12)
    .map(([channel, { pageViews, uniqueVisitors, rawDetail }]) => ({
      channel,
      label: getTrafficSourceLabel(channel),
      detail: getCanonicalChannelDetail(channel) || rawDetail,
      pageViews,
      uniqueVisitors,
    }));
}

function emptyTrafficResult({
  rangePreset,
  range,
  timeZone,
  hasTable,
}: {
  rangePreset: TrafficAnalyticsRangePreset;
  range: DateRange;
  timeZone: string;
  hasTable: boolean;
}): TrafficAnalyticsData {
  return {
    timeZone,
    rangePreset,
    rangeLabel: formatRangeLabel(range.startDate, range.endDate),
    startDate: range.startDate,
    endDate: range.endDate,
    summary: {
      uniqueVisitors: 0,
      pageViews: 0,
      onlineVisitors: 0,
    },
    trend: [],
    pages: [],
    sources: [],
    locations: [],
    hasTable,
  };
}

export async function getTrafficAnalyticsData({
  rangePreset,
  startDate,
  endDate,
  timeZone = "UTC",
}: {
  rangePreset?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  timeZone?: string;
} = {}): Promise<TrafficAnalyticsData> {
  const resolved = resolveRange({
    rangePreset,
    startDate,
    endDate,
    timeZone,
  });
  const { start, end } = resolved.range;
  const emptyResult = emptyTrafficResult({
    rangePreset: resolved.rangePreset,
    range: resolved.range,
    timeZone,
    hasTable: false,
  });

  if (!(await hasTrafficEventTable())) {
    return emptyResult;
  }

  const pageviewFilter = and(
    eq(trafficEvent.eventType, TRAFFIC_EVENT_TYPES.PAGEVIEW),
    gte(trafficEvent.createdAt, start),
    lt(trafficEvent.createdAt, end)
  );

  try {
    const [summaryRows, onlineRows, pageRows, sourceRows, locationRows] =
      await Promise.all([
        db()
          .select({
            uniqueVisitors:
              sql<string>`count(distinct ${trafficEvent.visitorId})`.as(
                "uniqueVisitors"
              ),
            pageViews: count(),
          })
          .from(trafficEvent)
          .where(pageviewFilter),
        db()
          .select({
            onlineVisitors:
              sql<string>`count(distinct ${trafficEvent.visitorId})`.as(
                "onlineVisitors"
              ),
          })
          .from(trafficEvent)
          .where(
            gte(trafficEvent.createdAt, new Date(Date.now() - 5 * 60 * 1000))
          ),
        db()
          .select({
            pathname: trafficEvent.normalizedPath,
            pageTitle:
              sql<string>`coalesce(max(nullif(${trafficEvent.pageTitle}, '')), '')`.as(
                "pageTitle"
              ),
            pageViews: count(),
            uniqueVisitors:
              sql<string>`count(distinct ${trafficEvent.visitorId})`.as(
                "uniqueVisitors"
              ),
          })
          .from(trafficEvent)
          .where(pageviewFilter)
          .groupBy(trafficEvent.normalizedPath)
          .orderBy(desc(count()))
          .limit(12),
        db()
          .select({
            channel: trafficEvent.sourceChannel,
            detail:
              sql<string>`coalesce(max(nullif(${trafficEvent.sourceDetail}, '')), '')`.as(
                "detail"
              ),
            pageViews: count(),
            uniqueVisitors:
              sql<string>`count(distinct ${trafficEvent.visitorId})`.as(
                "uniqueVisitors"
              ),
          })
          .from(trafficEvent)
          .where(pageviewFilter)
          .groupBy(trafficEvent.sourceChannel)
          .orderBy(desc(count()))
          .limit(12),
        db()
          .select({
            country: trafficEvent.country,
            region: trafficEvent.region,
            pageViews: count(),
            uniqueVisitors:
              sql<string>`count(distinct ${trafficEvent.visitorId})`.as(
                "uniqueVisitors"
              ),
          })
          .from(trafficEvent)
          .where(pageviewFilter)
          .groupBy(trafficEvent.country, trafficEvent.region)
          .orderBy(desc(count()))
          .limit(12),
      ]);

    const pageviewEvents = await db()
      .select({
        createdAt: trafficEvent.createdAt,
        visitorId: trafficEvent.visitorId,
      })
      .from(trafficEvent)
      .where(pageviewFilter)
      .orderBy(trafficEvent.createdAt);

    const trendGranularity = shouldUseHourlyTrend(start, end) ? "hour" : "day";
    const trendBuckets = buildTrendBuckets({
      start,
      end,
      timeZone,
      granularity: trendGranularity,
    });
    const trendIndex = new Map(
      trendBuckets.map((item, idx) => [item.label, idx])
    );
    const visitorBuckets = new Map<string, Set<string>>();

    for (const event of pageviewEvents) {
      const bucketLabel = formatTrendLabel(
        event.createdAt,
        timeZone,
        trendGranularity
      );
      const index = trendIndex.get(bucketLabel);
      if (index === undefined) continue;

      trendBuckets[index].pageViews += 1;

      const visitorIds = visitorBuckets.get(bucketLabel) || new Set<string>();
      visitorIds.add(event.visitorId);
      visitorBuckets.set(bucketLabel, visitorIds);
    }

    for (const item of trendBuckets) {
      item.uniqueVisitors = visitorBuckets.get(item.label)?.size || 0;
    }

    const summaryRow = summaryRows[0];
    const onlineRow = onlineRows[0];

    return {
      ...emptyResult,
      hasTable: true,
      summary: {
        uniqueVisitors: toNumber(summaryRow?.uniqueVisitors),
        pageViews: toNumber(summaryRow?.pageViews),
        onlineVisitors: toNumber(onlineRow?.onlineVisitors),
      },
      trend: trendBuckets,
      pages: (pageRows as RawPageRow[]).map((row) => ({
        pathname: row.pathname,
        pageTitle: normalizeTrafficText(row.pageTitle, 160),
        pageViews: toNumber(row.pageViews),
        uniqueVisitors: toNumber(row.uniqueVisitors),
      })),
      sources: mergeSourceRows(sourceRows as RawSourceRow[]),
      locations: (locationRows as RawLocationRow[]).map((row) => ({
        country: (row.country || "").toUpperCase(),
        region: normalizeTrafficText(row.region, 120),
        pageViews: toNumber(row.pageViews),
        uniqueVisitors: toNumber(row.uniqueVisitors),
      })),
    };
  } catch (error) {
    if (isMissingTrafficTableError(error)) {
      return emptyResult;
    }

    throw error;
  }
}
