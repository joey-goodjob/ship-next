"use client";

import { useState } from "react";
import { Check, Edit3, Loader2, Plus, RefreshCcw, Save, Trash2, Users, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useEditor } from "./editor-context";
import { PanelEmpty } from "./panel-empty";
import type { LyricCastMember } from "./types";

function castImageIsProcessing(member: LyricCastMember) {
  return Boolean(member.providerTaskId && !member.referenceImageUrl && member.status !== "failed");
}

export function CastPanel() {
  const {
    cast,
    castBusy,
    createCastMember,
    deleteCastMember,
    generationLocked,
    generationLockReason,
    generateCastCandidates,
    project,
    regenerateCastImage,
    scenes,
    updateCastMember,
  } = useEditor();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const scenesCreated =
    project &&
    (!["empty", "lyrics_draft"].includes(project.scenesStatus || "empty") ||
      scenes.some((scene) => scene.status !== "lyrics_draft" && String(scene.prompt || "").trim()));
  const directionLocked = generationLocked || Boolean(scenesCreated);
  const directionLockReason = generationLocked ? generationLockReason : "Cast is locked after scenes have been created.";

  function beginCreate() {
    if (directionLocked) return;
    setEditingId(null);
    setDraftName("");
    setDraftDescription("");
    setFormOpen(true);
  }

  function beginEdit(member: LyricCastMember) {
    if (directionLocked) return;
    setEditingId(member.id);
    setDraftName(member.name);
    setDraftDescription(member.description);
    setFormOpen(true);
  }

  async function submitCharacter() {
    if (directionLocked) return;
    const name = draftName.trim();
    const description = draftDescription.trim();
    if (!name || !description) {
      toast.error("Name and description are required");
      return;
    }

    if (editingId) {
      const updated = await updateCastMember(editingId, { name, description, promptFragment: description });
      if (updated) {
        setFormOpen(false);
        setEditingId(null);
      }
      return;
    }

    const created = await createCastMember({ name, description, promptFragment: description });
    if (created) {
      setFormOpen(false);
      await regenerateCastImage(created.id);
    }
  }

  return (
    <div className="cast-panel flex flex-col gap-[16px]">
      <div className="flex flex-wrap items-center justify-center gap-[8px] border-b border-[var(--editor-line)] pb-[16px]">
        <button
          type="button"
          onClick={generateCastCandidates}
          disabled={castBusy || directionLocked}
          title={directionLocked ? directionLockReason : undefined}
          className="inline-flex h-[38px] items-center gap-[8px] rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[12px] text-[13px] font-[800] text-[var(--editor-text)] hover:bg-[var(--editor-bg)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {castBusy ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <Wand2 className="h-[15px] w-[15px]" />}
          Generate candidates
        </button>
        <button
          type="button"
          onClick={beginCreate}
          disabled={directionLocked}
          title={directionLocked ? directionLockReason : undefined}
          className="inline-flex h-[38px] items-center gap-[8px] rounded-[6px] bg-[var(--editor-accent)] px-[12px] text-[13px] font-[800] text-[var(--editor-accent-ink)] hover:bg-[var(--editor-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-[15px] w-[15px]" />
          Add character
        </button>
      </div>

      {formOpen ? (
        <section className="rounded-[8px] border border-[var(--editor-line)] bg-[var(--editor-panel-soft)] p-[14px]">
          <div className="mb-[10px] flex items-center justify-between">
            <p className="text-[13px] font-[800] text-[var(--editor-text)]">{editingId ? "Edit character" : "Create character"}</p>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setEditingId(null);
              }}
              aria-label="Close character form"
              className="text-[var(--editor-muted)] hover:text-[var(--editor-text)]"
            >
              <X className="h-[16px] w-[16px]" />
            </button>
          </div>
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            disabled={directionLocked}
            title={directionLocked ? directionLockReason : undefined}
            placeholder="Elena"
            className="mb-[8px] h-[38px] w-full rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[11px] text-[13px] font-[700] text-[var(--editor-text)] outline-none focus:border-[var(--editor-accent)] disabled:cursor-not-allowed disabled:bg-[var(--editor-panel-strong)] disabled:text-[var(--editor-muted)]"
          />
          <textarea
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.target.value)}
            disabled={directionLocked}
            title={directionLocked ? directionLockReason : undefined}
            rows={5}
            placeholder="Describe the face, hair, build, outfit, accessories, and overall vibe."
            className="w-full resize-y rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel)] px-[11px] py-[9px] text-[13px] font-[500] leading-5 text-[var(--editor-text)] outline-none focus:border-[var(--editor-accent)] disabled:cursor-not-allowed disabled:bg-[var(--editor-panel-strong)] disabled:text-[var(--editor-muted)]"
          />
          <div className="mt-[10px] flex justify-end gap-[8px]">
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                setEditingId(null);
              }}
              className="h-[34px] rounded-[6px] border border-[var(--editor-line)] px-[12px] text-[13px] font-[800] text-[var(--editor-muted)] hover:bg-[var(--editor-panel)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitCharacter}
              disabled={castBusy || directionLocked}
              title={directionLocked ? directionLockReason : undefined}
              className="inline-flex h-[34px] items-center gap-[7px] rounded-[6px] bg-[var(--editor-text)] px-[12px] text-[13px] font-[800] text-[var(--editor-bg)] hover:bg-[var(--editor-muted)] disabled:opacity-50"
            >
              {castBusy ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Save className="h-[14px] w-[14px]" />}
              {editingId ? "Save" : "Create & generate"}
            </button>
          </div>
        </section>
      ) : null}

      {cast.length === 0 ? (
        <PanelEmpty
          title="No characters yet"
          description="Generate a few main character candidates from the song, or create one manually."
        />
      ) : (
        <div className="flex flex-col divide-y divide-[var(--editor-line)]">
          {cast.map((member) => {
            const processing = castImageIsProcessing(member);
            const active = member.status === "active";
            const failed = member.status === "failed";
            return (
              <article key={member.id} className="flex gap-[12px] py-[14px]">
                <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-[var(--editor-panel-strong)]">
                  {member.referenceImageUrl ? (
                    <img src={member.referenceImageUrl} alt={member.name} className="h-full w-full object-cover" />
                  ) : processing ? (
                    <Loader2 className="h-[22px] w-[22px] animate-spin text-[var(--editor-accent)]" />
                  ) : (
                    <Users className="h-[24px] w-[24px] text-[var(--editor-subtle)]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-[10px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-[6px]">
                        <p className="truncate text-[14px] font-[900] text-[var(--editor-text)]">{member.name}</p>
                        <span
                          className={cn(
                            "rounded-[999px] px-[7px] py-[2px] text-[10px] font-[800] uppercase",
                            active
                              ? "bg-[var(--editor-accent-soft)] text-[var(--editor-text)]"
                              : failed
                                ? "bg-[var(--editor-danger-soft)] text-[var(--editor-danger)]"
                                : "bg-[var(--editor-panel-strong)] text-[var(--editor-muted)]",
                          )}
                        >
                          {processing ? "processing" : active ? "main" : member.status}
                        </span>
                      </div>
                      <p className="mt-[6px] line-clamp-3 text-[12px] font-[500] leading-5 text-[var(--editor-muted)]">{member.description}</p>
                      {member.error ? <p className="mt-[6px] text-[12px] font-[700] text-[var(--editor-danger)]">{member.error}</p> : null}
                    </div>
                  </div>
                  <div className="mt-[10px] flex flex-wrap gap-[7px]">
                    <button
                      type="button"
                      onClick={() => updateCastMember(member.id, { selectAsMain: true })}
                      disabled={active || directionLocked}
                      title={directionLocked ? directionLockReason : undefined}
                      className="inline-flex h-[31px] items-center gap-[6px] rounded-[6px] border border-[var(--editor-line)] px-[9px] text-[12px] font-[800] text-[var(--editor-text)] hover:bg-[var(--editor-bg)] disabled:opacity-45"
                    >
                      <Check className="h-[13px] w-[13px]" />
                      Select
                    </button>
                    <button
                      type="button"
                      onClick={() => beginEdit(member)}
                      disabled={directionLocked}
                      title={directionLocked ? directionLockReason : undefined}
                      className="inline-flex h-[31px] items-center gap-[6px] rounded-[6px] border border-[var(--editor-line)] px-[9px] text-[12px] font-[800] text-[var(--editor-text)] hover:bg-[var(--editor-bg)] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Edit3 className="h-[13px] w-[13px]" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => regenerateCastImage(member.id)}
                      disabled={castBusy || processing || directionLocked}
                      title={directionLocked ? directionLockReason : undefined}
                      className="inline-flex h-[31px] items-center gap-[6px] rounded-[6px] border border-[var(--editor-line)] px-[9px] text-[12px] font-[800] text-[var(--editor-text)] hover:bg-[var(--editor-bg)] disabled:opacity-45"
                    >
                      <RefreshCcw className="h-[13px] w-[13px]" />
                      Regenerate
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteCastMember(member.id)}
                      disabled={directionLocked}
                      title={directionLocked ? directionLockReason : undefined}
                      className="inline-flex h-[31px] items-center justify-center rounded-[6px] border border-[var(--editor-danger)] px-[9px] text-[var(--editor-danger)] hover:bg-[var(--editor-danger-soft)] disabled:cursor-not-allowed disabled:opacity-45"
                      aria-label={`Delete ${member.name}`}
                    >
                      <Trash2 className="h-[13px] w-[13px]" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
