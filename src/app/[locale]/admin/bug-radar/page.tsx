"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Bug, CheckCircle2, Loader2, RefreshCw, Siren, TestTube2, Zap } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type BugRadarProblem = {
  key: string;
  eventType: string;
  flow: string;
  action: string;
  pathname: string;
  priority: "critical" | "high" | "medium" | "low";
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

type BugRadarData = {
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
  flows: Array<{
    flow: string;
    events: number;
    failures: number;
    affectedUsers: number;
    lastSeenAt: string;
  }>;
  recentEvents: Array<{
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

const emptyData: BugRadarData = {
  hasTable: true,
  generatedAt: new Date(0).toISOString(),
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

const testButtons = [
  { type: "frontend_error", label: "Frontend Error" },
  { type: "upload_failed", label: "Upload Failed" },
  { type: "audio_duration_failed", label: "Audio Decode Failed" },
  { type: "generation_failed", label: "Generate Failed" },
  { type: "api_error", label: "API Error" },
  { type: "provider_error", label: "Provider Error" },
];

function priorityClass(priority: string) {
  if (priority === "critical") return "border-rose-200 bg-rose-50 text-rose-700";
  if (priority === "high") return "border-orange-200 bg-orange-50 text-orange-700";
  if (priority === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return date.toLocaleString();
}

function formatUserLabel(input: { userEmail?: string; userName?: string; userId?: string; visitorId?: string }) {
  return input.userEmail || input.userName || input.userId || input.visitorId || "anonymous";
}

function StatCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number | string;
  detail: string;
  tone?: "critical" | "high" | "ok";
}) {
  return (
    <Card className="rounded-md">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-muted-foreground">{label}</p>
          {tone === "critical" ? <Siren className="size-4 text-rose-500" /> : tone === "high" ? <AlertTriangle className="size-4 text-orange-500" /> : <CheckCircle2 className="size-4 text-emerald-500" />}
        </div>
        <p className="mt-3 text-3xl font-bold tracking-normal">{value}</p>
        <p className="mt-1 text-xs font-medium text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

export default function AdminBugRadarPage() {
  const t = useTranslations("admin.bug_radar");
  const [data, setData] = useState<BugRadarData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [includeTest, setIncludeTest] = useState(true);
  const [selectedKey, setSelectedKey] = useState("");
  const [runningTest, setRunningTest] = useState("");

  const selectedProblem = useMemo(
    () => data.problems.find((problem) => problem.key === selectedKey) || data.problems[0],
    [data.problems, selectedKey],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/bug-radar?includeTest=${includeTest ? "1" : "0"}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || body.code !== 0) throw new Error(body.message || t("load_failed"));
      setData(body.data || emptyData);
      setSelectedKey((current) => current || body.data?.problems?.[0]?.key || "");
    } catch (error: any) {
      toast.error(error?.message || t("load_failed"));
    } finally {
      setLoading(false);
    }
  }, [includeTest, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function sendTestEvent(type: string) {
    setRunningTest(type);
    try {
      const response = await fetch("/api/admin/bug-radar/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, pathname: "/create" }),
      });
      const body = await response.json();
      if (!response.ok || body.code !== 0) throw new Error(body.message || t("test_failed"));
      toast.success(t("test_created"));
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || t("test_failed"));
    } finally {
      setRunningTest("");
    }
  }

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-10 items-center justify-center rounded-md bg-rose-50 text-rose-600">
              <Bug className="size-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-normal">{t("title")}</h1>
              <p className="text-sm font-medium text-muted-foreground">{t("description")}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-md" onClick={() => setIncludeTest((value) => !value)}>
            <TestTube2 className="size-4" />
            {includeTest ? t("hide_tests") : t("show_tests")}
          </Button>
          <Button className="rounded-md" onClick={loadData} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {t("refresh")}
          </Button>
        </div>
      </div>

      {!data.hasTable ? (
        <Card className="rounded-md border-amber-200 bg-amber-50 text-amber-900">
          <CardContent className="p-4 text-sm font-semibold">{t("missing_table")}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-5">
        <StatCard label={t("cards.critical")} value={data.summary.critical} detail={t("cards.problem_count")} tone="critical" />
        <StatCard label={t("cards.high")} value={data.summary.high} detail={t("cards.problem_count")} tone="high" />
        <StatCard label={t("cards.users")} value={data.summary.affectedUsers} detail={t("cards.real_users")} />
        <StatCard label={t("cards.events")} value={data.summary.realEvents} detail={t("cards.real_events")} />
        <StatCard label={t("cards.tests")} value={data.summary.testEvents} detail={t("cards.test_events")} />
      </div>

      <Card className="rounded-md">
        <CardContent className="p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">{t("test.title")}</h2>
              <p className="text-sm font-medium text-muted-foreground">{t("test.description")}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {testButtons.map((item) => (
              <Button key={item.type} variant="outline" className="rounded-md" onClick={() => sendTestEvent(item.type)} disabled={Boolean(runningTest)}>
                {runningTest === item.type ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                {item.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card className="rounded-md">
          <CardContent className="p-0">
            <div className="border-b p-4">
              <h2 className="text-base font-bold">{t("top.title")}</h2>
              <p className="text-sm font-medium text-muted-foreground">{t("top.description")}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">{t("table.priority")}</th>
                    <th className="px-4 py-3 text-left">{t("table.problem")}</th>
                    <th className="px-4 py-3 text-left">{t("table.page")}</th>
                    <th className="px-4 py-3 text-right">{t("table.users")}</th>
                    <th className="px-4 py-3 text-right">{t("table.count")}</th>
                    <th className="px-4 py-3 text-left">{t("table.browser")}</th>
                    <th className="px-4 py-3 text-left">{t("table.last_seen")}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-muted-foreground" colSpan={7}>
                        <Loader2 className="mx-auto size-5 animate-spin" />
                      </td>
                    </tr>
                  ) : data.problems.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-muted-foreground" colSpan={7}>{t("empty")}</td>
                    </tr>
                  ) : data.problems.map((problem) => (
                    <tr
                      key={problem.key}
                      className={cn("cursor-pointer border-t transition-colors hover:bg-muted/35", selectedProblem?.key === problem.key && "bg-muted/50")}
                      onClick={() => setSelectedKey(problem.key)}
                    >
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={cn("rounded-md", priorityClass(problem.priority))}>{problem.priority}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{problem.eventType}</p>
                        <p className="mt-1 max-w-[360px] truncate text-xs text-muted-foreground">{problem.sampleMessage || problem.action}</p>
                      </td>
                      <td className="px-4 py-3 font-medium">{problem.pathname}</td>
                      <td className="px-4 py-3 text-right">{problem.realAffectedUsers || problem.affectedUsers}</td>
                      <td className="px-4 py-3 text-right">{problem.count}</td>
                      <td className="px-4 py-3">{problem.browserSummary} · {problem.deviceSummary}</td>
                      <td className="px-4 py-3">{formatRelative(problem.lastSeenAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-md">
            <CardContent className="p-4">
              <h2 className="text-base font-bold">{t("detail.title")}</h2>
              {selectedProblem ? (
                <div className="mt-4 space-y-4">
                  <div>
                    <Badge variant="outline" className={cn("rounded-md", priorityClass(selectedProblem.priority))}>{selectedProblem.priority}</Badge>
                    <h3 className="mt-3 text-lg font-bold">{selectedProblem.eventType}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{selectedProblem.summary}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-md border p-3">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">{t("detail.flow")}</p>
                      <p className="mt-1 font-semibold">{selectedProblem.flow}</p>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">{t("detail.action")}</p>
                      <p className="mt-1 font-semibold">{selectedProblem.action}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("detail.users")}</p>
                    <div className="mt-2 space-y-2">
                      {selectedProblem.affectedUsersList?.length ? selectedProblem.affectedUsersList.map((user) => (
                        <div key={user.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{user.label}</p>
                            <p className="truncate text-xs text-muted-foreground">{user.name && user.email ? user.name : user.id}</p>
                          </div>
                          <Badge variant="outline" className="rounded-md">{user.eventCount}</Badge>
                        </div>
                      )) : (
                        <p className="text-sm text-muted-foreground">{t("empty")}</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("detail.timeline")}</p>
                    <div className="mt-2 space-y-2">
                      {selectedProblem.examples.map((example) => (
                        <div key={`${example.createdAt}-${example.source}`} className="rounded-md border p-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">{example.action || example.eventType}</span>
                            <span className="text-xs text-muted-foreground">{formatRelative(example.createdAt)}</span>
                          </div>
                          <p className="mt-1 text-muted-foreground">{example.message || "-"}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{example.source} · {formatUserLabel(example)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">{t("empty")}</p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-md">
            <CardContent className="p-4">
              <h2 className="text-base font-bold">{t("flows.title")}</h2>
              <div className="mt-3 space-y-2">
                {data.flows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("empty")}</p>
                ) : data.flows.map((flow) => (
                  <div key={flow.flow} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                    <div>
                      <p className="font-semibold">{flow.flow}</p>
                      <p className="text-xs text-muted-foreground">{flow.affectedUsers} users · {formatRelative(flow.lastSeenAt)}</p>
                    </div>
                    <Badge variant="outline" className="rounded-md">{flow.failures}/{flow.events}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
