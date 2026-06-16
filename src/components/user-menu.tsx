"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/core/i18n/navigation";
import {
  LogOutIcon,
  EllipsisVerticalIcon,
  LanguagesIcon,
  CheckIcon,
  UserIcon,
} from "lucide-react";
import { signOut } from "@/core/auth/client";
import { localeNames, locales } from "@/config/locale";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function UserMenu({
  name,
  email,
  image,
  profileHref,
}: {
  name: string;
  email: string;
  image?: string | null;
  profileHref?: string;
}) {
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const { isMobile } = useSidebar();

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  function handleLocaleSwitch(newLocale: string) {
    router.replace(pathname, { locale: newLocale });
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger className="w-full rounded-lg outline-none ring-sidebar-ring focus-visible:ring-2 [&>div]:w-full">
            <SidebarMenuButton size="lg" render={<div />} className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
            <Avatar className="size-8 rounded-lg">
              <AvatarImage src={image || undefined} alt={name} />
              <AvatarFallback className="rounded-lg text-xs">
                {name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{name}</span>
              <span className="truncate text-xs text-foreground/70">{email}</span>
            </div>
            <EllipsisVerticalIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-8">
                    <AvatarImage src={image || undefined} alt={name} />
                    <AvatarFallback className="rounded-lg text-xs">
                      {name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">{email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {profileHref && (
              <DropdownMenuItem
                onClick={() => {
                  window.open(`/${locale}${profileHref}`, "_blank");
                }}
              >
                <UserIcon className="size-4" />
                {t("nav.profile")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2 px-2 py-2">
                <LanguagesIcon className="size-4" />
                <span className="flex-1">{localeNames[locale] || locale}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {locales.map((loc) => (
                  <DropdownMenuItem
                    key={loc}
                    onClick={() => handleLocaleSwitch(loc)}
                  >
                    <span className="flex-1">{localeNames[loc] || loc}</span>
                    {loc === locale && <CheckIcon className="size-3.5" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOutIcon className="size-4" />
              {t("sign.sign_out_title")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
