"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useTranslations } from "next-intl";
import { CalendarClock, Film, Loader2, Music2, Plus, Search, Sparkles } from "lucide-react";
import { Link, useRouter } from "@/core/i18n/navigation";
import { cn } from "@/lib/utils";

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

function statusTone(status: string) {
  if (status === "ready" || status === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "processing" || status === "generating") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "failed") return "border-red-200 bg-red-50 text-red-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

function ProjectStatus({ label, value }: { label: string; value: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full border px-2 text-xs font-semibold", statusTone(value))}>
      {label}: {value}
    </span>
  );
}

export default function LyricVideosPage() {
  const t = useTranslations("dashboard.lyric_videos");
  const router = useRouter();
  const [projects, setProjects] = useState<LyricVideoProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState("");

  async function loadProjects() {
    setLoading(true);
    setError("");
    try {
      const data = await readApi<LyricVideoProject[]>("/api/lyric-videos");
      setProjects(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || t("failed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  const filteredProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) => {
      return [project.title, project.audioFilename, project.pipelineStage, project.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [projects, query]);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || creating) return;

    setCreating(true);
    setError("");
    try {
      const project = await readApi<LyricVideoProject>("/api/lyric-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: cleanTitle }),
      });
      setTitle("");
      router.push(`/dashboard/lyric-videos/${project.id}/preview`);
    } catch (err: any) {
      setError(err?.message || t("failed"));
    } finally {
      setCreating(false);
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

        <form onSubmit={createProject} className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[420px] sm:flex-row">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("project_title_placeholder")}
            className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
          />
          <button
            type="submit"
            disabled={creating || !title.trim()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#F5A623] px-4 text-sm font-bold text-white transition hover:bg-[#E6981F] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {creating ? t("creating") : t("new_project")}
          </button>
        </form>
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
          onClick={loadProjects}
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
          {filteredProjects.map((project) => (
            <Link
              key={project.id}
              href={`/dashboard/lyric-videos/${project.id}/preview`}
              className="group flex min-h-52 flex-col justify-between rounded-lg border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md"
            >
              <div>
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
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-[#F5A623]">
                    {project.aspectRatio}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <ProjectStatus label={t("lyrics")} value={project.lyricsStatus} />
                  <ProjectStatus label={t("scenes")} value={project.scenesStatus} />
                  <ProjectStatus label={t("exports")} value={project.renderStatus} />
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="size-3.5" />
                  {formatDate(project.updatedAt || project.createdAt)}
                </span>
                <span className="font-mono">{formatDuration(project.audioDurationMs)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
