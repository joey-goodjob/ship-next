"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Loader2, Music2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AudioUploadTrim } from "@/components/audio-upload-trim";
import { LyricVideoMaterialCarousel } from "@/components/lyric-video-material-carousel";
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
import { useLyricVideoCreationFlow, writeHomeUploadedAudio } from "@/hooks/use-lyric-video-creation-flow";

type PendingUpload = {
  file: File;
  startTime: number;
  endTime: number;
  options: { useEntireAudio: boolean; durationSeconds: number };
};

type LyricVideoHomeToolProps = {
  showMaterialCarousel?: boolean;
};

function stageLabel(stage: string) {
  if (stage === "uploading") return "Uploading your audio...";
  if (stage === "redirecting") return "Opening the creator...";
  return "Preparing your song...";
}

export function LyricVideoHomeTool({ showMaterialCarousel = false }: LyricVideoHomeToolProps) {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const {
    stage,
    error,
    uploadProgress,
    isWorking,
    uploadOnly,
    resetCreationState,
  } = useLyricVideoCreationFlow();
  const pendingUploadRef = useRef<PendingUpload | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRedirecting, setIsRedirecting] = useState(false);
  const displayStage = isRedirecting ? "redirecting" : stage;
  const displayWorking = isWorking || isRedirecting;

  useEffect(() => {
    if (!session?.user) return;
    if (authOpen && pendingUploadRef.current) setAuthOpen(false);
  }, [authOpen, session?.user]);

  async function uploadAndContinue(pending: PendingUpload) {
    setIsRedirecting(true);
    try {
      const uploaded = await uploadOnly(pending.file);
      writeHomeUploadedAudio({
        ...uploaded,
        filename: uploaded.filename || pending.file.name,
        size: uploaded.size || pending.file.size,
        contentType: uploaded.contentType || pending.file.type || "audio/mpeg",
        durationSeconds: pending.options.durationSeconds,
      });
    } catch (err: any) {
      // Upload failed: still send the user to the creator instead of leaving
      // them stuck on the home page. The song isn't carried over, so they'll
      // re-pick the file there.
      toast.error(err?.message || "Upload failed, opening the creator anyway");
    } finally {
      pendingUploadRef.current = null;
      router.push("/create?source=home-upload");
    }
  }

  async function handleGenerate(
    file: File | null,
    startTime: number,
    endTime: number,
    options: { useEntireAudio: boolean; durationSeconds: number },
  ) {
    if (!file) {
      toast.error("Choose an audio file first");
      return;
    }

    resetCreationState();
    setIsRedirecting(false);

    if (!session?.user) {
      pendingUploadRef.current = { file, startTime, endTime, options };
      setAuthMode("sign-in");
      setAuthError("");
      setAuthOpen(true);
      throw new Error("Sign in to upload your song");
    }

    await uploadAndContinue({ file, startTime, endTime, options });
  }

  async function continueAfterAuth() {
    const pending = pendingUploadRef.current;
    if (!pending) return;
    setAuthOpen(false);
    try {
      await uploadAndContinue(pending);
    } catch (err: any) {
      setIsRedirecting(false);
      toast.error(err?.message || "Failed to upload your song");
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
    router.push("/sign-in?callbackUrl=/create");
  }

  async function continueWithSocial(provider: "google" | "github") {
    try {
      await signIn.social({ provider, callbackURL: "/create" });
    } catch (err: any) {
      toast.error(err?.message || "Failed to start sign in");
    }
  }

  return (
    <div id="create" className="relative scroll-mt-24">
      <div className={showMaterialCarousel ? "grid min-w-0 items-stretch gap-6 lg:grid-cols-[minmax(320px,390px)_minmax(0,1fr)]" : ""}>
        <div className="min-w-0">
          <AudioUploadTrim
            compact
            presentation="home-card"
            homeCardSize={showMaterialCarousel ? "narrow" : "default"}
            creationStage={displayStage}
            uploadProgress={uploadProgress}
            showBack={false}
            showCredits={false}
            showTrimControls={false}
            autoGenerateOnReady
            completionState="idle"
            onGenerate={handleGenerate}
            generateLabel="Upload song"
            workingLabel={displayStage === "idle" ? "Preparing your song..." : stageLabel(displayStage)}
            successLabel="Song uploaded"
          />
        </div>
        {showMaterialCarousel ? <LyricVideoMaterialCarousel /> : null}
      </div>

      {displayWorking ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-brand-panel/88 px-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-md border border-brand-line bg-brand-panel p-5 text-center shadow-lg">
            <Loader2 className="mx-auto size-8 animate-spin text-brand-accent" />
            <p className="mt-4 text-base font-black text-brand-ink">{stageLabel(displayStage)}</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-brand-muted">
              The creator opens after your audio is safely stored.
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
              <Music2 className="size-5 text-brand-accent" />
              Sign in to upload
            </DialogTitle>
            <DialogDescription>
              Use email sign-in here to keep your selected song on this page.
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
              className="h-11 w-full gap-2 rounded-md bg-brand-accent font-black text-brand-ink hover:bg-brand-accent-hover"
            >
              {authLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {authMode === "sign-in" ? "Sign in and upload" : "Create account and upload"}
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

          <div className="flex flex-col gap-2 text-center text-sm text-brand-muted">
            <button
              type="button"
              className="font-semibold text-brand-ink underline underline-offset-4"
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
