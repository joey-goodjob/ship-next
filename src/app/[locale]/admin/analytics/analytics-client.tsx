"use client";

import {
  Children,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertCircle,
  Eye,
  Loader2,
  MousePointerClick,
  Radar,
  RefreshCw,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  TrafficAnalyticsData,
  TrafficAnalyticsRangePreset,
} from "@/modules/traffic-analytics/service";

function formatNumber(locale: string, value: number) {
  return new Intl.NumberFormat(locale).format(value);
}

function formatCountryLabel(locale: string, country: string) {
  if (!country) return "-";

  try {
    const displayNames = new Intl.DisplayNames([locale], { type: "region" });
    return displayNames.of(country) || country;
  } catch {
    return country;
  }
}

function SummaryCard({
  title,
  value,
  detail,
  icon,
  accentClassName,
}: {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
  accentClassName: string;
}) {
  return (
    <Card className="border-border/70 bg-card shadow-none">
      <CardContent className="flex h-full items-start gap-4 p-5">
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-lg border",
            accentClassName
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 space-y-1">
          <div className="text-muted-foreground text-xs font-medium uppercase tracking-[0.18em]">
            {title}
          </div>
          <div className="text-2xl font-semibold tracking-tight">{value}</div>
          <div className="text-muted-foreground text-sm">{detail}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function TrafficTrendChart({
  data,
  emptyLabel,
  labels,
}: {
  data: TrafficAnalyticsData["trend"];
  emptyLabel: string;
  labels: { pageViews: string; uniqueVisitors: string };
}) {
  const chartConfig = {
    pageViews: {
      label: labels.pageViews,
      color: "#facc15",
    },
    uniqueVisitors: {
      label: labels.uniqueVisitors,
      color: "#38bdf8",
    },
  } satisfies ChartConfig;

  if (data.length === 0) {
    return (
      <div className="text-muted-foreground flex h-[280px] items-center justify-center text-sm">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-[280px] w-full">
      <AreaChart
        data={data}
        margin={{ left: 12, right: 12, top: 12, bottom: 0 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent indicator="line" />}
        />
        <Area
          type="monotone"
          dataKey="pageViews"
          stroke="var(--color-pageViews)"
          fill="var(--color-pageViews)"
          fillOpacity={0.22}
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="uniqueVisitors"
          stroke="var(--color-uniqueVisitors)"
          fill="var(--color-uniqueVisitors)"
          fillOpacity={0.16}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}

function AnalyticsTable({
  title,
  description,
  headers,
  empty,
  children,
}: {
  title: string;
  description: string;
  headers: string[];
  empty: string;
  children: ReactNode;
}) {
  const hasRows = Children.count(children) > 0;

  return (
    <Card className="border-border/70 bg-card shadow-none">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {hasRows ? children : (
              <TableRow>
                <TableCell
                  colSpan={headers.length}
                  className="text-muted-foreground"
                >
                  {empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function AdminAnalyticsClient() {
  const t = useTranslations("admin.analytics");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<TrafficAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    []
  );
  const currentPreset =
    (searchParams.get("range") as TrafficAnalyticsRangePreset | null) ||
    "today";
  const [localStartDate, setLocalStartDate] = useState(
    searchParams.get("startDate") || ""
  );
  const [localEndDate, setLocalEndDate] = useState(
    searchParams.get("endDate") || ""
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    const params = new URLSearchParams(searchParams.toString());
    params.set("timeZone", timeZone);

    try {
      const res = await fetch(`/api/admin/traffic-analytics?${params}`);
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message || "Failed to load");
      setData(json.data);
      setLocalStartDate(json.data.startDate);
      setLocalEndDate(json.data.endDate);
    } catch (err: any) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [searchParams, timeZone]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const updateParams = (updater: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    updater(params);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const applyPreset = (preset: Exclude<TrafficAnalyticsRangePreset, "custom">) => {
    updateParams((params) => {
      params.set("range", preset);
      params.delete("startDate");
      params.delete("endDate");
    });
  };

  const applyCustom = () => {
    if (!localStartDate || !localEndDate) return;

    updateParams((params) => {
      params.set("range", "custom");
      params.set("startDate", localStartDate);
      params.set("endDate", localEndDate);
    });
  };

  const pageRows =
    data?.pages.map((item) => (
      <TableRow key={item.pathname}>
        <TableCell className="max-w-[300px] truncate font-medium">
          {item.pageTitle || item.pathname}
        </TableCell>
        <TableCell className="text-muted-foreground max-w-[240px] truncate">
          {item.pathname}
        </TableCell>
        <TableCell>{formatNumber(locale, item.pageViews)}</TableCell>
        <TableCell>{formatNumber(locale, item.uniqueVisitors)}</TableCell>
      </TableRow>
    )) || null;

  const sourceRows =
    data?.sources.map((item) => (
      <TableRow key={`${item.channel}-${item.detail}`}>
        <TableCell className="font-medium">{item.label}</TableCell>
        <TableCell className="text-muted-foreground max-w-[220px] truncate">
          {item.detail || "-"}
        </TableCell>
        <TableCell>{formatNumber(locale, item.pageViews)}</TableCell>
        <TableCell>{formatNumber(locale, item.uniqueVisitors)}</TableCell>
      </TableRow>
    )) || null;

  const locationRows =
    data?.locations.map((item) => (
      <TableRow key={`${item.country}-${item.region}`}>
        <TableCell className="font-medium">
          {formatCountryLabel(locale, item.country)}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {item.region || "-"}
        </TableCell>
        <TableCell>{formatNumber(locale, item.pageViews)}</TableCell>
        <TableCell>{formatNumber(locale, item.uniqueVisitors)}</TableCell>
      </TableRow>
    )) || null;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("description", {
              range: data?.rangeLabel || "-",
              timezone: data?.timeZone || timeZone,
            })}
          </p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading}>
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {t("refresh")}
        </Button>
      </div>

      <Card className="border-border/70 bg-card shadow-none">
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["today", t("filters.today")],
                ["yesterday", t("filters.yesterday")],
                ["custom", t("filters.custom")],
              ] as const
            ).map(([preset, label]) => (
              <Button
                key={preset}
                variant={currentPreset === preset ? "default" : "outline"}
                className="min-w-24"
                onClick={() => {
                  if (preset === "custom") {
                    applyCustom();
                    return;
                  }
                  applyPreset(preset);
                }}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="grid gap-2 text-sm">
              <span className="text-muted-foreground">
                {t("filters.start_date")}
              </span>
              <Input
                type="date"
                value={localStartDate}
                onChange={(event) => setLocalStartDate(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-muted-foreground">
                {t("filters.end_date")}
              </span>
              <Input
                type="date"
                value={localEndDate}
                onChange={(event) => setLocalEndDate(event.target.value)}
              />
            </label>
            <Button onClick={applyCustom} className="md:min-w-28">
              {t("filters.apply")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/10 shadow-none">
          <CardContent className="text-destructive flex items-center gap-2 p-4 text-sm">
            <AlertCircle className="size-4" />
            {error}
          </CardContent>
        </Card>
      ) : null}

      {data && !data.hasTable ? (
        <Card className="border-amber-500/40 bg-amber-500/10 shadow-none">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-amber-200">
            <AlertCircle className="size-4" />
            {t("missing_table")}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title={t("cards.unique_visitors")}
          value={formatNumber(locale, data?.summary.uniqueVisitors || 0)}
          detail={t("cards.range_detail", { range: data?.rangeLabel || "-" })}
          icon={<Eye className="size-5" />}
          accentClassName="border-sky-400/40 bg-sky-400/10 text-sky-300"
        />
        <SummaryCard
          title={t("cards.page_views")}
          value={formatNumber(locale, data?.summary.pageViews || 0)}
          detail={t("cards.range_detail", { range: data?.rangeLabel || "-" })}
          icon={<MousePointerClick className="size-5" />}
          accentClassName="border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
        />
        <SummaryCard
          title={t("cards.online_visitors")}
          value={formatNumber(locale, data?.summary.onlineVisitors || 0)}
          detail={t("cards.online_detail")}
          icon={<Activity className="size-5" />}
          accentClassName="border-violet-400/40 bg-violet-400/10 text-violet-300"
        />
        <SummaryCard
          title={t("cards.top_pages")}
          value={formatNumber(locale, data?.pages.length || 0)}
          detail={t("cards.top_pages_detail")}
          icon={<Radar className="size-5" />}
          accentClassName="border-yellow-400/40 bg-yellow-400/10 text-yellow-300"
        />
      </div>

      <Card className="border-border/70 bg-card shadow-none">
        <CardHeader>
          <CardTitle>{t("sections.trend")}</CardTitle>
          <CardDescription>{t("sections.trend_description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <div className="text-muted-foreground flex h-[280px] items-center justify-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              {t("loading")}
            </div>
          ) : (
            <TrafficTrendChart
              data={data?.trend || []}
              emptyLabel={t("empty.no_data")}
              labels={{
                pageViews: t("tables.common.page_views"),
                uniqueVisitors: t("tables.common.unique_visitors"),
              }}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <AnalyticsTable
          title={t("sections.pages")}
          description={t("sections.pages_description")}
          empty={t("empty.no_data")}
          headers={[
            t("tables.pages.page"),
            t("tables.pages.path"),
            t("tables.common.page_views"),
            t("tables.common.unique_visitors"),
          ]}
        >
          {pageRows}
        </AnalyticsTable>
        <AnalyticsTable
          title={t("sections.sources")}
          description={t("sections.sources_description")}
          empty={t("empty.no_data")}
          headers={[
            t("tables.sources.channel"),
            t("tables.sources.detail"),
            t("tables.common.page_views"),
            t("tables.common.unique_visitors"),
          ]}
        >
          {sourceRows}
        </AnalyticsTable>
        <AnalyticsTable
          title={t("sections.locations")}
          description={t("sections.locations_description")}
          empty={t("empty.no_data")}
          headers={[
            t("tables.locations.country"),
            t("tables.locations.region"),
            t("tables.common.page_views"),
            t("tables.common.unique_visitors"),
          ]}
        >
          {locationRows}
        </AnalyticsTable>
      </div>
    </div>
  );
}
