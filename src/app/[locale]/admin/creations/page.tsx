"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ExternalLink,
  FileAudio,
  Film,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AdminCreation = {
  id: string;
  compactId: string;
  title: string;
  status: string;
  pipelineStage: string;
  generationStatus: string;
  generationProgress: number;
  lyricsStatus: string;
  scenesStatus: string;
  renderStatus: string;
  createdAt: string;
  updatedAt: string;
  audioFilename?: string | null;
  audioDurationLabel: string;
  audioMimeType?: string | null;
  audioSizeBytes: number;
  aspectRatio: string;
  resolution: string;
  language: string;
  artStyle: string;
  user: {
    id: string;
    name: string;
    email: string;
    image: string;
    utmSource: string;
  };
  latestRun: {
    id: string;
    status: string;
    currentStage: string;
    progressPercent: number;
    completedSteps: number;
    failedSteps: number;
    totalSteps: number;
    errorMessage?: string | null;
  } | null;
  generationSteps: Array<{
    id: string;
    stage: string;
    status: string;
    provider?: string | null;
    model?: string | null;
    providerTaskId?: string | null;
    errorMessage?: string | null;
  }>;
  scenes: Array<{
    id: string;
    sort: number;
    status: string;
    text: string;
    imageUrl?: string | null;
    providerTaskId?: string | null;
    error?: string | null;
  }>;
  exports: Array<{
    id: string;
    status: string;
    format: string;
    resolution: string;
    aspectRatio: string;
    videoUrl?: string | null;
    taskId?: string | null;
    error?: string | null;
  }>;
  mediaJobs: Array<{
    id: string;
    kind: string;
    status: string;
    attemptCount: number;
    error?: string | null;
  }>;
  metrics: {
    sceneCount: number;
    imageReadyCount: number;
    imageFailedCount: number;
    exportCount: number;
    exportReadyCount: number;
    exportFailedCount: number;
    mediaJobQueuedCount: number;
    mediaJobFailedCount: number;
  };
  firstError: string;
  elapsedLabel: string;
  hasSourceAudio: boolean;
  hasProcessedAudio: boolean;
  hasRenderedVideo: boolean;
  previewHref: string;
};

type PageData = {
  items: AdminCreation[];
  total: number;
};

const PAGE_SIZE = 12;

function formatBytes(value?: number) {
  if (!value || value <= 0) return "-";
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function statusClass(status: string) {
  if (["ready", "success", "completed"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (["failed", "error"].includes(status)) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (["processing", "queued", "pending", "running"].includes(status)) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function mediaUrl(id: string, kind: "source-audio" | "processed-audio" | "rendered-video") {
  return `/api/admin/creations/${encodeURIComponent(id)}/media?kind=${kind}`;
}

function MetaLine({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground text-xs">{children}</span>;
}

function NativeAudio({
  title,
  src,
}: {
  title: string;
  src: string;
}) {
  return (
    <div className="space-y-2 rounded-lg border bg-background p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <FileAudio className="size-3.5" />
        {title}
      </div>
      <audio controls preload="none" src={src} className="h-9 w-full" />
    </div>
  );
}

function CreationRow({
  item,
  expanded,
  onToggle,
}: {
  item: AdminCreation;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("admin.creations");
  const createdAt = new Date(item.createdAt).toLocaleString();

  return (
    <Card className="py-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/40"
        aria-expanded={expanded}
      >
        <ChevronDown
          className={cn(
            "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
            !expanded && "-rotate-90"
          )}
        />
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Film className="size-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={statusClass(item.pipelineStage)}>
              {item.pipelineStage}
            </Badge>
            <Badge variant="outline" className={statusClass(item.renderStatus)}>
              {t("badges.render", { status: item.renderStatus })}
            </Badge>
            <MetaLine>{createdAt}</MetaLine>
          </div>
          <div className="truncate text-base font-semibold">{item.title}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <MetaLine>
              {item.user.name || item.user.email || t("unknown_user")}
            </MetaLine>
            <MetaLine>{item.audioFilename || t("untitled_audio")}</MetaLine>
            <MetaLine>{item.audioDurationLabel}</MetaLine>
            <MetaLine>{formatBytes(item.audioSizeBytes)}</MetaLine>
            <MetaLine>{item.user.utmSource || t("direct_source")}</MetaLine>
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="border-t px-4 py-4">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(240px,0.7fr)]">
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t("sections.media")}
              </div>
              {item.hasSourceAudio ? (
                <NativeAudio title={t("source_audio")} src={mediaUrl(item.id, "source-audio")} />
              ) : null}
              {item.hasProcessedAudio ? (
                <NativeAudio title={t("processed_audio")} src={mediaUrl(item.id, "processed-audio")} />
              ) : null}
              {item.hasRenderedVideo ? (
                <div className="space-y-2 rounded-lg border bg-background p-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Film className="size-3.5" />
                    {t("rendered_video")}
                  </div>
                  <video controls preload="none" src={mediaUrl(item.id, "rendered-video")} className="aspect-video w-full rounded-md bg-black" />
                </div>
              ) : null}
              {!item.hasSourceAudio && !item.hasProcessedAudio && !item.hasRenderedVideo ? (
                <p className="text-sm text-muted-foreground">{t("empty_media")}</p>
              ) : null}
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("sections.progress")}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg border bg-background p-3">
                    <div className="text-muted-foreground text-xs">{t("metrics.scenes")}</div>
                    <div className="mt-1 font-semibold">
                      {item.metrics.imageReadyCount}/{item.metrics.sceneCount}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-background p-3">
                    <div className="text-muted-foreground text-xs">{t("metrics.exports")}</div>
                    <div className="mt-1 font-semibold">
                      {item.metrics.exportReadyCount}/{item.metrics.exportCount}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-background p-3">
                    <div className="text-muted-foreground text-xs">{t("metrics.failed_images")}</div>
                    <div className="mt-1 font-semibold">{item.metrics.imageFailedCount}</div>
                  </div>
                  <div className="rounded-lg border bg-background p-3">
                    <div className="text-muted-foreground text-xs">{t("metrics.elapsed")}</div>
                    <div className="mt-1 font-semibold">{item.elapsedLabel}</div>
                  </div>
                </div>
              </div>

              {item.firstError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {item.firstError}
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("sections.steps")}
                </div>
                <div className="space-y-1.5">
                  {item.generationSteps.length > 0 ? item.generationSteps.map((step) => (
                    <div key={step.id} className="flex min-w-0 items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-xs">
                      <span className="truncate font-medium">{step.stage}</span>
                      <span className={cn("shrink-0 rounded-full border px-2 py-0.5", statusClass(step.status))}>
                        {step.status}
                      </span>
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground">{t("empty_steps")}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("sections.workflow")}
                </div>
                <div className="space-y-1 text-sm">
                  <div>{t("id")}: {item.compactId}</div>
                  <div>{t("aspect")}: {item.aspectRatio} · {item.resolution}</div>
                  <div>{t("language")}: {item.language}</div>
                  <div>{t("style")}: {item.artStyle}</div>
                </div>
              </div>

              <a
                href={item.previewHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium hover:bg-muted"
              >
                <ExternalLink className="size-4" />
                {t("open_preview")}
              </a>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("sections.scenes")}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {item.scenes.length > 0 ? item.scenes.map((scene) => (
                    <div key={scene.id} className="min-w-0 overflow-hidden rounded-lg border bg-background">
                      {scene.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={scene.imageUrl} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex aspect-video items-center justify-center bg-muted text-muted-foreground">
                          <ImageIcon className="size-4" />
                        </div>
                      )}
                      <div className="truncate px-2 py-1 text-xs text-muted-foreground">
                        #{scene.sort + 1} · {scene.status}
                      </div>
                    </div>
                  )) : (
                    <p className="col-span-2 text-sm text-muted-foreground">{t("empty_scenes")}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export default function AdminCreationsPage() {
  const t = useTranslations("admin.creations");
  const [data, setData] = useState<PageData>({ items: [], total: 0 });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (debouncedSearch) params.set("search", debouncedSearch);

    const res = await fetch(`/api/admin/creations?${params}`);
    const json = await res.json();
    if (json.code === 0) {
      const nextData = json.data as PageData;
      setData(nextData);
      setExpandedIds((current) => {
        if (current.size > 0) return current;
        return new Set(nextData.items[0]?.id ? [nextData.items[0].id] : []);
      });
    }
    setLoading(false);
  }, [debouncedSearch, page]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(data.total / PAGE_SIZE)), [data.total]);

  function toggle(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <Button variant="outline" onClick={() => void fetchData()} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {t("refresh")}
        </Button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("search_placeholder")}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="size-4" />
          {t("total", { count: data.total })}
        </div>
      </div>

      {loading && data.items.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t("loading")}
          </CardContent>
        </Card>
      ) : data.items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t("empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.items.map((item) => (
            <CreationRow
              key={item.id}
              item={item}
              expanded={expandedIds.has(item.id)}
              onToggle={() => toggle(item.id)}
            />
          ))}
        </div>
      )}

      {data.total > PAGE_SIZE ? (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>
            {t("previous")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>
            {t("next")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
