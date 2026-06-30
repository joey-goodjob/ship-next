import type { ReactNode } from "react";
import { Link } from "@/core/i18n/navigation";
import { envConfigs } from "@/config";

type TrustLink = {
  label: string;
  href: string;
};

type AuthPageShellProps = {
  children: ReactNode;
  trustLinks: TrustLink[];
};

export function AuthPageShell({
  children,
  trustLinks,
}: AuthPageShellProps) {
  return (
    <main className="min-h-svh bg-[#050505] px-4 py-7 text-white sm:px-8 lg:px-12">
      <div className="mx-auto flex min-h-[calc(100svh-3.5rem)] w-full max-w-[540px] flex-col justify-center">
        <Link href="/" className="inline-flex w-fit">
          <span className="inline-flex min-w-0 items-center gap-4 text-white">
            <img
              src="/logo-header.png"
              alt=""
              className="size-12 shrink-0 object-contain sm:size-14"
            />
            <span className="truncate text-[27px] font-extrabold tracking-normal sm:text-[30px]">
              {envConfigs.app_name}
            </span>
          </span>
        </Link>

        <div className="mt-9">{children}</div>

        <div className="mt-6 flex flex-wrap items-center gap-x-7 gap-y-3 text-sm font-bold text-white/65">
          {trustLinks.slice(0, 3).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="underline underline-offset-4 hover:text-brand-accent"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
