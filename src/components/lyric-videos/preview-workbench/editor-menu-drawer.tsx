"use client";

import { useState } from "react";
import { Copy, CreditCard, HelpCircle, Home, LogOut, PlusCircle, Receipt, Trash2, UserCircle, Video } from "lucide-react";
import { toast } from "sonner";
import { signOut } from "@/core/auth/client";
import { Link, useRouter } from "@/core/i18n/navigation";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type EditorMenuDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  projectTitle?: string;
};

const navigationItems = [
  { href: "/create", label: "Create New", icon: PlusCircle },
  { href: "/creations", label: "My Videos", icon: Video },
  { href: "/settings/credits", label: "Credits", icon: CreditCard },
  { href: "/settings/billing", label: "Billing", icon: Receipt },
  { href: "/settings/profile", label: "Account", icon: UserCircle },
  { href: "/#faq", label: "Help", icon: HelpCircle },
  { href: "/", label: "Home", icon: Home },
];

export function EditorMenuDrawer({ open, onOpenChange, projectId, projectTitle }: EditorMenuDrawerProps) {
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteVideo() {
    if (!projectId || deleting) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/lyric-videos/${projectId}`, { method: "DELETE" });
      const body = await response.json().catch(() => null);

      if (!response.ok || body?.code !== 0) {
        throw new Error(body?.message || "Delete video failed");
      }

      toast.success("Video deleted");
      onOpenChange(false);
      router.push("/creations");
    } catch (error: any) {
      toast.error(error?.message || "Delete video failed");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    onOpenChange(false);
    router.push("/");
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) setConfirmingDelete(false);
  }

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close editor menu"
          className="fixed inset-0 z-[10010] cursor-default bg-black/45"
          onClick={() => handleOpenChange(false)}
        />
      ) : null}
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="z-[10020] w-[320px] max-w-[86vw] gap-0 border-l border-[var(--editor-line)] bg-[var(--editor-panel)] p-0 text-[var(--editor-text)] shadow-[0_0_60px_rgba(0,0,0,0.55)] sm:max-w-[320px]"
        >
          <SheetHeader className="border-b border-[var(--editor-line)] px-[20px] py-[18px]">
            <SheetTitle className="text-[22px] font-[850] tracking-normal text-[var(--editor-text)]">Menu</SheetTitle>
            <SheetDescription className="line-clamp-1 text-[12px] font-[700] text-[var(--editor-muted)]">
              {projectTitle || "Lyric video editor"}
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col">
            <nav className="grid gap-[4px] px-[14px] py-[16px]" aria-label="Editor menu">
              {navigationItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => handleOpenChange(false)}
                    className="flex h-[42px] items-center gap-[12px] rounded-[6px] px-[10px] text-[14px] font-[800] text-[var(--editor-muted)] transition hover:bg-[var(--editor-panel-soft)] hover:text-[var(--editor-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
                  >
                    <Icon className="h-[17px] w-[17px] shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto border-t border-[var(--editor-line)] px-[14px] py-[16px]">
              <div className="mb-[14px]">
                <p className="px-[2px] text-[11px] font-[850] uppercase tracking-[0.08em] text-[var(--editor-subtle)]">Project</p>
                <button
                  type="button"
                  disabled
                  className="mt-[8px] flex h-[40px] w-full cursor-not-allowed items-center justify-between rounded-[6px] border border-[var(--editor-line)] px-[10px] text-[13px] font-[800] text-[var(--editor-muted)] opacity-65"
                >
                  <span className="inline-flex items-center gap-[10px]">
                    <Copy className="h-[15px] w-[15px]" />
                    Duplicate Video
                  </span>
                  <span className="text-[10px] font-[900] uppercase text-[var(--editor-subtle)]">Soon</span>
                </button>
              </div>

              {confirmingDelete ? (
                <div className="rounded-[8px] border border-[var(--editor-danger)] bg-[var(--editor-danger)]/10 p-[12px]">
                  <p className="text-[13px] font-[850] text-[var(--editor-text)]">Delete this video?</p>
                  <p className="mt-[5px] text-[12px] font-[650] leading-5 text-[var(--editor-muted)]">
                    This removes the project and its scenes. This action cannot be undone.
                  </p>
                  <div className="mt-[12px] grid grid-cols-2 gap-[8px]">
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="h-[34px] rounded-[6px] border border-[var(--editor-line)] bg-[var(--editor-panel-soft)] text-[12px] font-[850] text-[var(--editor-text)] hover:bg-[var(--editor-panel-strong)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteVideo}
                      disabled={deleting || !projectId}
                      className="h-[34px] rounded-[6px] border border-[var(--editor-danger)] bg-[var(--editor-danger)] text-[12px] font-[850] text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deleting ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={!projectId}
                  className={cn(
                    "flex h-[40px] w-full items-center justify-center gap-[8px] rounded-[6px] border border-[var(--editor-danger)] text-[13px] font-[850] text-[var(--editor-danger)] transition hover:bg-[var(--editor-danger)]/10",
                    !projectId && "cursor-not-allowed opacity-55",
                  )}
                >
                  <Trash2 className="h-[15px] w-[15px]" />
                  Delete Video
                </button>
              )}

              <button
                type="button"
                onClick={handleSignOut}
                className="mt-[14px] flex h-[40px] w-full items-center justify-center gap-[8px] rounded-[6px] text-[13px] font-[850] text-[var(--editor-muted)] transition hover:bg-[var(--editor-panel-soft)] hover:text-[var(--editor-text)]"
              >
                <LogOut className="h-[15px] w-[15px]" />
                Logout
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
