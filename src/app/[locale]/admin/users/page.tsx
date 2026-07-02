"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Shield, Coins, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTable, type Column } from "@/components/data-table";

interface User {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: string;
  emailVerified: boolean;
  utmSource: string;
  ip: string;
  locale: string;
  credits: number;
  roles: UserRoleInfo[];
}

interface RoleInfo {
  id: string;
  name: string;
  title: string;
}

interface UserRoleInfo {
  roleId: string;
  roleName: string;
  roleTitle: string;
}

interface SourceStat {
  utmSource: string;
  userCount: number;
}

const PAGE_SIZE = 10;
const DIRECT_SOURCE_VALUE = "direct";

export default function UsersPage() {
  const t = useTranslations("admin");
  const [users, setUsers] = useState<User[]>([]);
  const [sourceStats, setSourceStats] = useState<SourceStat[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");

  // Role management dialog
  const [managingUser, setManagingUser] = useState<User | null>(null);
  const [allRoles, setAllRoles] = useState<RoleInfo[]>([]);
  const [userRoleIds, setUserRoleIds] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<string | null>(null);

  // Credits dialog
  const [creditsUser, setCreditsUser] = useState<User | null>(null);
  const [creditsAction, setCreditsAction] = useState<"grant" | "deduct">("grant");
  const [creditsAmount, setCreditsAmount] = useState("");
  const [creditsDesc, setCreditsDesc] = useState("");
  const [creditsSubmitting, setCreditsSubmitting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sourceFilter]);

  const fetchUsers = useCallback(async (p: number) => {
    const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (sourceFilter) params.set("utmSource", sourceFilter);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users?${params}`, {
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.code !== 0) throw new Error(data.message || t("users.load_failed"));

      setUsers(data.data.items);
      setTotal(data.data.total);
    } catch (err: any) {
      setUsers([]);
      setTotal(0);
      setError(
        err.name === "AbortError"
          ? t("users.request_timeout")
          : err.message || t("users.load_failed")
      );
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, [debouncedSearch, sourceFilter, t]);

  const fetchSourceStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users?sourceStatsOnly=1");
      const data = await res.json();
      if (data.code === 0) {
        setSourceStats(normalizeSourceStats(data.data.sourceStats || []));
      }
    } catch {
      setSourceStats([]);
    }
  }, []);

  useEffect(() => {
    fetchUsers(page);
  }, [page, fetchUsers]);

  useEffect(() => {
    fetchSourceStats();
  }, [fetchSourceStats]);

  async function openRoleDialog(u: User) {
    setManagingUser(u);
    const [rolesRes, userRolesRes] = await Promise.all([
      fetch("/api/admin/roles?page=1&pageSize=999").then((r) => r.json()),
      fetch(`/api/admin/roles?userId=${u.id}`).then((r) => r.json()),
    ]);
    if (rolesRes.code === 0) {
      setAllRoles(rolesRes.data.items);
    }
    if (userRolesRes.code === 0) {
      setUserRoleIds(new Set(userRolesRes.data.map((r: UserRoleInfo) => r.roleId)));
    }
  }

  function openCreditsDialog(u: User) {
    setCreditsUser(u);
    setCreditsAction("grant");
    setCreditsAmount("");
    setCreditsDesc("");
  }

  async function submitCredits() {
    if (!creditsUser) return;
    const amount = Number(creditsAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("users.credits_invalid_amount"));
      return;
    }

    setCreditsSubmitting(true);
    try {
      const res = await fetch("/api/admin/users/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: creditsUser.id,
          action: creditsAction,
          credits: amount,
          description: creditsDesc || undefined,
        }),
      });
      const data = await res.json();
      if (data.code === 0) {
        toast.success(
          creditsAction === "grant"
            ? t("users.credits_granted")
            : t("users.credits_deducted")
        );
        setUsers((prev) =>
          prev.map((u) =>
            u.id === creditsUser.id ? { ...u, credits: data.data.balance } : u
          )
        );
        setCreditsUser(null);
      } else {
        toast.error(data.message || "Failed");
      }
    } catch {
      toast.error("Failed");
    } finally {
      setCreditsSubmitting(false);
    }
  }

  async function toggleRole(roleId: string) {
    if (!managingUser || toggling) return;
    setToggling(roleId);
    const hasRole = userRoleIds.has(roleId);

    try {
      if (hasRole) {
        const res = await fetch(
          `/api/admin/roles/assign?userId=${managingUser.id}&roleId=${roleId}`,
          { method: "DELETE" }
        );
        const data = await res.json();
        if (data.code === 0) {
          setUserRoleIds((prev) => {
            const next = new Set(prev);
            next.delete(roleId);
            return next;
          });
          toast.success(t("users.role_removed"));
        } else {
          toast.error(data.message);
        }
      } else {
        const res = await fetch("/api/admin/roles/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: managingUser.id, roleId }),
        });
        const data = await res.json();
        if (data.code === 0) {
          setUserRoleIds((prev) => new Set(prev).add(roleId));
          toast.success(t("users.role_assigned"));
        } else {
          toast.error(data.message);
        }
      }
    } catch {
      toast.error("Failed");
    } finally {
      setToggling(null);
    }
  }

  function normalizeSourceStats(stats: SourceStat[]) {
    const directCount = stats
      .filter((s) => !s.utmSource || s.utmSource === "Direct")
      .reduce((sum, s) => sum + s.userCount, 0);
    const directStat = directCount
      ? [{ utmSource: "", userCount: directCount }]
      : [];

    return [
      ...directStat,
      ...stats.filter((s) => s.utmSource && s.utmSource !== "Direct"),
    ];
  }

  function formatSourceLabel(source: string) {
    return !source || source === "Direct"
      ? t("users.source_direct")
      : source;
  }

  const topSourceStats = sourceStats.slice(0, 5);
  const sourceFilterOptions = sourceStats.map((stat) => ({
    value: stat.utmSource ? stat.utmSource : DIRECT_SOURCE_VALUE,
    label: `${formatSourceLabel(stat.utmSource)} (${stat.userCount})`,
  }));

  const sourceToolbar = (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t("users.source_filter_label")}</span>
      <select
        value={sourceFilter}
        onChange={(event) => setSourceFilter(event.target.value)}
        className="h-9 min-w-44 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <option value="">{t("users.source_filter_all")}</option>
        {sourceFilterOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  const columns: Column<User>[] = [
    {
      header: t("users.user_col"),
      cell: (u) => (
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            <AvatarImage src={u.image || undefined} />
            <AvatarFallback className="text-xs">
              {(u.name || u.email).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">{u.name || "—"}</span>
        </div>
      ),
    },
    {
      header: t("users.email_col"),
      cell: (u) => (
        <div className="space-y-1">
          <div>{u.email}</div>
          <Badge variant="outline" className="text-xs">
            {u.emailVerified ? t("users.email_verified_yes") : t("users.email_verified_no")}
          </Badge>
        </div>
      ),
    },
    {
      header: t("users.roles_col"),
      cell: (u) => (
        <div className="flex max-w-40 flex-wrap gap-1">
          {u.roles.length > 0 ? (
            u.roles.map((role) => (
              <Badge key={role.roleId} variant="outline" className="text-xs">
                {role.roleTitle || role.roleName}
              </Badge>
            ))
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
      ),
    },
    {
      header: t("users.credits_col"),
      className: "w-[120px]",
      cell: (u) => (
        <span className="font-medium tabular-nums">{u.credits.toLocaleString()}</span>
      ),
    },
    {
      header: t("users.source_col"),
      cell: (u) => (
        <span className="block max-w-44 truncate text-muted-foreground">
          {formatSourceLabel(u.utmSource)}
        </span>
      ),
    },
    {
      header: t("users.locale_col"),
      className: "w-[90px]",
      cell: (u) => u.locale || "-",
    },
    {
      header: t("users.ip_col"),
      cell: (u) => (
        <span className="block max-w-32 truncate font-mono text-xs text-muted-foreground">
          {u.ip || "-"}
        </span>
      ),
    },
    {
      header: t("users.joined_col"),
      cell: (u) => (
        <span className="text-muted-foreground">
          {new Date(u.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: t("users.actions_col"),
      className: "w-[80px]",
      cell: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" className="size-7">
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openCreditsDialog(u)}>
              <Coins className="size-4" />
              {t("users.manage_credits_title")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openRoleDialog(u)}>
              <Shield className="size-4" />
              {t("users.manage_roles_title")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("users.title")}</h1>
        <p className="text-muted-foreground">{t("users.description")}</p>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {topSourceStats.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <p className="mb-3 text-sm font-medium text-muted-foreground">
            {t("users.source_stats_title")}
          </p>
          <div className="flex flex-wrap gap-2">
            {topSourceStats.map((stat) => (
              <div
                key={stat.utmSource || DIRECT_SOURCE_VALUE}
                className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-sm"
              >
                <span className="font-medium">{formatSourceLabel(stat.utmSource)}</span>
                <span className="text-muted-foreground">{stat.userCount}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Card>
        <CardContent>
          <DataTable
            columns={columns}
            data={users}
            total={total}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            rowKey={(u) => u.id}
            emptyText={loading ? t("loading") : t("users.no_users")}
            search={search}
            onSearchChange={setSearch}
            toolbar={sourceToolbar}
            onRefresh={() => fetchUsers(page)}
          />
        </CardContent>
      </Card>

      {/* Role Management Dialog */}
      <Dialog open={!!managingUser} onOpenChange={(v) => !v && setManagingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("users.manage_roles_title")}</DialogTitle>
            <DialogDescription>{t("users.manage_roles_description")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto space-y-3 py-4">
            {allRoles.map((r) => (
              <label key={r.id} className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={userRoleIds.has(r.id)}
                  onCheckedChange={() => toggleRole(r.id)}
                  disabled={toggling === r.id}
                />
                <div>
                  <div className="text-sm font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground font-mono">{r.name}</div>
                </div>
              </label>
            ))}
            {allRoles.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">{t("roles.no_roles")}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManagingUser(null)}>{t("roles.cancel")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credits Management Dialog */}
      <Dialog open={!!creditsUser} onOpenChange={(v) => !v && setCreditsUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("users.manage_credits_title")}</DialogTitle>
            <DialogDescription>
              {creditsUser
                ? t("users.manage_credits_for", {
                    name: creditsUser.name || creditsUser.email,
                    balance: creditsUser.credits.toLocaleString(),
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCreditsAction("grant")}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  creditsAction === "grant"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:bg-muted"
                }`}
              >
                {t("users.credits_action_grant")}
              </button>
              <button
                type="button"
                onClick={() => setCreditsAction("deduct")}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  creditsAction === "deduct"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:bg-muted"
                }`}
              >
                {t("users.credits_action_deduct")}
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("users.credits_amount_label")}</label>
              <Input
                type="number"
                min="1"
                value={creditsAmount}
                onChange={(e) => setCreditsAmount(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("users.credits_desc_label")}</label>
              <Input
                value={creditsDesc}
                onChange={(e) => setCreditsDesc(e.target.value)}
                placeholder={t("users.credits_desc_placeholder")}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditsUser(null)}>
              {t("roles.cancel")}
            </Button>
            <Button onClick={submitCredits} disabled={creditsSubmitting}>
              {creditsSubmitting
                ? t("users.credits_submitting")
                : t("users.credits_submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
