import { Link } from "@/core/i18n/navigation";
import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";
import { LocaleSelector } from "@/components/locale-selector";

export interface FooterColumn {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
}

export interface FooterSocial {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  href: string;
  label: string;
}

export function SiteFooter({
  tagline,
  columns,
  socials,
  copyright,
}: {
  tagline?: string;
  columns?: FooterColumn[];
  socials?: FooterSocial[];
  copyright?: string;
}) {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-white text-slate-950">
      <div className="mx-auto max-w-[1320px] px-6 pb-10 pt-14 sm:px-10 sm:pt-16 lg:px-16">
        {tagline && (
          <p className="mb-10 text-center font-serif text-3xl italic leading-[1.15] tracking-tight text-slate-950 sm:text-4xl">
            {tagline}
          </p>
        )}

        <div className="mx-auto mb-12 h-px w-32 bg-slate-200" />

        {columns && columns.length > 0 && (
          <div
            className={cn(
              "grid gap-x-8 gap-y-10 sm:gap-x-12 lg:grid-cols-[1.3fr_1fr_1fr_1fr]",
              columns.length <= 3
                ? "grid-cols-2 sm:grid-cols-3"
                : columns.length === 4
                  ? "grid-cols-2 sm:grid-cols-4"
                  : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
            )}
          >
            <div className="space-y-6">
              <span className="text-[34px] font-extrabold tracking-tight">
                Lyric<span className="text-[#fbbf24]">Video AI</span>
              </span>
              <p className="font-black">Follow us on</p>
              <div className="flex gap-2">
                {socials?.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    aria-label={s.label}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex size-9 items-center justify-center rounded-md bg-slate-950 text-white"
                  >
                    <s.icon className="size-[17px]" />
                  </a>
                ))}
              </div>
              <p className="text-sm font-semibold text-slate-500">
                {copyright || `All rights reserved © ${year}`}
              </p>
            </div>
            {columns.map((col) => (
              <div key={col.title} className="space-y-5">
                <h4 className="text-[15px] font-black uppercase tracking-wide text-slate-950">
                  {col.title}
                </h4>
                <ul className="space-y-2">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-base text-slate-950 transition-colors hover:text-[#fbbf24]"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-base text-slate-950 transition-colors hover:text-[#fbbf24]"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <div className="mt-10 flex justify-end">
          <LocaleSelector variant="pill" />
        </div>
      </div>
    </footer>
  );
}
