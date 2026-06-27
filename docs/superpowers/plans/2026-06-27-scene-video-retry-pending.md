# Scene Video Retry Pending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Retry Video pending/loading flicker in LyricVideoMaker Preview -> Scenes -> Batch Generation.

**Architecture:** Keep scene-video retry pending state independent from stale server refreshes, while still letting confirmed queue and final success/failure clear it. Add small pure helpers for scene-level pending reconciliation, then wire them into `EditorProvider` and `BatchGenerationDialog` without refactoring unrelated preview-workbench code.

**Tech Stack:** Next.js 15, React 19, TypeScript, existing `tsx` script tests, existing preview-workbench helper modules.

---

## File Structure

- Modify: `src/components/lyric-videos/preview-workbench/scene-video-candidates.ts`
  - Own pure video-candidate helpers, including merge/reconcile helpers for pending retry state.
- Modify: `src/components/lyric-videos/preview-workbench/editor-provider.tsx`
  - Own API calls, refresh/sync application, and in-flight request guards.
- Modify: `src/components/lyric-videos/preview-workbench/scenes-panel.tsx`
  - Own Batch Generation UI-local pending display state and per-scene button/candidate-strip pending props.
- Modify: `src/modules/lyric-videos/lyric/scene-video-generation.ts`
  - Return hydrated scenes from POST queue so `videoCandidates` shape is stable.
- Create: `scripts/test-scene-video-retry-pending-state.ts`
  - Regression checks for stale refresh, success clearing, and two-scene isolation.
- Modify: `package.json`
  - Add a focused script if useful: `test:scene-video-retry-pending`.

---

### Task 1: Add Failing Pending-State Tests

**Files:**
- Create: `scripts/test-scene-video-retry-pending-state.ts`
- Modify: `package.json`

- [ ] **Step 1: Create the regression script**

Create `scripts/test-scene-video-retry-pending-state.ts`:

```ts
import assert from "node:assert/strict";
import {
  mergeScenesWithPendingSceneVideoRetries,
  nextSceneVideoRetryPendingAfterQueueResponse,
  pruneFinishedSceneVideoRetryPending,
} from "../src/components/lyric-videos/preview-workbench/scene-video-candidates";

const oldSuccessScene = {
  id: "scene-1",
  sort: 1,
  imageUrl: "https://cdn.example.com/source.jpg",
  videoUrl: "https://cdn.example.com/old.mp4",
  videoStatus: "success",
  videoProviderTaskId: "old-provider",
  videoTaskId: "old-task",
  videoCandidates: [{ id: "old-candidate", sceneId: "scene-1", videoUrl: "https://cdn.example.com/old.mp4", createdAt: "2026-01-01T00:00:00.000Z" }],
};

const optimisticProcessingScene = {
  ...oldSuccessScene,
  videoStatus: "processing",
  videoProviderTaskId: "new-provider",
  videoTaskId: "new-task",
  videoError: null,
};

const pending = new Map([
  ["scene-1", { phase: "processing" as const, videoProviderTaskId: "new-provider", videoTaskId: "new-task" }],
]);

const mergedAgainstStaleRefresh = mergeScenesWithPendingSceneVideoRetries({
  previous: [optimisticProcessingScene as any],
  incoming: [oldSuccessScene as any],
  pending,
});

assert.equal(
  mergedAgainstStaleRefresh[0].videoStatus,
  "processing",
  "stale refresh returning the old successful scene must not clear optimistic Retry Video pending state",
);
assert.equal(mergedAgainstStaleRefresh[0].videoProviderTaskId, "new-provider");
assert.equal(mergedAgainstStaleRefresh[0].videoCandidates?.[0]?.id, "old-candidate");

const afterQueue = nextSceneVideoRetryPendingAfterQueueResponse({
  previous: new Map([["scene-1", { phase: "saving" as const }]]),
  sceneId: "scene-1",
  queued: optimisticProcessingScene as any,
});
assert.equal(afterQueue.get("scene-1")?.phase, "processing");
assert.equal(afterQueue.get("scene-1")?.videoProviderTaskId, "new-provider");

const finalSuccessScene = {
  ...optimisticProcessingScene,
  videoUrl: "https://cdn.example.com/new.mp4",
  videoStatus: "success",
  videoCandidates: [
    {
      id: "new-candidate",
      sceneId: "scene-1",
      videoUrl: "https://cdn.example.com/new.mp4",
      providerTaskId: "new-provider",
      videoTaskId: "new-task",
      status: "success",
      createdAt: "2026-01-02T00:00:00.000Z",
    },
  ],
};

const pruned = pruneFinishedSceneVideoRetryPending({
  previous: pending,
  scenes: [finalSuccessScene as any],
});
assert.equal(pruned.has("scene-1"), false, "confirmed success for the queued task must clear pending immediately");

const twoScenePending = new Map([
  ["scene-1", { phase: "processing" as const, videoProviderTaskId: "new-provider-1", videoTaskId: "new-task-1" }],
  ["scene-2", { phase: "processing" as const, videoProviderTaskId: "new-provider-2", videoTaskId: "new-task-2" }],
]);
const twoScenePruned = pruneFinishedSceneVideoRetryPending({
  previous: twoScenePending,
  scenes: [
    {
      ...finalSuccessScene,
      id: "scene-1",
      videoProviderTaskId: "new-provider-1",
      videoTaskId: "new-task-1",
      videoCandidates: [{ ...finalSuccessScene.videoCandidates[0], sceneId: "scene-1", providerTaskId: "new-provider-1", videoTaskId: "new-task-1" }],
    } as any,
    {
      id: "scene-2",
      videoStatus: "processing",
      videoProviderTaskId: "new-provider-2",
      videoTaskId: "new-task-2",
      videoCandidates: [],
    } as any,
  ],
});
assert.equal(twoScenePruned.has("scene-1"), false);
assert.equal(twoScenePruned.has("scene-2"), true, "two simultaneous retries must stay isolated by sceneId");

console.log("scene video retry pending state tests passed");
```

- [ ] **Step 2: Add a package script**

In `package.json`, add:

```json
"test:scene-video-retry-pending": "tsx scripts/test-scene-video-retry-pending-state.ts"
```

Keep the existing script order and comma style.

- [ ] **Step 3: Run the failing test**

Run:

```bash
pnpm test:scene-video-retry-pending
```

Expected: FAIL because `mergeScenesWithPendingSceneVideoRetries`, `nextSceneVideoRetryPendingAfterQueueResponse`, and `pruneFinishedSceneVideoRetryPending` do not exist yet.

---

### Task 2: Add Pure Scene Video Pending Helpers

**Files:**
- Modify: `src/components/lyric-videos/preview-workbench/scene-video-candidates.ts`
- Test: `scripts/test-scene-video-retry-pending-state.ts`

- [ ] **Step 1: Add types and task matching helpers**

Append near the existing type exports:

```ts
export type SceneVideoRetryPendingPhase = "saving" | "processing";

export type SceneVideoRetryPendingMarker = {
  phase: SceneVideoRetryPendingPhase;
  videoProviderTaskId?: string | null;
  videoTaskId?: string | null;
};

export type SceneVideoRetryPendingMap = Map<string, SceneVideoRetryPendingMarker>;

function normalizedId(value?: string | null) {
  return String(value || "").trim();
}

function sceneMatchesPendingVideoTask(scene: Pick<LyricScene, "videoProviderTaskId" | "videoTaskId">, marker: SceneVideoRetryPendingMarker) {
  const markerProviderTaskId = normalizedId(marker.videoProviderTaskId);
  const markerVideoTaskId = normalizedId(marker.videoTaskId);
  return Boolean(
    (markerProviderTaskId && normalizedId(scene.videoProviderTaskId) === markerProviderTaskId) ||
    (markerVideoTaskId && normalizedId(scene.videoTaskId) === markerVideoTaskId),
  );
}

function sceneHasCandidateForPendingVideoTask(scene: Pick<LyricScene, "videoCandidates">, marker: SceneVideoRetryPendingMarker) {
  const markerProviderTaskId = normalizedId(marker.videoProviderTaskId);
  const markerVideoTaskId = normalizedId(marker.videoTaskId);
  return Boolean(
    scene.videoCandidates?.some((candidate) =>
      (markerProviderTaskId && normalizedId(candidate.providerTaskId) === markerProviderTaskId) ||
      (markerVideoTaskId && normalizedId(candidate.videoTaskId) === markerVideoTaskId)
    ),
  );
}
```

- [ ] **Step 2: Add pending map transition helpers**

Add below `applyQueuedSceneVideo()`:

```ts
export function nextSceneVideoRetryPendingAfterQueueResponse({
  previous,
  queued,
  sceneId,
}: {
  previous: SceneVideoRetryPendingMap;
  queued?: LyricScene | null;
  sceneId: string;
}) {
  const next = new Map(previous);
  if (queued?.videoStatus === "processing" && (queued.videoProviderTaskId || queued.videoTaskId)) {
    next.set(sceneId, {
      phase: "processing",
      videoProviderTaskId: queued.videoProviderTaskId || null,
      videoTaskId: queued.videoTaskId || null,
    });
  } else {
    next.delete(sceneId);
  }
  return next;
}

export function pruneFinishedSceneVideoRetryPending({
  previous,
  scenes,
}: {
  previous: SceneVideoRetryPendingMap;
  scenes: LyricScene[];
}) {
  if (previous.size === 0) return previous;
  const scenesById = new Map(scenes.map((scene) => [scene.id, scene]));
  const next = new Map(previous);
  for (const [sceneId, marker] of previous) {
    if (marker.phase !== "processing") continue;
    const scene = scenesById.get(sceneId);
    if (!scene) {
      next.delete(sceneId);
      continue;
    }
    const finishedMatchingTask =
      scene.videoStatus !== "processing" &&
      (sceneMatchesPendingVideoTask(scene, marker) || sceneHasCandidateForPendingVideoTask(scene, marker));
    if (finishedMatchingTask) next.delete(sceneId);
  }
  return next.size === previous.size ? previous : next;
}
```

- [ ] **Step 3: Add stale refresh merge helper**

Add below `mergeVideoSyncedScenes()`:

```ts
export function mergeScenesWithPendingSceneVideoRetries({
  incoming,
  pending,
  previous,
}: {
  incoming: LyricScene[];
  pending: SceneVideoRetryPendingMap;
  previous: LyricScene[];
}) {
  if (pending.size === 0 || previous.length === 0 || incoming.length === 0) return incoming;
  const previousById = new Map(previous.map((scene) => [scene.id, scene]));
  return incoming.map((incomingScene) => {
    const marker = pending.get(incomingScene.id);
    const previousScene = previousById.get(incomingScene.id);
    if (!marker || !previousScene || previousScene.videoStatus !== "processing") return incomingScene;
    if (incomingScene.videoStatus === "processing") return incomingScene;
    if (sceneMatchesPendingVideoTask(incomingScene, marker) || sceneHasCandidateForPendingVideoTask(incomingScene, marker)) {
      return incomingScene;
    }
    return {
      ...incomingScene,
      videoTaskId: previousScene.videoTaskId,
      videoProviderTaskId: previousScene.videoProviderTaskId,
      videoStatus: previousScene.videoStatus,
      videoModel: previousScene.videoModel,
      videoPromptSnapshot: previousScene.videoPromptSnapshot,
      videoGenerationParams: previousScene.videoGenerationParams,
      videoCompletedAt: previousScene.videoCompletedAt,
      videoError: previousScene.videoError,
      videoCandidates: dedupeSceneVideoCandidates([
        ...(incomingScene.videoCandidates || []),
        ...(previousScene.videoCandidates || []),
      ]),
    };
  });
}
```

- [ ] **Step 4: Run the helper test**

Run:

```bash
pnpm test:scene-video-retry-pending
```

Expected: PASS.

---

### Task 3: Protect EditorProvider Refresh/Sync From Stale Video State

**Files:**
- Modify: `src/components/lyric-videos/preview-workbench/editor-provider.tsx`
- Test: `scripts/test-scene-video-retry-pending-state.ts`

- [ ] **Step 1: Import the new helpers and types**

Change the import from `scene-video-candidates` to include:

```ts
import {
  applyQueuedSceneVideo,
  applySelectedSceneVideoCandidate,
  mergeScenesWithPendingSceneVideoRetries,
  mergeVideoSyncedScenes,
  nextSceneVideoRetryPendingAfterQueueResponse,
  pruneFinishedSceneVideoRetryPending,
  type SceneVideoRetryPendingMap,
} from "./scene-video-candidates";
```

- [ ] **Step 2: Add refs for video sync and retry pending**

Near the existing refs:

```ts
const videoSyncInFlightRef = useRef(false);
const sceneVideoRetryPendingRef = useRef<SceneVideoRetryPendingMap>(new Map());
```

- [ ] **Step 3: Add a small setter for scenes that reconciles pending**

Inside `EditorProvider`, before `refresh`:

```ts
function applyScenesWithVideoRetryPending(nextScenes: LyricScene[] | ((previous: LyricScene[]) => LyricScene[])) {
  setScenes((previous) => {
    const resolvedScenes = typeof nextScenes === "function" ? nextScenes(previous) : nextScenes;
    const prunedPending = pruneFinishedSceneVideoRetryPending({
      previous: sceneVideoRetryPendingRef.current,
      scenes: resolvedScenes,
    });
    sceneVideoRetryPendingRef.current = prunedPending;
    return resolvedScenes;
  });
}
```

- [ ] **Step 4: Change refresh scene assignment**

Replace:

```ts
setScenes(details.scenes || []);
```

with:

```ts
applyScenesWithVideoRetryPending((previous) =>
  mergeScenesWithPendingSceneVideoRetries({
    previous,
    incoming: details.scenes || [],
    pending: sceneVideoRetryPendingRef.current,
  }),
);
```

- [ ] **Step 5: Update `queueSceneVideos()` pending lifecycle**

At the start of `queueSceneVideos()` after `selectedSceneIdSet` is created:

```ts
for (const sceneId of selectedSceneIds) {
  sceneVideoRetryPendingRef.current.set(sceneId, { phase: "saving" });
}
```

Keep the optimistic UI:

```ts
setScenes((previous) =>
  previous.map((scene) => (selectedSceneIdSet.has(scene.id) ? applyQueuedSceneVideo(scene) : scene)),
);
```

After POST returns, replace the current `setScenes` block with:

```ts
const queuedById = new Map((queued || []).map((scene) => [scene.id, scene]));
for (const sceneId of selectedSceneIds) {
  sceneVideoRetryPendingRef.current = nextSceneVideoRetryPendingAfterQueueResponse({
    previous: sceneVideoRetryPendingRef.current,
    sceneId,
    queued: queuedById.get(sceneId) || null,
  });
}
applyScenesWithVideoRetryPending((previous) =>
  previous.map((scene) => {
    const queuedScene = queuedById.get(scene.id);
    if (!queuedScene) return scene;
    return {
      ...scene,
      ...queuedScene,
      videoCandidates: queuedScene.videoCandidates || scene.videoCandidates,
    };
  }),
);
```

In the `catch`, before restoring scenes, clear only the selected scene markers:

```ts
for (const sceneId of selectedSceneIds) {
  sceneVideoRetryPendingRef.current.delete(sceneId);
}
```

- [ ] **Step 6: Guard `syncSceneVideos()` against overlapping GETs**

At the start:

```ts
if (videoSyncInFlightRef.current) return;
videoSyncInFlightRef.current = true;
```

Wrap the body with `finally`:

```ts
} finally {
  videoSyncInFlightRef.current = false;
}
```

When applying synced scenes, use:

```ts
applyScenesWithVideoRetryPending((previous) =>
  mergeVideoSyncedScenes({ fields: VIDEO_SYNC_SCENE_FIELDS, previous, synced }),
);
```

- [ ] **Step 7: Run focused checks**

Run:

```bash
pnpm test:scene-video-retry-pending
pnpm tsx scripts/test-scene-video-candidate-strip.ts
```

Expected: both PASS.

---

### Task 4: Add Batch Generation Video Pending UI State

**Files:**
- Modify: `src/components/lyric-videos/preview-workbench/scenes-panel.tsx`
- Test: `scripts/test-scene-video-retry-pending-state.ts`

- [ ] **Step 1: Add local pending state**

Near `pendingImageRetryBySceneId`:

```ts
const [pendingVideoRetryBySceneId, setPendingVideoRetryBySceneId] = useState<Record<string, "saving" | "processing">>({});
```

- [ ] **Step 2: Reset it only when the dialog opens**

Change the existing open-reset effect to:

```ts
useEffect(() => {
  if (!open) return;
  setPendingImageRetryBySceneId({});
  setPendingVideoRetryBySceneId({});
}, [open]);
```

- [ ] **Step 3: Prune video pending after confirmed final state**

Add an effect:

```ts
useEffect(() => {
  if (!open) return;
  setPendingVideoRetryBySceneId((previous) => {
    const nextEntries = Object.entries(previous).filter(([sceneId, phase]) => {
      if (phase !== "processing") return true;
      const scene = scenes.find((item) => item.id === sceneId);
      return scene?.videoStatus === "processing";
    });
    if (nextEntries.length === Object.keys(previous).length) return previous;
    return Object.fromEntries(nextEntries);
  });
}, [open, scenes]);
```

This UI-local prune is safe after Task 3 because stale refreshes should no longer overwrite an in-flight processing scene.

- [ ] **Step 4: Update single-scene Retry Video click flow**

In `generateSceneVideo(scene)`, before `setSubmitting(true)`, add:

```ts
setPendingVideoRetryBySceneId((previous) => ({ ...previous, [scene.id]: "saving" }));
```

When `saveSceneDraftIfNeeded` or `updateScene` fails, clear that scene:

```ts
setPendingVideoRetryBySceneId((previous) => {
  const next = { ...previous };
  delete next[scene.id];
  return next;
});
```

After `const queued = await queueSceneVideos([scene.id]);`, add:

```ts
const queuedScene = queued.find((item) => item.id === scene.id);
setPendingVideoRetryBySceneId((previous) => {
  const next = { ...previous };
  if (queuedScene?.videoStatus === "processing" && (queuedScene.videoProviderTaskId || queuedScene.videoTaskId)) {
    next[scene.id] = "processing";
  } else {
    delete next[scene.id];
  }
  return next;
});
setVideoCandidateOffsets((previous) => ({ ...previous, [scene.id]: 0 }));
```

- [ ] **Step 5: Update batch video generation flow**

In `submitBatchVideos()`, before `await queueSceneVideos(selectedSceneIds);`, add:

```ts
setPendingVideoRetryBySceneId((previous) => {
  const next = { ...previous };
  for (const sceneId of selectedSceneIds) next[sceneId] = "saving";
  return next;
});
```

After queue returns:

```ts
const queued = await queueSceneVideos(selectedSceneIds);
setPendingVideoRetryBySceneId((previous) => {
  const next = { ...previous };
  for (const sceneId of selectedSceneIds) {
    const queuedScene = queued.find((item) => item.id === sceneId);
    if (queuedScene?.videoStatus === "processing" && (queuedScene.videoProviderTaskId || queuedScene.videoTaskId)) next[sceneId] = "processing";
    else delete next[sceneId];
  }
  return next;
});
```

- [ ] **Step 6: Derive strip pending from server OR local state**

Replace:

```ts
const videoGenerationPending = scene.videoStatus === "processing";
```

with:

```ts
const videoRetryPending = Boolean(pendingVideoRetryBySceneId[scene.id]);
const videoGenerationPending = scene.videoStatus === "processing" || videoRetryPending;
```

Keep passing `videoGenerationPending` into `SceneVideoCandidateStrip`.

- [ ] **Step 7: Add source-level assertions to the test script**

Extend `scripts/test-scene-video-retry-pending-state.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const scenesPanelSource = readFileSync(
  join(process.cwd(), "src/components/lyric-videos/preview-workbench/scenes-panel.tsx"),
  "utf8",
);

assert.match(scenesPanelSource, /pendingVideoRetryBySceneId/);
assert.match(scenesPanelSource, /scene\.videoStatus === "processing" \|\| videoRetryPending/);
```

- [ ] **Step 8: Run focused checks**

Run:

```bash
pnpm test:scene-video-retry-pending
pnpm tsx scripts/test-scene-video-candidate-strip.ts
```

Expected: both PASS.

---

### Task 5: Hydrate POST `/scene-videos` Queue Response

**Files:**
- Modify: `src/modules/lyric-videos/lyric/scene-video-generation.ts`
- Test: `scripts/test-scene-video-retry-pending-state.ts`

- [ ] **Step 1: Return hydrated queued scenes**

At the end of `queueSceneVideos()`, replace:

```ts
return queued;
```

with:

```ts
return hydrateSceneVideoCandidates({
  userId: params.userId,
  projectId: params.projectId,
  scenes: queued,
});
```

- [ ] **Step 2: Add source-level assertion**

Extend `scripts/test-scene-video-retry-pending-state.ts`:

```ts
const sceneVideoGenerationSource = readFileSync(
  join(process.cwd(), "src/modules/lyric-videos/lyric/scene-video-generation.ts"),
  "utf8",
);

assert.match(
  sceneVideoGenerationSource,
  /return hydrateSceneVideoCandidates\(\{\s*userId: params\.userId,\s*projectId: params\.projectId,\s*scenes: queued,/s,
  "queueSceneVideos should return hydrated scenes with videoCandidates",
);
```

- [ ] **Step 3: Run focused checks**

Run:

```bash
pnpm test:scene-video-retry-pending
pnpm tsx scripts/test-scene-video-candidates.ts
pnpm tsx scripts/test-scene-video-generation-helpers.ts
```

Expected: all PASS.

---

### Task 6: Final Verification

**Files:**
- No new files beyond prior tasks.

- [ ] **Step 1: Run formatting and focused tests**

Run:

```bash
git diff --check
pnpm test:scene-video-retry-pending
pnpm tsx scripts/test-scene-video-candidate-strip.ts
pnpm tsx scripts/test-scene-video-candidates.ts
pnpm tsx scripts/test-scene-video-generation-helpers.ts
```

Expected: all PASS.

- [ ] **Step 2: Run production build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 3: Run real Chrome verification only after user approval**

Open:

```text
http://localhost:3000/creations/fde611bc-0667-4223-b44d-b31531bc4d58/preview
```

Manual path:

1. Open Scenes.
2. Open Batch Generation.
3. Click Retry Video for one scene.
4. Confirm pending tile appears immediately and does not disappear before queue success.
5. Wait for KIE success.
6. Confirm new candidate appears and pending disappears without an extra spinner tile.
7. Retry two different scenes and confirm each scene only shows its own pending tile.

Evidence to capture:

```text
Browser console: no request/state errors
Next server log: POST /scene-videos followed by stable GET /scene-videos
DB/KIE evidence: new provider task per scene and final success candidate per scene
```

---

## Self-Review

- Spec coverage:
  - Immediate pending: Task 4.
  - Stale refresh cannot clear pending: Task 2 and Task 3.
  - Success clears pending: Task 2, Task 3, Task 4.
  - No extra spinner after candidate ready: Task 3 sync guard and Task 4 prune.
  - Two scenes isolated: Task 1 and Task 2 map keyed by sceneId.
  - Tests: Task 1 through Task 5.
  - Real Chrome test deferred until user approval: Task 6.
- Placeholder scan: no TODO/TBD placeholders.
- Type consistency: pending marker names and helper signatures are consistent across tasks.
