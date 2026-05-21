"use client";

import { CircleHelp, DollarSign, Music, Sun, User } from "lucide-react";
import { toast } from "sonner";
import { AudioUploadTrim } from "@/components/audio-upload-trim";
import { useRouter } from "@/core/i18n/navigation";

function titleFromFile(file: File) {
  return file.name.replace(/\.[^.]+$/, "");
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

function SiteChrome() {
  return (
    <header className="flex h-16 items-center justify-end border-b border-slate-100 px-6 text-sm text-slate-600">
      <nav className="flex items-center gap-5">
        <span className="rounded-full bg-[#fbbf24] px-4 py-2 font-semibold text-slate-950">Videos</span>
        <a href="#" className="font-medium hover:text-slate-950">Gallery</a>
        <DollarSign className="size-4" />
        <User className="size-4" />
        <CircleHelp className="size-4" />
        <Sun className="size-4" />
      </nav>
    </header>
  );
}

function Footer() {
  const columns = [
    { title: "RESOURCES", links: ["Home", "Pricing", "Uses", "Blog", "Discount"] },
    { title: "COMPANY", links: ["About us", "Affiliates", "Contact"] },
    {
      title: "PRODUCTS",
      links: [
        "AI Lyric Video Maker",
        "AI Video Creation from Lyrics",
        "Lyric Video Creator",
        "Lyric Video Editor",
        "Lyric Video Generator AI",
      ],
    },
    { title: "LEGAL", links: ["Terms of Service", "Privacy Policy"] },
  ];

  return (
    <footer className="mx-auto mt-28 w-full max-w-[1280px] px-8 pb-16 text-slate-950">
      <p className="text-center font-serif text-3xl italic tracking-tight">Made by musicians for musicians.</p>
      <div className="mx-auto mt-9 h-px w-32 bg-slate-200" />
      <div className="mt-10 grid gap-10 lg:grid-cols-[1.6fr_1fr_1fr_1.4fr_1fr]">
        <div>
          <div className="flex items-center gap-3 text-4xl font-black tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-full border-4 border-slate-950 text-[#fbbf24]">
              <Music className="size-5" />
            </span>
            <span>
              Lyric<span className="text-[#fbbf24]">Edits</span>
            </span>
          </div>
          <p className="mt-9 text-lg font-black">Follow us on</p>
          <div className="mt-4 flex gap-2">
            {["dc", "ig", "tk", "yt", "fb", "x", "in"].map((item) => (
              <span key={item} className="flex size-9 items-center justify-center rounded-md bg-slate-950 text-xs font-bold text-white">
                {item}
              </span>
            ))}
          </div>
          <p className="mt-9 text-sm font-medium text-slate-500">All rights reserved © 2024 - 2026</p>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <h3 className="font-black">{column.title}</h3>
            <ul className="mt-5 space-y-4 text-base font-medium">
              {column.links.map((link) => (
                <li key={link}>{link}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}

export default function LyricVideosPage() {
  const router = useRouter();

  async function handleGenerate(
    file: File,
    startSeconds: number,
    endSeconds: number,
    options: { useEntireAudio: boolean; durationSeconds: number },
  ) {
    try {
      const uploaded = await uploadAudio(file);
      const project = await api("/api/lyric-videos", {
        method: "POST",
        body: JSON.stringify({
          title: titleFromFile(file),
          audioUrl: uploaded.url,
          audioStorageKey: uploaded.key,
          audioFilename: uploaded.filename,
          audioDurationMs: Math.max(0, Math.round(options.durationSeconds * 1000)),
          previewConfig: {
            trim: {
              startSeconds,
              endSeconds,
              useEntireAudio: options.useEntireAudio,
            },
          },
        }),
      });
      toast.success("Uploaded. Opening preview workspace...");
      window.setTimeout(() => {
        router.push(`/dashboard/lyric-videos/${project.id}/preview`);
      }, 1000);
    } catch (error: any) {
      toast.error(error.message || "Create failed");
      throw error;
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-white text-slate-800">
      <SiteChrome />
      <AudioUploadTrim onGenerate={handleGenerate} />
      <Footer />
    </div>
  );
}
