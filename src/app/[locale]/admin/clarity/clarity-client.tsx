"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ClarityInsightsDashboard,
  ClarityStoredRow,
} from "@/modules/clarity-analytics/service";

type ProfileKey = "problem_pages" | "traffic_quality" | "device_issues" | "all";

const PROFILE_KEYS: Exclude<ProfileKey, "all">[] = [
  "problem_pages",
  "traffic_quality",
  "device_issues",
];

function formatNumber(locale: string, value: number) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(locale: string, value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function rowMatchesProfile(row: ClarityStoredRow, profile: ProfileKey) {
  if (profile === "all") return true;
  if (row.profile !== profile) return false;

  if (profile === "problem_pages") {
    return /dead|rage|error|quickback|excessive/i.test(row.metricName);
  }

  if (profile === "traffic_quality") {
    return /traffic|engagement|scroll|popular/i.test(row.metricName);
  }

  return /dead|rage|error|script|quickback|excessive/i.test(row.metricName);
}

function getDimensionSummary(row: ClarityStoredRow) {
  return [
    row.url,
    row.source,
    row.device,
    row.channel,
    row.campaign,
    row.browser,
    row.os,
    row.countryRegion,
  ].filter(Boolean);
}

export function AdminClarityClient() {
  const t = useTranslations("admin.clarity_page");
  const locale = useLocale();
  const [data, setData] = useState<ClarityInsightsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [days, setDays] = useState(1);
  const [activeProfile, setActiveProfile] = useState<ProfileKey>("problem_pages");
  const [search, setSearch] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/clarity-insights");
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message || t("load_failed"));
      setData(json.data);
    } catch (err: any) {
      setError(err.message || t("load_failed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  async function syncData() {
    setSyncing(true);
    setError("");
    try {
      const res = await fetch("/api/admin/clarity-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message || t("sync_failed"));
      if (json.data?.error === "missing_token") {
        throw new Error(t("missing_token"));
      }
      if (json.data?.error) {
        throw new Error(json.data.message || t("sync_failed"));
      }
      await loadDashboard();
    } catch (err: any) {
      setError(err.message || t("sync_failed"));
    } finally {
      setSyncing(false);
    }
  }

  const rows = data?.rows || [];
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((row) => rowMatchesProfile(row, activeProfile))
      .filter((row) => {
        if (!query) return true;
        return [
          row.metricLabel,
          row.rowLabel,
          row.url,
          row.source,
          row.device,
          row.channel,
          row.campaign,
          row.browser,
          row.os,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => b.primaryMetricValue - a.primaryMetricValue);
  }, [activeProfile, rows, search]);

  const profileCounts = useMemo(() => {
    return {
      all: rows.length,
      problem_pages: rows.filter((row) => rowMatchesProfile(row, "problem_pages")).length,
      traffic_quality: rows.filter((row) => rowMatchesProfile(row, "traffic_quality")).length,
      device_issues: rows.filter((row) => rowMatchesProfile(row, "device_issues")).length,
    };
  }, [rows]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("description")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[1, 2, 3].map((option) => (
            <Button
              key={option}
              variant={days === option ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(option)}
            >
              {t(`days.${option}`)}
            </Button>
          ))}
          <Button onClick={syncData} disabled={syncing || loading} size="sm">
            {syncing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {t("sync")}
          </Button>
        </div>
      </div>

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

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/70 bg-card shadow-none">
          <CardContent className="p-5">
            <div className="text-muted-foreground text-xs font-medium uppercase">
              {t("cards.latest_sync")}
            </div>
            <div className="mt-2 text-lg font-semibold">
              {formatDate(locale, data?.latestRun?.fetchedAt)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card shadow-none">
          <CardContent className="p-5">
            <div className="text-muted-foreground text-xs font-medium uppercase">
              {t("cards.rows")}
            </div>
            <div className="mt-2 text-lg font-semibold">
              {formatNumber(locale, rows.length)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card shadow-none">
          <CardContent className="p-5">
            <div className="text-muted-foreground text-xs font-medium uppercase">
              {t("cards.status")}
            </div>
            <div className="mt-2 flex items-center gap-2 text-lg font-semibold">
              {data?.latestRun ? (
                <>
                  <CheckCircle2 className="size-4 text-emerald-400" />
                  {t("status.synced", { days: data.latestRun.days })}
                </>
              ) : (
                t("status.empty")
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 bg-card shadow-none">
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>{t("table.title")}</CardTitle>
              <CardDescription>{t("table.description")}</CardDescription>
            </div>
            <Button variant="outline" onClick={loadDashboard} disabled={loading}>
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {t("refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {(["problem_pages", "traffic_quality", "device_issues", "all"] as ProfileKey[]).map((profile) => (
                <Button
                  key={profile}
                  variant={activeProfile === profile ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveProfile(profile)}
                >
                  {t(`profiles.${profile}`)}
                  <Badge variant="secondary" className="ml-1">
                    {formatNumber(locale, profileCounts[profile])}
                  </Badge>
                </Button>
              ))}
            </div>
            <div className="relative w-full xl:w-80">
              <Search className="text-muted-foreground absolute left-2.5 top-2.5 size-4" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("search")}
                className="h-9 pl-8"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.metric")}</TableHead>
                  <TableHead>{t("table.dimension")}</TableHead>
                  <TableHead>{t("table.value")}</TableHead>
                  <TableHead>{t("table.context")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && !data ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground py-8 text-center">
                      {t("loading")}
                    </TableCell>
                  </TableRow>
                ) : filteredRows.length > 0 ? (
                  filteredRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.metricLabel}</div>
                        <div className="text-muted-foreground text-xs">
                          {row.profile.replace(/_/g, " ")}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[340px]">
                        <div className="truncate font-medium">{row.rowLabel}</div>
                        <div className="text-muted-foreground truncate text-xs">
                          {getDimensionSummary(row).join(" / ") || "-"}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="font-medium">
                          {formatNumber(locale, row.primaryMetricValue)}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {row.primaryMetricName || "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-[360px] flex-wrap gap-1">
                          {Object.entries(row.metrics).map(([name, value]) => (
                            <Badge key={name} variant="outline" className="font-normal">
                              {name}: {formatNumber(locale, Number(value) || 0)}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground py-8 text-center">
                      {t("table.empty")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
