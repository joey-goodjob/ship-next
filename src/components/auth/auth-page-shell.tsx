import type { ReactNode } from "react";
import { CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "@/core/i18n/navigation";
import { envConfigs } from "@/config";

type TrustLink = {
  label: string;
  href: string;
};

type AuthPageShellProps = {
  children: ReactNode;
  eyebrow: string;
  headline: string;
  description: string;
  points: string[];
  legalText: string;
  trustLinks: TrustLink[];
};

export function AuthPageShell({
  children,
  eyebrow,
  headline,
  description,
  points,
  legalText,
  trustLinks,
}: AuthPageShellProps) {
  return (
    <main className="min-h-svh bg-brand-panel px-5 py-8 text-brand-ink sm:px-8 lg:px-10">
      <div className="mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-[1080px] items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="order-2 rounded-[18px] border border-brand-line bg-background p-6 shadow-sm sm:p-8 lg:order-1">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-[10px] bg-brand-accent text-brand-accent-ink">
              <Sparkles className="size-5" />
            </span>
            <span className="text-xl font-extrabold tracking-normal">
              {envConfigs.app_name}
            </span>
          </Link>

          <div className="mt-10 max-w-[560px]">
            <p className="text-sm font-bold uppercase tracking-normal text-brand-accent">
              {eyebrow}
            </p>
            <h1 className="mt-4 text-[34px] font-extrabold leading-[1.08] tracking-normal text-brand-ink sm:text-[44px]">
              {headline}
            </h1>
            <p className="mt-5 text-base font-medium leading-7 tracking-normal text-brand-muted sm:text-lg">
              {description}
            </p>
          </div>

          <ul className="mt-8 grid gap-4">
            {points.map((point) => (
              <li key={point} className="flex gap-3 text-sm font-semibold leading-6 text-brand-ink">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-accent" />
                <span>{point}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 rounded-[12px] border border-brand-line bg-brand-panel p-4">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-accent" />
              <p className="text-sm font-medium leading-6 text-brand-muted">
                {legalText}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
              {trustLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-bold text-brand-ink underline underline-offset-4 hover:text-brand-accent"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="order-1 lg:order-2">
          <div className="mx-auto w-full max-w-[420px]">{children}</div>
        </section>
      </div>
    </main>
  );
}
