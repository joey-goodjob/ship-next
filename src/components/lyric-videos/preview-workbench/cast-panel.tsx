"use client";

import { useMemo, useState } from "react";
import { Check, Edit3, Loader2, Plus, Save, Sparkles, Trash2, UserRound, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { PanelEmpty } from "./panel-empty";
import type { LyricCastMember } from "./types";

type CastRole = "primary" | "secondary" | "tertiary" | "quaternary" | "inactive";
type ActiveCastRole = Exclude<CastRole, "inactive">;

const ACTIVE_CAST_ROLES: ActiveCastRole[] = ["primary", "secondary", "tertiary", "quaternary"];

function castImageIsProcessing(member: LyricCastMember) {
  return Boolean(member.providerTaskId && !member.referenceImageUrl && member.status !== "failed");
}

function roleForMember(member?: Pick<LyricCastMember, "role" | "status"> | null): CastRole {
  if (!member || member.status !== "active") return "inactive";
  const role = String(member.role || "").toLowerCase();
  if (role === "main" || role === "primary" || !role.trim()) return "primary";
  if (role === "secondary" || role === "duet_partner" || role === "supporting") return "secondary";
  if (role === "tertiary" || role === "third") return "tertiary";
  if (role === "quaternary" || role === "fourth") return "quaternary";
  return "inactive";
}

function roleLabel(role: string) {
  const normalized = roleForMember({ role, status: role === "inactive" ? "inactive" : "active" } as LyricCastMember);
  if (normalized === "primary") return "Primary";
  if (normalized === "secondary") return "Role 2";
  if (normalized === "tertiary") return "Role 3";
  if (normalized === "quaternary") return "Role 4";
  return "Inactive";
}

function nextAvailableRole(cast: LyricCastMember[]): ActiveCastRole | null {
  const activeRoles = new Set(cast.map(roleForMember).filter((role) => role !== "inactive"));
  for (const role of ACTIVE_CAST_ROLES) {
    if (!activeRoles.has(role)) return role;
  }
  return null;
}

export function CastPanel() {
  const t = useTranslations("dashboard.workbench");
  const {
    cast,
    castBusy,
    createCastMember,
    deleteCastMember,
    generationLocked,
    generationLockReason,
    project,
    regenerateCastImage,
    scenes,
    updateCastMember,
  } = useEditor();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const activeRoles = useMemo(() => new Set(cast.map(roleForMember).filter((role) => role !== "inactive")), [cast]);
  const editingMember = useMemo(() => cast.find((member) => member.id === editingId) || null, [cast, editingId]);
  const previewMember = editingMember;
  const previewProcessing = previewMember ? castImageIsProcessing(previewMember) : false;
  const activeLimitReached = activeRoles.size >= ACTIVE_CAST_ROLES.length;
  const scenesCreated =
    project &&
    (!["empty", "lyrics_draft"].includes(project.scenesStatus || "empty") ||
      scenes.some((scene) => scene.status !== "lyrics_draft" && String(scene.prompt || "").trim()));
  const directionLocked = generationLocked || Boolean(scenesCreated);
  const directionLockReason = generationLocked ? generationLockReason : "Cast is locked after scenes have been created.";
  const activeCastCount = cast.filter((member) => roleForMember(member) !== "inactive").length;

  function resetEditor() {
    setEditorOpen(false);
    setEditingId(null);
    setDraftName("");
    setDraftDescription("");
  }

  function openAddCharacter() {
    if (directionLocked) {
      toast.error(directionLockReason);
      return;
    }
    if (activeLimitReached) {
      toast.error(t("max_four_characters"));
      return;
    }
    setEditingId(null);
    setDraftName("New Character");
    setDraftDescription("");
    setEditorOpen(true);
  }

  function beginEdit(member: LyricCastMember) {
    if (directionLocked) {
      toast.error(directionLockReason);
      return;
    }
    setEditingId(member.id);
    setDraftName(member.name);
    setDraftDescription(member.description);
    setEditorOpen(true);
  }

  function requestDelete(member: LyricCastMember) {
    if (directionLocked) {
      toast.error(directionLockReason);
      return;
    }
    if (roleForMember(member) !== "inactive" && activeCastCount <= 1) {
      toast.error(t("need_one_character"));
      return;
    }
    setPendingDeleteId((current) => (current === member.id ? null : member.id));
  }

  async function confirmDelete(member: LyricCastMember) {
    setPendingDeleteId(null);
    await deleteCastMember(member.id);
  }

  function ensureValidDraft() {
    const name = draftName.trim();
    const description = draftDescription.trim();
    if (!name || !description) {
      toast.error(t("name_desc_required"));
      return null;
    }
    return { name, description };
  }

  async function saveDraft() {
    if (directionLocked) return null;
    const draft = ensureValidDraft();
    if (!draft) return null;

    if (editingId) {
      return updateCastMember(editingId, {
        name: draft.name,
        description: draft.description,
        promptFragment: draft.description,
      });
    }

    const role = nextAvailableRole(cast);
    if (!role) {
      toast.error(t("max_four_characters"));
      return null;
    }
    return createCastMember({
      name: draft.name,
      role,
      status: "active",
      description: draft.description,
      promptFragment: draft.description,
      generationParams: { source: "generated" },
    });
  }

  async function saveOnly() {
    const saved = await saveDraft();
    if (saved) resetEditor();
  }

  async function generateNewImage() {
    const saved = await saveDraft();
    if (!saved) return;
    await regenerateCastImage(saved.id);
    resetEditor();
  }

  return (
    <div className="cast-panel flex flex-col gap-[18px]">
      {editorOpen ? (
        <section className="rounded-[8px] border border-[var(--editor-line)] bg-[var(--editor-panel-soft)] p-[14px]">
          <div className="mb-[14px] flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-[8px]">
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                disabled={directionLocked}
                title={directionLocked ? directionLockReason : undefined}
                className="h-[34px] min-w-0 rounded-[6px] border border-transparent bg-transparent px-[2px] text-[16px] font-[900] text-[var(--editor-text)] outline-none hover:border-[var(--editor-line)] focus:border-[var(--editor-accent)] disabled:cursor-not-allowed disabled:text-[var(--editor-muted)]"
                aria-label="Character name"
              />
              <Edit3 className="h-[14px] w-[14px] shrink-0 text-[var(--editor-muted)]" />
            </div>
            <button type="button" onClick={resetEditor} aria-label="Close character editor" className="text-[var(--editor-muted)] hover:text-[var(--editor-text)]">
              <X className="h-[16px] w-[16px]" />
            </button>
          </div>

          <div className="grid gap-[16px] lg:grid-cols-[minmax(220px,34%)_1fr]">
            <div className="flex aspect-square min-h-[220px] items-center justify-center overflow-hidden rounded-[6px] bg-[var(--editor-panel-strong)]">
              {previewMember?.referenceImageUrl ? (
                <img src={previewMember.referenceImageUrl} alt={previewMember.name} className="h-full w-full object-cover" />
              ) : previewProcessing ? (
                <Loader2 className="h-[28px] w-[28px] animate-spin text-[var(--editor-accent)]" />
              ) : (
                <UserRound className="h-[40px] w-[40px] text-[var(--editor-subtle)]" />
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-[10px]">
              <select
                value="character-model"
                disabled
                className="h-[36px] w-fit max-w-full rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[10px] text-[13px] font-[700] text-[var(--editor-text)] outline-none disabled:opacity-80"
                aria-label="Character model"
              >
                <option value="character-model">Character Model</option>
              </select>
              <textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                disabled={directionLocked}
                title={directionLocked ? directionLockReason : undefined}
                rows={8}
                placeholder="Type here the description of the character"
                className="min-h-[190px] w-full resize-y rounded-[6px] border border-[var(--editor-accent)] bg-[var(--editor-panel)] px-[12px] py-[10px] text-[13px] font-[500] leading-5 text-[var(--editor-text)] outline-none disabled:cursor-not-allowed disabled:bg-[var(--editor-panel-strong)] disabled:text-[var(--editor-muted)]"
              />
              <div className="flex flex-wrap items-center gap-[8px]">
                <button
                  type="button"
                  onClick={generateNewImage}
                  disabled={castBusy || directionLocked}
                  title={directionLocked ? directionLockReason : undefined}
                  className="inline-flex h-[36px] items-center gap-[8px] rounded-[6px] bg-[var(--editor-accent)] px-[12px] text-[13px] font-[900] text-[var(--editor-accent-ink)] hover:bg-[var(--editor-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {castBusy ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Sparkles className="h-[14px] w-[14px]" />}
                  Generate New Image
                </button>
                {editingId ? (
                  <button
                    type="button"
                    onClick={saveOnly}
                    disabled={castBusy || directionLocked}
                    title={directionLocked ? directionLockReason : undefined}
                    className="inline-flex h-[36px] items-center gap-[7px] rounded-[6px] border border-[var(--editor-line)] px-[11px] text-[13px] font-[800] text-[var(--editor-text)] hover:bg-[var(--editor-bg)] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Save className="h-[14px] w-[14px]" />
                    Save
                  </button>
                ) : null}
                <button type="button" onClick={resetEditor} className="h-[36px] rounded-[6px] border border-[var(--editor-line)] px-[11px] text-[13px] font-[800] text-[var(--editor-muted)] hover:bg-[var(--editor-panel)]">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {cast.length === 0 ? (
        <PanelEmpty title="No characters yet" description="Add a character and generate a reference image from a description." />
      ) : (
        <div className="flex flex-col divide-y divide-[var(--editor-line)]">
          {cast.map((member) => {
            const processing = castImageIsProcessing(member);
            const activeRole = roleForMember(member);
            const failed = member.status === "failed";
            return (
              <article key={member.id} className="flex items-start gap-[12px] py-[14px]">
                <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-[var(--editor-panel-strong)]">
                  {member.referenceImageUrl ? (
                    <img src={member.referenceImageUrl} alt={member.name} className="h-full w-full object-cover" />
                  ) : processing ? (
                    <Loader2 className="h-[22px] w-[22px] animate-spin text-[var(--editor-accent)]" />
                  ) : (
                    <UserRound className="h-[24px] w-[24px] text-[var(--editor-subtle)]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-[6px]">
                    <p className="truncate text-[14px] font-[900] text-[var(--editor-text)]">{member.name}</p>
                    <span
                      className={cn(
                        "rounded-[999px] px-[7px] py-[2px] text-[10px] font-[800] uppercase",
                        activeRole !== "inactive"
                          ? "bg-[var(--editor-accent-soft)] text-[var(--editor-text)]"
                          : failed
                            ? "bg-[var(--editor-danger-soft)] text-[var(--editor-danger)]"
                            : "bg-[var(--editor-panel-strong)] text-[var(--editor-muted)]",
                      )}
                    >
                      {processing ? "processing" : failed ? "failed" : roleLabel(activeRole)}
                    </span>
                  </div>
                  <p className="mt-[6px] line-clamp-3 text-[12px] font-[500] leading-5 text-[var(--editor-muted)]">{member.description}</p>
                  {member.error ? <p className="mt-[6px] text-[12px] font-[700] text-[var(--editor-danger)]">{member.error}</p> : null}
                </div>
                <div className="relative flex shrink-0 items-center gap-[8px]">
                  <button
                    type="button"
                    onClick={() => beginEdit(member)}
                    disabled={directionLocked}
                    title={directionLocked ? directionLockReason : undefined}
                    className="inline-flex h-[36px] w-[36px] items-center justify-center rounded-[6px] border border-[var(--editor-line)] text-[var(--editor-text)] hover:bg-[var(--editor-bg)] disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label={`Edit ${member.name}`}
                  >
                    <Edit3 className="h-[15px] w-[15px]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => requestDelete(member)}
                    disabled={directionLocked}
                    title={directionLocked ? directionLockReason : undefined}
                    className="inline-flex h-[36px] w-[36px] items-center justify-center rounded-[6px] border border-[var(--editor-line)] text-[var(--editor-text)] hover:border-[var(--editor-danger)] hover:bg-[var(--editor-danger-soft)] hover:text-[var(--editor-danger)] disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label={`Delete ${member.name}`}
                  >
                    <Trash2 className="h-[15px] w-[15px]" />
                  </button>
                  {pendingDeleteId === member.id ? (
                    <div className="absolute bottom-[44px] right-0 z-20 flex items-center gap-[6px] rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[8px] py-[7px] shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
                      <button
                        type="button"
                        onClick={() => confirmDelete(member)}
                        className="inline-flex h-[28px] items-center gap-[5px] rounded-[5px] bg-[var(--editor-danger)] px-[8px] text-[12px] font-[900] text-white hover:opacity-90"
                      >
                        <Check className="h-[12px] w-[12px]" />
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(null)}
                        className="inline-flex h-[28px] items-center gap-[5px] rounded-[5px] border border-[var(--editor-line)] px-[8px] text-[12px] font-[800] text-[var(--editor-muted)] hover:bg-[var(--editor-bg)] hover:text-[var(--editor-text)]"
                      >
                        <X className="h-[12px] w-[12px]" />
                        No
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="flex justify-center border-t border-[var(--editor-line)] pt-[16px]">
        <button
          type="button"
          onClick={openAddCharacter}
          disabled={directionLocked}
          title={directionLocked ? directionLockReason : activeLimitReached ? t("max_four_characters") : undefined}
          className="inline-flex h-[38px] items-center gap-[8px] rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[14px] text-[13px] font-[800] text-[var(--editor-text)] hover:bg-[var(--editor-bg)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-[16px] w-[16px]" />
          Add Character
        </button>
      </div>
    </div>
  );
}
