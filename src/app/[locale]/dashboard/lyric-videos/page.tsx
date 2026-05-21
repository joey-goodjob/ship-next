"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Clapperboard, ImageIcon, Loader2, Music, Play, Sparkles, Upload, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Project = {
  id: string;
  title: string;
  status: string;
  audioUrl?: string;
  audioFilename?: string;
  audioDurationMs: number;
  storyPrompt: string;
  palette: string;
  artStyle: string;
  aspectRatio: string;
  resolution: string;
  lyricsStatus: string;
  scenesStatus: string;
  renderStatus: string;
  renderUrl?: string;
  createdAt: string;
};

type LyricLine = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
};

type Scene = {
  id: string;
  startMs: number;
  endMs: number;
  prompt: string;
  imageUrl?: string;
  imageTaskId?: string;
  status: string;
};

type ExportJob = {
  id: string;
  status: string;
  resolution: string;
  videoUrl?: string;
  createdAt: string;
};

type Details = {
  project: Project;
  lines: LyricLine[];
  scenes: Scene[];
  exports: ExportJob[];
};

function ms(seconds: number) {
  return Math.max(0, Math.round(seconds * 1000));
}

function linesToText(lines: LyricLine[]) {
  return lines.map((line) => line.text).join("\n");
}

function parseLyrics(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text, index) => ({
      text,
      startMs: ms(index * 4),
      endMs: ms(index * 4 + 3.6),
    }));
}

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const json = await response.json();
  if (json.code !== 0) {
    throw new Error(json.message || "Request failed");
  }
  return json.data;
}

export default function LyricVideosPage() {
  const t = useTranslations("dashboard.lyric_videos");
  const [projects, setProjects] = useState<Project[]>([]);
  const [details, setDetails] = useState<Details | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [rawLyrics, setRawLyrics] = useState("");
  const [lyricsDraft, setLyricsDraft] = useState("");
  const [storyPrompt, setStoryPrompt] = useState("");

  async function loadProjects(selectId?: string) {
    setLoading(true);
    try {
      const data = await api("/api/lyric-videos");
      setProjects(data || []);
      const id = selectId || details?.project.id || data?.[0]?.id;
      if (id) {
        await loadDetails(id);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadDetails(id: string) {
    const data = await api(`/api/lyric-videos/${id}`);
    setDetails(data);
    setLyricsDraft(linesToText(data.lines || []));
    setStoryPrompt(data.project.storyPrompt || "");
  }

  useEffect(() => {
    loadProjects().catch((error) => toast.error(error.message));
  }, []);

  const latestExport = details?.exports?.[0];
  const previewLines = useMemo(() => details?.lines.slice(0, 4) || [], [details]);

  async function createProject() {
    setBusy("create");
    try {
      const project = await api("/api/lyric-videos", {
        method: "POST",
        body: JSON.stringify({
          title,
          audioUrl,
          audioFilename: audioUrl ? audioUrl.split("/").pop() : undefined,
        }),
      });
      await api(`/api/lyric-videos/${project.id}/transcribe`, {
        method: "POST",
        body: JSON.stringify({ rawLyrics }),
      });
      setTitle("");
      setAudioUrl("");
      setRawLyrics("");
      await loadProjects(project.id);
      toast.success(t("saved"));
    } catch (error: any) {
      toast.error(error.message || t("failed"));
    } finally {
      setBusy(null);
    }
  }

  async function saveLyrics() {
    if (!details) return;
    setBusy("lyrics");
    try {
      await api(`/api/lyric-videos/${details.project.id}/lyrics`, {
        method: "POST",
        body: JSON.stringify({ lines: parseLyrics(lyricsDraft) }),
      });
      await loadDetails(details.project.id);
      toast.success(t("saved"));
    } catch (error: any) {
      toast.error(error.message || t("failed"));
    } finally {
      setBusy(null);
    }
  }

  async function runAction(action: "storyboard" | "images" | "exports") {
    if (!details) return;
    setBusy(action);
    try {
      const body = action === "storyboard" ? { storyPrompt } : {};
      await api(`/api/lyric-videos/${details.project.id}/${action}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await loadDetails(details.project.id);
      toast.success(t("queued"));
    } catch (error: any) {
      toast.error(error.message || t("failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Video className="size-6" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="size-4" />
                {t("new_project")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("project_title")}</Label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("project_title_placeholder")} />
              </div>
              <div className="space-y-2">
                <Label>{t("audio_url")}</Label>
                <Input value={audioUrl} onChange={(event) => setAudioUrl(event.target.value)} placeholder={t("audio_url_placeholder")} />
              </div>
              <div className="space-y-2">
                <Label>{t("raw_lyrics")}</Label>
                <textarea
                  value={rawLyrics}
                  onChange={(event) => setRawLyrics(event.target.value)}
                  placeholder={t("raw_lyrics_placeholder")}
                  className="min-h-32 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>
              <Button className="w-full gap-2" onClick={createProject} disabled={busy === "create"}>
                {busy === "create" ? <Loader2 className="size-4 animate-spin" /> : <Music className="size-4" />}
                {busy === "create" ? t("creating") : t("create")}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("title")}</CardTitle>
              <CardDescription>{loading ? "Loading..." : `${projects.length}`}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {projects.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => loadDetails(project.id).catch((error) => toast.error(error.message))}
                  className="flex w-full items-center justify-between rounded-md border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{project.title}</span>
                    <span className="text-xs text-muted-foreground">{project.aspectRatio} · {project.resolution}</span>
                  </span>
                  <Badge variant={project.id === details?.project.id ? "default" : "secondary"}>{project.status}</Badge>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {!details ? (
          <Card className="min-h-[520px]">
            <CardContent className="flex h-full min-h-[520px] items-center justify-center text-center text-sm text-muted-foreground">
              {t("no_project_selected")}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle>{details.project.title}</CardTitle>
                    <CardDescription>
                      {t("status")}: {details.project.lyricsStatus} · {details.project.scenesStatus} · {details.project.renderStatus}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{details.project.aspectRatio}</Badge>
                    <Badge variant="secondary">{details.project.resolution}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>{t("aspect_ratio")}</Label>
                  <Input value={details.project.aspectRatio} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>{t("resolution")}</Label>
                  <Input value={details.project.resolution} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>{t("palette")}</Label>
                  <Input value={details.project.palette} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>{t("art_style")}</Label>
                  <Input value={details.project.artStyle} readOnly />
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="lyrics">
              <TabsList>
                <TabsTrigger value="lyrics">{t("lyrics")}</TabsTrigger>
                <TabsTrigger value="scenes">{t("scenes")}</TabsTrigger>
                <TabsTrigger value="preview">{t("preview")}</TabsTrigger>
                <TabsTrigger value="exports">{t("exports")}</TabsTrigger>
              </TabsList>

              <TabsContent value="lyrics" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("lyrics")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <textarea
                      value={lyricsDraft}
                      onChange={(event) => setLyricsDraft(event.target.value)}
                      className="min-h-72 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-7 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    />
                    <Button onClick={saveLyrics} disabled={busy === "lyrics"} className="gap-2">
                      {busy === "lyrics" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                      {t("save_lyrics")}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="scenes" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("scenes")}</CardTitle>
                    <CardDescription>{details.scenes.length} scenes</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>{t("story_prompt")}</Label>
                      <textarea
                        value={storyPrompt}
                        onChange={(event) => setStoryPrompt(event.target.value)}
                        placeholder={t("story_prompt_placeholder")}
                        className="min-h-24 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => runAction("storyboard")} disabled={busy === "storyboard"} className="gap-2">
                        {busy === "storyboard" ? <Loader2 className="size-4 animate-spin" /> : <Clapperboard className="size-4" />}
                        {t("generate_storyboard")}
                      </Button>
                      <Button variant="outline" onClick={() => runAction("images")} disabled={busy === "images" || details.scenes.length === 0} className="gap-2">
                        {busy === "images" ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
                        {t("queue_images")}
                      </Button>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {details.scenes.map((scene, index) => (
                        <div key={scene.id} className="rounded-lg border bg-card p-4">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">Scene {index + 1}</span>
                            <Badge variant="secondary">{scene.status}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{scene.prompt}</p>
                          {scene.imageTaskId && <p className="mt-2 text-xs text-muted-foreground">Task: {scene.imageTaskId}</p>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="preview" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("preview")}</CardTitle>
                    <CardDescription>{t("style_controls")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="relative aspect-video overflow-hidden rounded-lg border bg-zinc-950 text-white">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(34,197,94,0.35),transparent_28%),radial-gradient(circle_at_75%_35%,rgba(236,72,153,0.28),transparent_32%),linear-gradient(135deg,#09090b,#27272a)]" />
                      <div className="absolute inset-x-0 bottom-8 mx-auto max-w-3xl px-6 text-center">
                        {previewLines.map((line) => (
                          <p key={line.id} className="text-balance text-2xl font-semibold drop-shadow-md md:text-4xl">
                            {line.text}
                          </p>
                        ))}
                      </div>
                      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs backdrop-blur">
                        <Play className="size-3" />
                        Static preview
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="exports" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("exports")}</CardTitle>
                    <CardDescription>{latestExport ? `${t("latest_export")}: ${latestExport.status}` : "No exports yet"}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button onClick={() => runAction("exports")} disabled={busy === "exports"} className="gap-2">
                      {busy === "exports" ? <Loader2 className="size-4 animate-spin" /> : <Video className="size-4" />}
                      {t("queue_export")}
                    </Button>
                    <div className="space-y-2">
                      {details.exports.map((job) => (
                        <div key={job.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                          <span>{job.resolution} MP4</span>
                          <Badge variant="secondary">{job.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
