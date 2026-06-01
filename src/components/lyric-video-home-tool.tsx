"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Loader2, Music2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AudioUploadTrim } from "@/components/audio-upload-trim";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { signIn, signUp, useSession } from "@/core/auth/client";
import { Link, useRouter } from "@/core/i18n/navigation";
import { useLyricVideoCreationFlow } from "@/hooks/use-lyric-video-creation-flow";

type PendingGenerate = {
  file: File;
  startTime: number;
  endTime: number;
  options: { useEntireAudio: boolean; durationSeconds: number };
};

function stageLabel(stage: string) {
  if (stage === "uploading") return "Uploading your audio...";
  if (stage === "waiting-auth") return "Keeping your upload ready...";
  if (stage === "creating") return "Creating your lyric video project...";
  if (stage === "recognizing") return "Recognizing audio...";
  if (stage === "story") return "Creating story...";
  if (stage === "redirecting") return "Opening the preview editor...";
  return "Preparing your preview...";
}

export function LyricVideoHomeTool() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const {
    stage,
    error,
    isWorking,
    generateFromFile,
    preparePendingAuth,
    resumePending,
    resetCreationState,
  } = useLyricVideoCreationFlow();
  const pendingGenerateRef = useRef<PendingGenerate | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (isPending || !session?.user) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("continue") !== "lyric-video") return;

    resumePending().then((resumed) => {
      if (!resumed) return;
      params.delete("continue");
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}#create`;
      window.history.replaceState(null, "", nextUrl);
    });
  }, [isPending, resumePending, session?.user]);

  async function handleGenerate(
    file: File,
    startTime: number,
    endTime: number,
    options: { useEntireAudio: boolean; durationSeconds: number },
  ) {
    resetCreationState();

    if (!session?.user) {
      pendingGenerateRef.current = { file, startTime, endTime, options };
      setAuthMode("sign-in");
      setAuthError("");
      setAuthOpen(true);
      throw new Error("Sign in to generate your lyric preview");
    }

    await generateFromFile(file, startTime, endTime, options);
  }

  async function continueAfterAuth() {
    const pending = pendingGenerateRef.current;
    if (!pending) return;
    setAuthOpen(false);
    try {
      await generateFromFile(pending.file, pending.startTime, pending.endTime, pending.options);
      pendingGenerateRef.current = null;
    } catch (err: any) {
      toast.error(err?.message || "Failed to create lyric video");
    }
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      const result =
        authMode === "sign-in"
          ? await signIn.email({ email, password })
          : await signUp.email({ name: name || email.split("@")[0] || "Creator", email, password });

      if ((result as any)?.error) {
        setAuthError((result as any).error.message || "Authentication failed");
        return;
      }

      await continueAfterAuth();
    } catch (err: any) {
      setAuthError(err?.message || "Authentication failed");
    } finally {
      setAuthLoading(false);
    }
  }

  async function continueWithFullSignIn() {
    const pending = pendingGenerateRef.current;
    if (!pending) {
      router.push("/sign-in?callbackUrl=/%3Fcontinue%3Dlyric-video%23create");
      return;
    }

    try {
      await preparePendingAuth(pending.file, pending.startTime, pending.endTime, pending.options);
      window.location.assign("/sign-in?callbackUrl=/%3Fcontinue%3Dlyric-video%23create");
    } catch (err: any) {
      toast.error(err?.message || "Failed to keep your upload ready");
    }
  }

  async function continueWithSocial(provider: "google" | "github") {
    const pending = pendingGenerateRef.current;
    try {
      if (pending) {
        await preparePendingAuth(pending.file, pending.startTime, pending.endTime, pending.options);
      }
      await signIn.social({ provider, callbackURL: "/?continue=lyric-video#create" });
    } catch (err: any) {
      toast.error(err?.message || "Failed to start sign in");
    }
  }

  return (
    <div id="create" className="relative scroll-mt-24">
      <AudioUploadTrim
        compact
        showBack={false}
        showCredits={false}
        onGenerate={handleGenerate}
        creditCost={10}
        generateLabel="Generate lyrics (10 credits)"
        workingLabel={stage === "idle" ? "Creating preview..." : stageLabel(stage)}
        successLabel="Preview ready"
      />

      {isWorking ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-white/88 px-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-md border border-slate-200 bg-white p-5 text-center shadow-lg">
            <Loader2 className="mx-auto size-8 animate-spin text-[#fbbf24]" />
            <p className="mt-4 text-base font-black text-slate-950">{stageLabel(stage)}</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              Stay here for a moment. We will open the preview as soon as the story is ready.
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mx-auto mt-4 max-w-[860px] rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Music2 className="size-5 text-[#fbbf24]" />
              Sign in to generate
            </DialogTitle>
            <DialogDescription>
              Your audio and trim selection stay on this page while you sign in.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authError ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                {authError}
              </div>
            ) : null}

            {authMode === "sign-up" ? (
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Name"
                autoComplete="name"
              />
            ) : null}
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              type="email"
              autoComplete="email"
              required
            />
            <Input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              type="password"
              autoComplete={authMode === "sign-in" ? "current-password" : "new-password"}
              required
            />

            <Button
              type="submit"
              disabled={authLoading}
              className="h-11 w-full gap-2 rounded-md bg-[#fbbf24] font-black text-slate-950 hover:bg-[#f59e0b]"
            >
              {authLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {authMode === "sign-in" ? "Sign in and continue" : "Create account and continue"}
            </Button>
          </form>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" onClick={() => continueWithSocial("google")}>
              Google
            </Button>
            <Button type="button" variant="outline" onClick={() => continueWithSocial("github")}>
              GitHub
            </Button>
          </div>

          <div className="flex flex-col gap-2 text-center text-sm text-slate-500">
            <button
              type="button"
              className="font-semibold text-slate-800 underline underline-offset-4"
              onClick={() => {
                setAuthError("");
                setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in");
              }}
            >
              {authMode === "sign-in" ? "Create an account instead" : "I already have an account"}
            </button>
            <button type="button" className="underline underline-offset-4" onClick={continueWithFullSignIn}>
              Use the full sign-in page
            </button>
            <Link href="/privacy-policy" className="text-xs underline underline-offset-4">
              Privacy policy
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
