"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Clapperboard, Clipboard, Clock3, Images, Radio, UserRound, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import type { GenerationStep, LyricCastMember, LyricScene, RuntimeState } from "./types";
import { deriveGenerationProgress, failedImageBatchCount, sceneBatchKey, sceneGridParams, sceneHasImage, stepByStage } from "./utils";

const generationStages = [
  { stage: "asr_words", label: "识别歌词" },
  { stage: "song_analysis", label: "分析歌曲" },
  { stage: "prompt_generation", label: "生成分镜" },
  { stage: "image_generation", label: "生成图片" },
  { stage: "finalize_project", label: "完成项目" },
] as const;

type StatusTone = "success" | "running" | "waiting" | "failed" | "neutral";

function statusTone(status?: string | null): StatusTone {
  const value = String(status || "pending").toLowerCase();
  if (["success", "completed", "ready", "done"].includes(value)) return "success";
  if (["failed", "error"].includes(value)) return "failed";
  if (["running", "processing", "queued"].includes(value)) return "running";
  if (["waiting_provider", "waiting", "pending"].includes(value)) return "waiting";
  return "neutral";
}

function statusLabel(status?: string | null) {
  const value = String(status || "pending");
  if (value === "success") return "完成";
  if (value === "running" || value === "processing") return "进行中";
  if (value === "queued") return "排队中";
  if (value === "waiting_provider") return "等待服务商";
  if (value === "failed") return "失败";
  if (value === "pending") return "未开始";
  return value;
}

function StatusBadge({ status }: { status?: string | null }) {
  const tone = statusTone(status);
  return (
    <span
      className={cn(
        "inline-flex h-[22px] shrink-0 items-center rounded-[999px] px-[8px] text-[10px] font-[900]",
        tone === "success" ? "bg-[var(--editor-accent-soft)] text-[var(--editor-text)]" : null,
        tone === "running" ? "bg-[var(--editor-panel-strong)] text-[var(--editor-text)]" : null,
        tone === "waiting" ? "bg-[var(--editor-accent-soft)] text-[var(--editor-text)]" : null,
        tone === "failed" ? "bg-[var(--editor-danger-soft)] text-[var(--editor-danger)]" : null,
        tone === "neutral" ? "bg-[var(--editor-panel-strong)] text-[var(--editor-muted)]" : null,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

function castImageIsProcessing(member: LyricCastMember) {
  return Boolean(member.providerTaskId && !member.referenceImageUrl && member.status !== "failed");
}

function activeMainCast(cast: LyricCastMember[]) {
  return cast.filter((member) => member.status === "active" && (member.role.toLowerCase() === "main" || !member.role.trim()));
}

function distinctCount(values: string[]) {
  return new Set(values.map((value) => value.trim()).filter(Boolean)).size;
}

function numberFromUnknown(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function timestampMs(value?: string | Date | null) {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function formatDuration(ms?: number | null) {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "未记录";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatClockTime(value?: string | Date | null) {
  const ms = timestampMs(value);
  if (ms === null) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function stepTiming(step?: GenerationStep | null) {
  const startedMs = timestampMs(step?.startedAt);
  const completedMs = timestampMs(step?.completedAt);
  const status = String(step?.status || "pending");
  const active = ["running", "processing", "queued", "waiting_provider"].includes(status);
  const durationMs =
    startedMs !== null && completedMs !== null
      ? completedMs - startedMs
      : startedMs !== null && active
        ? Date.now() - startedMs
        : null;

  return {
    startedAt: step?.startedAt || null,
    completedAt: step?.completedAt || null,
    durationMs,
    durationLabel: formatDuration(durationMs),
    startedLabel: formatClockTime(step?.startedAt),
    completedLabel: formatClockTime(step?.completedAt),
    prefix: completedMs !== null ? "耗时" : startedMs !== null && active ? "已运行" : "耗时",
  };
}

function parseStepOutput(step?: GenerationStep | null) {
  const value = step?.outputJson;
  if (!value) return null;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stepFailureSummary(step?: GenerationStep | null) {
  const output = parseStepOutput(step);
  if (!output || output.failure !== true) return null;
  return {
    errorKind: String(output.errorKind || step?.errorCode || "generation_failed"),
    stage: String(output.stage || step?.stage || ""),
    message: String(output.message || step?.errorMessage || "Generation failed"),
    diagnostics: output.diagnostics || null,
  };
}

function buildImageDiagnostics(scenes: LyricScene[]) {
  const total = scenes.length;
  const success = scenes.filter(sceneHasImage).length;
  const lyricsDraft = scenes.filter((scene) => scene.status === "lyrics_draft").length;
  const promptReady = scenes.filter((scene) => String(scene.prompt || "").trim() || String(scene.motionPrompt || "").trim()).length;
  const processingScenes = scenes.filter((scene) => scene.status === "processing" && !scene.imageUrl);
  const failedScenes = scenes.filter((scene) => scene.status === "failed" && !scene.imageUrl);
  const missingImage = scenes.filter((scene) => !scene.imageUrl).length;
  const providerTaskIds = scenes.map((scene) => scene.providerTaskId || String(sceneGridParams(scene)?.providerTaskId || ""));
  const gridBatchKeys = scenes.map((scene) => {
    const grid = sceneGridParams(scene);
    const batchIndex = numberFromUnknown(grid?.batchIndex);
    if (batchIndex !== null) return `batch:${batchIndex}`;
    return sceneBatchKey(scene);
  });
  const processingBatchKeys = processingScenes.map(sceneBatchKey);
  const failedBatches = failedImageBatchCount(scenes);
  const panelIndexes = scenes
    .map((scene) => {
      const grid = sceneGridParams(scene);
      return numberFromUnknown(grid?.globalPanelIndex ?? grid?.panelIndex);
    })
    .filter((value): value is number => value !== null);

  return {
    total,
    success,
    lyricsDraft,
    promptReady,
    processing: processingScenes.length,
    failed: failedScenes.length,
    missingImage,
    providerTaskCount: distinctCount(providerTaskIds),
    gridBatchCount: distinctCount(gridBatchKeys),
    processingBatchCount: distinctCount(processingBatchKeys),
    failedBatches,
    minPanel: panelIndexes.length ? Math.min(...panelIndexes) : null,
    maxPanel: panelIndexes.length ? Math.max(...panelIndexes) : null,
    processingSceneIds: processingScenes.map((scene) => scene.id),
  };
}

function buildCastDiagnostics(cast: LyricCastMember[]) {
  const mainCast = activeMainCast(cast);
  const primary = mainCast[0] || null;
  return {
    total: cast.length,
    activeMainCount: mainCast.length,
    activeMainName: primary?.name || "",
    activeMainHasReference: Boolean(primary?.referenceImageUrl),
    withReferenceImage: cast.filter((member) => Boolean(member.referenceImageUrl)).length,
    processing: cast.filter(castImageIsProcessing).length,
    failed: cast.filter((member) => member.status === "failed").length,
  };
}

function buildSceneErrors(scenes: LyricScene[]) {
  return scenes
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene }) => Boolean(scene.error || (scene.status === "failed" && !scene.imageUrl)))
    .slice(0, 8)
    .map(({ scene, index }) => ({
      sceneNumber: index + 1,
      sceneId: scene.id,
      status: scene.status,
      providerTaskId: scene.providerTaskId || null,
      error: scene.error || "Image generation failed",
    }));
}

function buildReport(params: {
  cast: LyricCastMember[];
  generationSteps: GenerationStep[];
  imageDiagnostics: ReturnType<typeof buildImageDiagnostics>;
  lineCount: number;
  wordCount: number;
  projectId: string;
  shouldSyncImages: boolean;
  scenes: LyricScene[];
  generationRunStatus?: string;
  currentStage?: string | null;
  runtimeState?: RuntimeState | null;
  activeRunId?: string | null;
  generationStatus?: string;
  generationProgress?: number;
  pipelineError?: string | null;
}) {
  return {
    projectId: params.projectId,
    activeRunId: params.activeRunId || null,
    pipeline: {
      currentStage: params.currentStage || null,
      generationRunStatus: params.generationRunStatus || null,
      generationStatus: params.generationStatus || null,
      generationProgress: params.generationProgress || 0,
      pipelineError: params.pipelineError || null,
      runtimeState: params.runtimeState || null,
    },
    steps: generationStages.map(({ stage }) => {
      const step = stepByStage(params.generationSteps, stage);
      const timing = stepTiming(step);
      return {
        stage,
        status: step?.status || "pending",
        progressPercent: step?.progressPercent || 0,
        errorCode: step?.errorCode || null,
        errorMessage: step?.errorMessage || null,
        failure: stepFailureSummary(step),
        startedAt: timing.startedAt,
        completedAt: timing.completedAt,
        durationMs: timing.durationMs,
        durationLabel: timing.durationLabel,
      };
    }),
    scenesSummary: {
      lines: params.lineCount,
      words: params.wordCount,
      total: params.imageDiagnostics.total,
      lyricsDraft: params.imageDiagnostics.lyricsDraft,
      promptReady: params.imageDiagnostics.promptReady,
      success: params.imageDiagnostics.success,
      processing: params.imageDiagnostics.processing,
      failed: params.imageDiagnostics.failed,
      missingImage: params.imageDiagnostics.missingImage,
      providerTaskCount: params.imageDiagnostics.providerTaskCount,
      gridBatchCount: params.imageDiagnostics.gridBatchCount,
      failedBatches: params.imageDiagnostics.failedBatches,
    },
    castSummary: buildCastDiagnostics(params.cast),
    polling: {
      shouldSyncImages: params.shouldSyncImages,
      processingSceneIds: params.imageDiagnostics.processingSceneIds,
    },
    latestSceneErrors: buildSceneErrors(params.scenes),
  };
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function DiagnosticsPanel() {
  const t = useTranslations("dashboard.workbench");
  const { cast, generationRun, generationSteps, lines, project, projectId, runtimeState, scenes, words } = useEditor();
  const progress = deriveGenerationProgress({ project, generationRun, generationSteps, runtimeState, scenes });
  const imageDiagnostics = useMemo(() => buildImageDiagnostics(scenes), [scenes]);
  const castDiagnostics = useMemo(() => buildCastDiagnostics(cast), [cast]);
  const sceneErrors = useMemo(() => buildSceneErrors(scenes), [scenes]);
  const shouldSyncImages = imageDiagnostics.processingSceneIds.length > 0;
  const directionReviewPaused = Boolean(progress.directionReady);
  const report = useMemo(
    () =>
      buildReport({
        cast,
        generationSteps,
        imageDiagnostics,
        lineCount: lines.length,
        projectId,
        shouldSyncImages,
        scenes,
        wordCount: words.length,
        generationRunStatus: generationRun?.status,
        currentStage: runtimeState?.currentStage || generationRun?.currentStage || project?.pipelineStage,
        runtimeState,
        activeRunId: project?.activeRunId,
        generationStatus: project?.generationStatus,
        generationProgress: project?.generationProgress,
        pipelineError: project?.pipelineError,
      }),
    [cast, generationRun, generationSteps, imageDiagnostics, lines.length, project, projectId, runtimeState, scenes, shouldSyncImages, words.length],
  );

  async function copyDiagnostics() {
    try {
      await copyText(JSON.stringify(report, null, 2));
      toast.success(t("diagnostics_copied"));
    } catch {
      toast.error(t("copy_failed"));
    }
  }

  return (
    <div className="diagnostics-panel flex flex-col gap-[18px]">
      <section className="border-b border-[var(--editor-line)] pb-[16px]">
        <div className="mb-[10px] flex items-center justify-between gap-[10px]">
          <div className="min-w-0">
            <p className="text-[13px] font-[900] text-[var(--editor-text)]">当前状态</p>
            <p className="mt-[3px] truncate text-[12px] font-[650] text-[var(--editor-muted)]">{project?.title || "Lyric video"}</p>
          </div>
          <StatusBadge status={progress.generationStatus} />
        </div>
        <div className="rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel-soft)] px-[12px] py-[11px]">
          <div className="flex items-start gap-[9px]">
            {progress.failed > 0 && progress.processing === 0 ? (
              <AlertTriangle className="mt-[1px] h-[16px] w-[16px] shrink-0 text-[var(--editor-danger)]" />
            ) : progress.isActive ? (
              <Clock3 className="mt-[1px] h-[16px] w-[16px] shrink-0 text-[var(--editor-accent)]" />
            ) : (
              <CheckCircle2 className="mt-[1px] h-[16px] w-[16px] shrink-0 text-[var(--editor-accent)]" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-[900] leading-[20px] text-[var(--editor-text)]">{progress.primary}</p>
              <p className="mt-[4px] text-[12px] font-[650] leading-[18px] text-[var(--editor-muted)]">
                {progress.currentStage} · {Math.round(progress.progressPercent)}%
              </p>
              {progress.error ? <p className="mt-[7px] line-clamp-3 text-[12px] font-[750] leading-[18px] text-[var(--editor-danger)]">{progress.error}</p> : null}
            </div>
          </div>
        </div>
      </section>

      <DiagnosticsSection title="流程步骤" icon={Clock3}>
        {directionReviewPaused ? (
          <div className="mb-[10px] rounded-[6px] border border-[var(--editor-accent)] bg-[var(--editor-accent-soft)] px-[11px] py-[10px] text-[var(--editor-text)]">
            <p className="text-[13px] font-[900]">方向审核暂停</p>
            <p className="mt-[3px] text-[12px] font-[700] leading-[18px]">
              歌曲分析已完成。点击轨道蒙版上的 Confirm & Generate Scenes 后，场景准备、图片生成和完成项目会继续写入这里。
            </p>
          </div>
        ) : null}
        <div className="divide-y divide-[var(--editor-line)]">
          {generationStages.map(({ label, stage }) => {
            const step = stepByStage(generationSteps, stage);
            const timing = stepTiming(step);
            return (
              <div key={stage} className="flex min-h-[46px] items-center gap-[10px] py-[9px]">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-[850] text-[var(--editor-text)]">{label}</p>
                  <p className="mt-[2px] truncate text-[11px] font-[700] text-[var(--editor-muted)]">
                    {stage} · {Math.round(step?.progressPercent || 0)}% · {timing.prefix} {timing.durationLabel}
                  </p>
                  {step?.startedAt || step?.completedAt ? (
                    <p className="mt-[2px] truncate text-[11px] font-[650] text-[var(--editor-subtle)]">
                      开始 {timing.startedLabel} · 完成 {timing.completedLabel}
                    </p>
                  ) : null}
                  {step?.errorMessage ? <p className="mt-[4px] line-clamp-2 text-[11px] font-[750] text-[var(--editor-danger)]">{step.errorMessage}</p> : null}
                  {stepFailureSummary(step) ? (
                    <p className="mt-[3px] truncate text-[11px] font-[800] text-[var(--editor-danger)]">
                      {stepFailureSummary(step)?.errorKind}
                    </p>
                  ) : null}
                </div>
                <StatusBadge status={step?.status || "pending"} />
              </div>
            );
          })}
        </div>
      </DiagnosticsSection>

      <DiagnosticsSection title="时间分镜诊断" icon={Clapperboard}>
        <MetricGrid
          items={[
            ["歌词行", lines.length],
            ["words", words.length],
            ["总 scenes", imageDiagnostics.total],
            ["时间骨架", imageDiagnostics.lyricsDraft],
            ["prompt ready", imageDiagnostics.promptReady],
            ["有图片", imageDiagnostics.success],
          ]}
        />
      </DiagnosticsSection>

      <DiagnosticsSection title="图片诊断" icon={Images}>
        <MetricGrid
          items={[
            ["有图片", imageDiagnostics.success],
            ["处理中", imageDiagnostics.processing],
            ["失败", imageDiagnostics.failed],
            ["缺图", imageDiagnostics.missingImage],
            ["grid 批次", imageDiagnostics.gridBatchCount],
            ["provider tasks", imageDiagnostics.providerTaskCount],
            ["失败批次", imageDiagnostics.failedBatches],
          ]}
        />
        <p className="mt-[10px] truncate text-[11px] font-[700] text-[var(--editor-muted)]">
          panel 范围: {imageDiagnostics.minPanel ?? "n/a"} - {imageDiagnostics.maxPanel ?? "n/a"} · processing batches:{" "}
          {imageDiagnostics.processingBatchCount}
        </p>
      </DiagnosticsSection>

      <DiagnosticsSection title="角色诊断" icon={UserRound}>
        <MetricGrid
          items={[
            ["角色数", castDiagnostics.total],
            ["主角数", castDiagnostics.activeMainCount],
            ["有参考图", castDiagnostics.withReferenceImage],
            ["处理中", castDiagnostics.processing],
            ["失败", castDiagnostics.failed],
          ]}
        />
        <p className="mt-[10px] line-clamp-2 text-[12px] font-[750] text-[var(--editor-muted)]">
          主角: {castDiagnostics.activeMainName || "未选择"} · reference:{" "}
          {castDiagnostics.activeMainHasReference ? "已准备" : "缺少或未完成"}
        </p>
      </DiagnosticsSection>

      <DiagnosticsSection title="同步判断" icon={Radio}>
        <div
          className={cn(
            "flex items-start gap-[9px] rounded-[6px] border px-[11px] py-[10px]",
            shouldSyncImages
              ? "border-[var(--editor-accent)] bg-[var(--editor-accent-soft)] text-[var(--editor-text)]"
              : "border-[var(--editor-line)] bg-[var(--editor-panel-soft)] text-[var(--editor-text)]",
          )}
        >
          {shouldSyncImages ? <AlertTriangle className="mt-[1px] h-[16px] w-[16px] shrink-0" /> : <CheckCircle2 className="mt-[1px] h-[16px] w-[16px] shrink-0" />}
          <div className="min-w-0">
            <p className="text-[13px] font-[900]">{shouldSyncImages ? "需要同步 /images" : "不需要继续轮询"}</p>
            <p className="mt-[3px] text-[12px] font-[700] leading-[18px]">
              {shouldSyncImages
                ? `${imageDiagnostics.processingSceneIds.length} 个 scene 正在等服务商返回图片。`
                : "没有 processing 且缺图的 provider task，Preview 可以安静下来。"}
            </p>
          </div>
        </div>
      </DiagnosticsSection>

      {sceneErrors.length > 0 ? (
        <DiagnosticsSection title="最近错误" icon={XCircle}>
          <div className="divide-y divide-[var(--editor-danger)] rounded-[6px] border border-[var(--editor-danger)] bg-[var(--editor-danger-soft)]">
            {sceneErrors.map((item) => (
              <div key={`${item.sceneId}-${item.sceneNumber}`} className="px-[10px] py-[8px]">
                <p className="truncate text-[12px] font-[900] text-[var(--editor-danger)]">Scene {item.sceneNumber}</p>
                <p className="mt-[2px] line-clamp-2 text-[11px] font-[700] leading-[17px] text-[var(--editor-danger)]">{item.error}</p>
              </div>
            ))}
          </div>
        </DiagnosticsSection>
      ) : null}

      <button
        type="button"
        onClick={copyDiagnostics}
        className="inline-flex h-[38px] w-full items-center justify-center gap-[8px] rounded-[6px] bg-[var(--editor-text)] px-[12px] text-[13px] font-[900] text-[var(--editor-bg)] hover:bg-[var(--editor-muted)]"
      >
        <Clipboard className="h-[15px] w-[15px]" />
        复制诊断信息
      </button>
    </div>
  );
}

function DiagnosticsSection({
  children,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <section className="border-b border-[var(--editor-line)] pb-[16px] last:border-b-0">
      <div className="mb-[10px] flex items-center gap-[7px]">
        <Icon className="h-[15px] w-[15px] text-[var(--editor-accent)]" />
        <p className="text-[13px] font-[900] text-[var(--editor-text)]">{title}</p>
      </div>
      {children}
    </section>
  );
}

function MetricGrid({ items }: { items: Array<[string, number]> }) {
  return (
    <div className="grid grid-cols-2 gap-[8px]">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[10px] py-[8px]">
          <p className="truncate text-[11px] font-[800] text-[var(--editor-muted)]">{label}</p>
          <p className="mt-[2px] text-[18px] font-[950] leading-[22px] text-[var(--editor-text)]">{value}</p>
        </div>
      ))}
    </div>
  );
}
