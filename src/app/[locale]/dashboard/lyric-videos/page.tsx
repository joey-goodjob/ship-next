"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AudioLines,
  CheckCircle2,
  Clapperboard,
  Download,
  FileAudio,
  ImageIcon,
  Loader2,
  Music,
  RefreshCw,
  Save,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import { toast } from "sonner";
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
  audioStorageKey?: string;
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
  pipelineStage?: string;
  pipelineError?: string;
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
  motionPrompt?: string;
  imageUrl?: string;
  imageTaskId?: string;
  providerTaskId?: string;
  status: string;
  error?: string;
};

type ExportJob = {
  id: string;
  status: string;
  resolution: string;
  videoUrl?: string;
  error?: string;
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

function formatTime(msValue: number) {
  const total = Math.max(0, Math.floor(msValue / 1000));
  const min = Math.floor(total / 60);
  const sec = total % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
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
  if (json.code !== 0) throw new Error(json.message || "Request failed");
  return json.data;
}

async function uploadAudio(file: File) {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/storage/upload-audio", {
    method: "POST",
    body: form,
  });
  const json = await response.json();
  if (json.code !== 0) throw new Error(json.message || "Upload failed");
  return json.data as { url: string; key: string; filename: string; size: number };
}

function StatusBadge({ value }: { value: string }) {
  const variant = value === "success" || value === "ready" ? "default" : value === "failed" ? "destructive" : "secondary";
  return <Badge variant={variant as any}>{value || "empty"}</Badge>;
}

export default function LyricVideosPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [details, setDetails] = useState<Details | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [rawLyrics, setRawLyrics] = useState("");
  const [lyricsDraft, setLyricsDraft] = useState("");
  const [storyPrompt, setStoryPrompt] = useState("");
  const [sceneDrafts, setSceneDrafts] = useState<Record<string, string>>({});

  async function loadProjects(selectId?: string) {
    setLoading(true);
    try {
      const data = await api("/api/lyric-videos");
      setProjects(data || []);
      const id = selectId || details?.project.id || data?.[0]?.id;
      if (id) await loadDetails(id);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetails(id: string) {
    const data = await api(`/api/lyric-videos/${id}`);
    setDetails(data);
    setLyricsDraft(linesToText(data.lines || []));
    setStoryPrompt(data.project.storyPrompt || "");
    setSceneDrafts(
      Object.fromEntries((data.scenes || []).map((scene: Scene) => [scene.id, scene.prompt]))
    );
  }

  useEffect(() => {
    loadProjects().catch((error) => toast.error(error.message));
  }, []);

  useEffect(() => {
    if (!details?.project.id || !details.scenes.some((scene) => scene.status === "processing")) return;
    const timer = window.setInterval(() => {
      api(`/api/lyric-videos/${details.project.id}/images`, { method: "GET" })
        .then(() => loadDetails(details.project.id))
        .catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [details?.project.id, details?.scenes]);

  const latestExport = details?.exports?.[0];
  const activeScene = useMemo(() => details?.scenes.find((scene) => scene.imageUrl) || details?.scenes[0], [details]);
  const activeLine = details?.lines[0];

  async function createProject() {
    if (!audioFile) {
      toast.error("Choose an audio file first");
      return;
    }
    setBusy("create");
    try {
      const uploaded = await uploadAudio(audioFile);
      const project = await api("/api/lyric-videos", {
        method: "POST",
        body: JSON.stringify({
          title: title || audioFile.name.replace(/\.[^.]+$/, ""),
          audioUrl: uploaded.url,
          audioStorageKey: uploaded.key,
          audioFilename: uploaded.filename,
        }),
      });
      if (rawLyrics.trim()) {
        await api(`/api/lyric-videos/${project.id}/transcribe`, {
          method: "POST",
          body: JSON.stringify({ rawLyrics }),
        });
      }
      setTitle("");
      setAudioFile(null);
      setRawLyrics("");
      await loadProjects(project.id);
      toast.success("Project created");
    } catch (error: any) {
      toast.error(error.message || "Create failed");
    } finally {
      setBusy(null);
    }
  }

  async function transcribeProject() {
    if (!details) return;
    setBusy("transcribe");
    try {
      await api(`/api/lyric-videos/${details.project.id}/transcribe`, {
        method: "POST",
        body: JSON.stringify({ rawLyrics: rawLyrics.trim() || undefined }),
      });
      await loadDetails(details.project.id);
      toast.success("Lyrics ready");
    } catch (error: any) {
      toast.error(error.message || "Transcription failed");
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
      toast.success("Lyrics saved");
    } catch (error: any) {
      toast.error(error.message || "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function generateStoryboard() {
    if (!details) return;
    setBusy("storyboard");
    try {
      await api(`/api/lyric-videos/${details.project.id}/storyboard`, {
        method: "POST",
        body: JSON.stringify({ storyPrompt }),
      });
      await loadDetails(details.project.id);
      toast.success("Storyboard generated");
    } catch (error: any) {
      toast.error(error.message || "Storyboard failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveScene(scene: Scene) {
    if (!details) return;
    setBusy(`scene-${scene.id}`);
    try {
      await api(`/api/lyric-videos/${details.project.id}/scenes/${scene.id}`, {
        method: "PATCH",
        body: JSON.stringify({ prompt: sceneDrafts[scene.id] }),
      });
      await loadDetails(details.project.id);
      toast.success("Scene saved");
    } catch (error: any) {
      toast.error(error.message || "Scene save failed");
    } finally {
      setBusy(null);
    }
  }

  async function queueImages(sceneId?: string) {
    if (!details) return;
    setBusy(sceneId ? `image-${sceneId}` : "images");
    try {
      await api(`/api/lyric-videos/${details.project.id}/images`, {
        method: "POST",
        body: JSON.stringify({ sceneId }),
      });
      await loadDetails(details.project.id);
      toast.success("Image generation queued");
    } catch (error: any) {
      toast.error(error.message || "Image generation failed");
    } finally {
      setBusy(null);
    }
  }

  async function syncImages() {
    if (!details) return;
    setBusy("sync-images");
    try {
      await api(`/api/lyric-videos/${details.project.id}/images`, { method: "GET" });
      await loadDetails(details.project.id);
      toast.success("Image status refreshed");
    } catch (error: any) {
      toast.error(error.message || "Refresh failed");
    } finally {
      setBusy(null);
    }
  }

  async function exportVideo() {
    if (!details) return;
    setBusy("export");
    try {
      await api(`/api/lyric-videos/${details.project.id}/exports`, {
        method: "POST",
        body: JSON.stringify({
          settings: {
            fontFamily: "Inter",
            fontSize: 58,
            textColor: "#ffffff",
            shadowColor: "#000000",
            position: "bottom",
          },
        }),
      });
      await loadDetails(details.project.id);
      toast.success("Export complete");
    } catch (error: any) {
      toast.error(error.message || "Export failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Video className="size-6" />
          <h1 className="text-2xl font-semibold tracking-tight">AI Lyric Video Studio</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Upload a song, transcribe lyrics, generate AI scene art, then export a static MP4 lyric video.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="size-4" />
                New project
              </CardTitle>
              <CardDescription>MP3, WAV, M4A, AAC, OGG, or FLAC up to 100MB.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Project title</Label>
                <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Midnight chorus" />
              </div>
              <div className="space-y-2">
                <Label>Audio file</Label>
                <Input
                  type="file"
                  accept="audio/*"
                  onChange={(event) => setAudioFile(event.target.files?.[0] || null)}
                />
                {audioFile && <p className="text-xs text-muted-foreground">{audioFile.name}</p>}
              </div>
              <div className="space-y-2">
                <Label>Optional lyrics override</Label>
                <textarea
                  value={rawLyrics}
                  onChange={(event) => setRawLyrics(event.target.value)}
                  placeholder="Paste lyrics if you want to skip or guide transcription."
                  className="min-h-28 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>
              <Button className="w-full gap-2" onClick={createProject} disabled={busy === "create"}>
                {busy === "create" ? <Loader2 className="size-4 animate-spin" /> : <Music className="size-4" />}
                {busy === "create" ? "Creating..." : "Create project"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Projects</CardTitle>
              <CardDescription>{loading ? "Loading..." : `${projects.length} total`}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {projects.length === 0 && <p className="text-sm text-muted-foreground">No lyric videos yet.</p>}
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => loadDetails(project.id).catch((error) => toast.error(error.message))}
                  className="flex w-full items-center justify-between rounded-md border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{project.title}</span>
                    <span className="text-xs text-muted-foreground">{project.pipelineStage || project.status}</span>
                  </span>
                  <StatusBadge value={project.renderStatus || project.status} />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {!details ? (
          <Card className="min-h-[520px]">
            <CardContent className="flex h-full min-h-[520px] items-center justify-center text-center text-sm text-muted-foreground">
              Select or create a project to begin.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <CardTitle>{details.project.title}</CardTitle>
                      <CardDescription>
                        {details.project.audioFilename || "No audio filename"} · {details.project.aspectRatio} · {details.project.resolution}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge value={details.project.lyricsStatus} />
                      <StatusBadge value={details.project.scenesStatus} />
                      <StatusBadge value={details.project.renderStatus} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {details.project.pipelineError && (
                    <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {details.project.pipelineError}
                    </p>
                  )}
                  {details.project.audioUrl && (
                    <audio className="w-full" controls src={details.project.audioUrl}>
                      <track kind="captions" />
                    </audio>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Preview</CardTitle>
                  <CardDescription>First generated scene with lyric overlay.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="relative aspect-video overflow-hidden rounded-md border bg-zinc-950 text-white">
                    {activeScene?.imageUrl ? (
                      <img src={activeScene.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 bg-[linear-gradient(135deg,#18181b,#3f3f46_55%,#111827)]" />
                    )}
                    <div className="absolute inset-x-0 bottom-8 mx-auto max-w-xl px-6 text-center">
                      <p className="text-balance text-2xl font-bold drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] md:text-3xl">
                        {activeLine?.text || "Lyrics will appear here"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="upload">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="upload" className="gap-2"><FileAudio className="size-4" />Upload</TabsTrigger>
                <TabsTrigger value="lyrics" className="gap-2"><AudioLines className="size-4" />Lyrics</TabsTrigger>
                <TabsTrigger value="scenes" className="gap-2"><Clapperboard className="size-4" />Scenes</TabsTrigger>
                <TabsTrigger value="export" className="gap-2"><Download className="size-4" />Export</TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Upload status</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-md border p-4">
                      <p className="text-sm font-medium">Audio</p>
                      <p className="mt-1 text-sm text-muted-foreground">{details.project.audioUrl ? "Uploaded" : "Missing"}</p>
                    </div>
                    <div className="rounded-md border p-4">
                      <p className="text-sm font-medium">Pipeline</p>
                      <p className="mt-1 text-sm text-muted-foreground">{details.project.pipelineStage || "draft"}</p>
                    </div>
                    <div className="rounded-md border p-4">
                      <p className="text-sm font-medium">Output shape</p>
                      <p className="mt-1 text-sm text-muted-foreground">{details.project.aspectRatio}, {details.project.resolution}</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="lyrics" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Lyrics and timestamps</CardTitle>
                    <CardDescription>Transcription uses Kie Gemini 2.5 Flash when no manual lyrics are supplied.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={transcribeProject} disabled={busy === "transcribe"} className="gap-2">
                        {busy === "transcribe" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                        Transcribe audio
                      </Button>
                      <Button variant="outline" onClick={saveLyrics} disabled={busy === "lyrics"} className="gap-2">
                        {busy === "lyrics" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                        Save lyrics
                      </Button>
                    </div>
                    <textarea
                      value={lyricsDraft}
                      onChange={(event) => setLyricsDraft(event.target.value)}
                      className="min-h-80 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-7 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    />
                    <div className="grid gap-2 md:grid-cols-2">
                      {details.lines.slice(0, 8).map((line) => (
                        <div key={line.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                          <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{formatTime(line.startMs)}</span>
                          <span className="truncate">{line.text}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="scenes" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Storyboard and scene images</CardTitle>
                    <CardDescription>Edit prompts, generate images, and refresh Kie task status.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="space-y-2">
                      <Label>Story prompt</Label>
                      <textarea
                        value={storyPrompt}
                        onChange={(event) => setStoryPrompt(event.target.value)}
                        placeholder="A rainy neon city romance with consistent characters..."
                        className="min-h-24 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={generateStoryboard} disabled={busy === "storyboard"} className="gap-2">
                        {busy === "storyboard" ? <Loader2 className="size-4 animate-spin" /> : <Clapperboard className="size-4" />}
                        Generate storyboard
                      </Button>
                      <Button variant="outline" onClick={() => queueImages()} disabled={busy === "images" || details.scenes.length === 0} className="gap-2">
                        {busy === "images" ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
                        Generate all images
                      </Button>
                      <Button variant="outline" onClick={syncImages} disabled={busy === "sync-images"} className="gap-2">
                        {busy === "sync-images" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                        Refresh status
                      </Button>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      {details.scenes.map((scene, index) => (
                        <div key={scene.id} className="rounded-md border bg-card p-4">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">Scene {index + 1} · {formatTime(scene.startMs)}</span>
                            <StatusBadge value={scene.status} />
                          </div>
                          <div className="mb-3 aspect-video overflow-hidden rounded-md border bg-muted">
                            {scene.imageUrl ? (
                              <img src={scene.imageUrl} alt="" className="size-full object-cover" />
                            ) : (
                              <div className="flex size-full items-center justify-center text-sm text-muted-foreground">No image yet</div>
                            )}
                          </div>
                          <textarea
                            value={sceneDrafts[scene.id] ?? scene.prompt}
                            onChange={(event) => setSceneDrafts((current) => ({ ...current, [scene.id]: event.target.value }))}
                            className="min-h-28 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          />
                          {scene.error && <p className="mt-2 text-xs text-destructive">{scene.error}</p>}
                          {scene.providerTaskId && <p className="mt-2 truncate text-xs text-muted-foreground">Provider task: {scene.providerTaskId}</p>}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => saveScene(scene)} disabled={busy === `scene-${scene.id}`} className="gap-2">
                              {busy === `scene-${scene.id}` ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                              Save
                            </Button>
                            <Button size="sm" onClick={() => queueImages(scene.id)} disabled={busy === `image-${scene.id}`} className="gap-2">
                              {busy === `image-${scene.id}` ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
                              Generate
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="export" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Export MP4</CardTitle>
                    <CardDescription>Server-side FFmpeg render with static scene art, audio, and ASS subtitles.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button onClick={exportVideo} disabled={busy === "export"} className="gap-2">
                      {busy === "export" ? <Loader2 className="size-4 animate-spin" /> : <Video className="size-4" />}
                      Export video
                    </Button>
                    {latestExport?.videoUrl && (
                      <div className="rounded-md border p-4">
                        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                          <CheckCircle2 className="size-4 text-emerald-500" />
                          Latest export is ready
                        </div>
                        <video className="w-full rounded-md border" controls src={latestExport.videoUrl}>
                          <track kind="captions" />
                        </video>
                        <Button className="mt-3 gap-2" variant="outline" onClick={() => window.open(latestExport.videoUrl, "_blank")}>
                          <Download className="size-4" />
                          Open MP4
                        </Button>
                      </div>
                    )}
                    <div className="space-y-2">
                      {details.exports.map((job) => (
                        <div key={job.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                          <span>{job.resolution} MP4</span>
                          <div className="flex items-center gap-2">
                            {job.error && <span className="max-w-80 truncate text-destructive">{job.error}</span>}
                            <StatusBadge value={job.status} />
                          </div>
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
