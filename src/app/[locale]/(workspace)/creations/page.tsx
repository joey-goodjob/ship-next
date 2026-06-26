"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, CalendarClock, Check, Circle, Clock3, Film, Loader2, Music2, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "@/core/i18n/navigation";
import { cn } from "@/lib/utils";
import { deriveCreationProgress, formatProgressStatus, type CreationProgress, type CreationProgressStage } from "./project-progress";

type LyricVideoProject = {
  id: string;
  title: string;
  status: string;
  audioFilename?: string | null;
  audioDurationMs?: number | null;
  pipelineStage: string;
  lyricsStatus: string;
  scenesStatus: string;
  renderStatus: string;
  aspectRatio: string;
  resolution: string;
  updatedAt?: string | Date;
  createdAt?: string | Date;
};

type ApiResponse<T> = {
  code: number;
  message: string;
  data?: T;
};

async function readApi<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (!response.ok || body.code !== 0) {
    throw new Error(body.message || "Request failed");
  }
  return body.data as T;
}

function formatDuration(ms?: number | null) {
  const totalSeconds = Math.max(0, Math.round((ms || 0) / 1000));
  if (!totalSeconds) return "--:--";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatDate(value?: string | Date) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const POLL_INTERVAL_MS = 8000;

const ACTIVE_STATUSES = new Set([
  "asr_processing",
  "audio_processing",
  "processing",
  "generating",
  "queued",
  "rendering",
  "running",
  "waiting_provider",
  "storyboard_generating",
  "images_queueing",
  "images_processing",
]);

function isProjectActive(project: LyricVideoProject) {
  return [
    project.status,
    project.pipelineStage,
    project.lyricsStatus,
    project.scenesStatus,
    project.renderStatus,
  ].some((value) => value && ACTIVE_STATUSES.has(String(value).toLowerCase()));
}

const PROGRESS_TONE_CLASS: Record<CreationProgress["tone"], string> = {
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  active: "border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-300",
  warning: "border-amber-400/30 bg-amber-400/10 text-amber-700 dark:text-amber-300",
  danger: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300",
  muted: "border-border bg-muted/30 text-muted-foreground",
};

const STAGE_DOT_CLASS: Record<CreationProgressStage["state"], string> = {
  complete: "border-emerald-500 bg-emerald-500 text-white",
  active: "border-amber-400 bg-amber-400 text-zinc-950",
  waiting: "border-border bg-background text-muted-foreground",
  blocked: "border-red-500 bg-red-500 text-white",
};

function connectorClass(current: CreationProgressStage, next: CreationProgressStage) {
  if (current.state === "blocked" || next.state === "blocked") return "bg-red-500/70";
  if (current.state === "complete" && next.state === "complete") return "bg-emerald-500/80";
  if (current.state === "complete" && next.state === "active") return "bg-amber-400/80";
  return "bg-border";
}

function StageIcon({ stage }: { stage: CreationProgressStage }) {
  if (stage.state === "complete") return <Check className="size-3" />;
  if (stage.state === "active") return <Clock3 className="size-3" />;
  if (stage.state === "blocked") return <AlertTriangle className="size-3" />;
  return <Circle className="size-2.5" />;
}

function ProjectProgressSummary({
  detail,
  labels,
  progress,
  title,
}: {
  detail: string;
  labels: Record<CreationProgressStage["id"], string>;
  progress: CreationProgress;
  title: string;
}) {
  return (
    <div className={cn("rounded-md border px-3 py-3", PROGRESS_TONE_CLASS[progress.tone])}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{detail}</p>
        </div>
        <span className="shrink-0 rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-normal">
          {formatProgressStatus(progress.stages.find((stage) => stage.state === "active" || stage.state === "blocked")?.status || progress.stages.at(-1)?.status || "")}
        </span>
      </div>

      <div className="mt-3 flex items-center">
        {progress.stages.map((stage, index) => {
          const nextStage = progress.stages[index + 1];
          return (
            <div key={stage.id} className={cn("flex items-center", index === progress.stages.length - 1 ? "shrink-0" : "flex-1")}>
              <span className={cn("flex size-6 items-center justify-center rounded-full border", STAGE_DOT_CLASS[stage.state])}>
                <StageIcon stage={stage} />
              </span>
              {nextStage ? <span className={cn("mx-2 h-0.5 min-w-8 flex-1 rounded-full", connectorClass(stage, nextStage))} /> : null}
            </div>
          );
        })}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        {progress.stages.map((stage) => (
          <div key={stage.id} className="min-w-0">
            <p className="truncate text-[11px] font-bold text-foreground">{labels[stage.id]}</p>
            <p className="mt-0.5 truncate text-[10px] font-semibold text-muted-foreground">{formatProgressStatus(stage.status)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LyricVideosPage() {
  const t = useTranslations("dashboard.lyric_videos");
  const [projects, setProjects] = useState<LyricVideoProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [deletingProject, setDeletingProject] = useState<LyricVideoProject | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);

  const loadProjects = useCallback(
    async ({ silent }: { silent?: boolean } = {}) => {
      if (!silent) setLoading(true);
      setError("");
      try {
        const data = await readApi<LyricVideoProject[]>("/api/lyric-videos");
        setProjects(Array.isArray(data) ? data : []);
      } catch (err: any) {
        if (!silent) setError(err?.message || t("failed"));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Auto-refresh while any project is still being processed, so users see
  // pipeline progress (lyrics → scenes → render) without manually refreshing.
  const hasActiveProjects = useMemo(
    () => projects.some((project) => isProjectActive(project)),
    [projects],
  );

  useEffect(() => {
    if (!hasActiveProjects) return;
    const timer = window.setInterval(() => {
      loadProjects({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [hasActiveProjects, loadProjects]);

  const filteredProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) => {
      return [project.title, project.audioFilename, project.pipelineStage, project.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [projects, query]);

  async function deleteProject() {
    if (!deletingProject) return;
    setDeletingProjectId(deletingProject.id);
    try {
      await readApi<void>(`/api/lyric-videos/${deletingProject.id}`, { method: "DELETE" });
      setProjects((current) => current.filter((project) => project.id !== deletingProject.id));
      toast.success(t("delete_success"));
      setDeletingProject(null);
    } catch (err: any) {
      toast.error(err?.message || t("delete_failed"));
    } finally {
      setDeletingProjectId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-10 pt-2 sm:px-6 lg:px-8">
      <section className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            <Sparkles className="size-3.5" />
            {t("workspace_badge")}
          </div>
          <h1 className="text-2xl font-bold tracking-normal text-foreground">{t("title")}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("description")}</p>
        </div>

        <Link
          href="/create"
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#F5A623] px-4 text-sm font-bold text-white transition hover:bg-[#E6981F] sm:w-auto"
        >
          <Plus className="size-4" />
          {t("create_project")}
        </Link>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search_placeholder")}
            className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
        </div>
        <button
          type="button"
          onClick={() => loadProjects()}
          className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-accent"
        >
          {t("refresh")}
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-52 animate-pulse rounded-lg border border-border bg-muted/50" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-6 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-amber-50 text-[#F5A623]">
            <Film className="size-7" />
          </div>
          <h2 className="text-lg font-bold text-foreground">{t("empty")}</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t("empty_description")}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((project) => {
            const progress = deriveCreationProgress(project);
            return (
              <div
                key={project.id}
                className="group relative flex min-h-52 flex-col justify-between rounded-lg border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md"
              >
                <Link
                  href={`/creations/${project.id}/preview`}
                  aria-label={t("open_project", { title: project.title })}
                  className="absolute inset-0 z-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-background"
                />
                <div className="pointer-events-none relative z-10">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-700">
                        <Music2 className="size-5" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-base font-bold text-foreground">{project.title}</h2>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {project.audioFilename || t("draft_audio")}
                        </p>
                      </div>
                    </div>
                    <div className="relative z-10 flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-[#F5A623]">
                        {project.aspectRatio}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDeletingProject(project)}
                        aria-label={t("delete_project", { title: project.title })}
                        className="pointer-events-auto inline-flex size-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-300"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>

                  <ProjectProgressSummary
                    progress={progress}
                    title={t(`progress.${progress.copyKey}.title` as any)}
                    detail={t(`progress.${progress.copyKey}.detail` as any)}
                    labels={{
                      lyrics: t("lyrics"),
                      scenes: t("scenes"),
                      export: t("exports"),
                    }}
                  />
                </div>

                <div className="pointer-events-none relative z-10 mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="size-3.5" />
                    {formatDate(project.updatedAt || project.createdAt)}
                  </span>
                  <span className="font-mono">{formatDuration(project.audioDurationMs)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={Boolean(deletingProject)}
        onOpenChange={(open) => {
          if (!open && !deletingProjectId) setDeletingProject(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("delete_title")}</DialogTitle>
            <DialogDescription>
              {t("delete_description", { title: deletingProject?.title || t("draft_audio") })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setDeletingProject(null)}
              disabled={Boolean(deletingProjectId)}
              className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
            >
              {t("delete_cancel")}
            </button>
            <button
              type="button"
              onClick={deleteProject}
              disabled={Boolean(deletingProjectId)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
            >
              {deletingProjectId ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {deletingProjectId ? t("deleting") : t("delete_confirm")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
