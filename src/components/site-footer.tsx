import { Link } from "@/core/i18n/navigation";
import type { ComponentType, SVGProps } from "react";
import { BrandLogo } from "@/components/brand-logo";
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
    <footer className="bg-brand-panel text-brand-ink">
      <div className="mx-auto max-w-[1320px] px-6 pb-10 pt-14 sm:px-10 sm:pt-16 lg:px-16">
        {tagline && (
          <p className="mb-10 text-center text-xl font-bold leading-[25px] text-brand-ink lg:text-4xl lg:leading-10">
            {tagline}
          </p>
        )}

        <div className="mx-auto mb-12 h-px w-32 bg-brand-line" />

        {columns && columns.length > 0 && (
          <div
            className={cn(
              "grid gap-x-8 gap-y-10 sm:gap-x-12",
              columns.length <= 3
                ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.3fr_repeat(3,minmax(0,1fr))]"
                : columns.length === 4
                  ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-[1.25fr_repeat(4,minmax(0,1fr))]"
                  : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-[1.15fr_repeat(5,minmax(0,1fr))]"
            )}
          >
            <div className="col-span-full space-y-6 lg:col-span-1">
              <BrandLogo variant="footer" showName />
              <p className="text-base font-semibold leading-6">Follow us on</p>
              <div className="flex gap-2">
                {socials?.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    aria-label={s.label}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex size-9 items-center justify-center rounded-md bg-brand-ink text-brand-panel"
                  >
                    <s.icon className="size-[17px]" />
                  </a>
                ))}
              </div>
              <p className="text-sm font-semibold text-brand-muted">
                {copyright || `All rights reserved © ${year}`}
              </p>
            </div>
            {columns.map((col) => (
              <div key={col.title} className="space-y-5">
                <h4 className="text-sm font-semibold uppercase text-brand-ink">
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
                          className="text-base leading-6 text-brand-ink transition-colors hover:text-brand-accent"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-base leading-6 text-brand-ink transition-colors hover:text-brand-accent"
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
