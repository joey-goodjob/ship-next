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
  backgroundImageSrc,
}: {
  tagline?: string;
  columns?: FooterColumn[];
  socials?: FooterSocial[];
  copyright?: string;
  backgroundImageSrc?: string;
}) {
  const year = new Date().getFullYear();
  const hasBackgroundImage = Boolean(backgroundImageSrc);
  const textClassName = hasBackgroundImage ? "text-white" : "text-brand-ink";
  const mutedTextClassName = hasBackgroundImage
    ? "text-white/72"
    : "text-brand-muted";
  const linkClassName = hasBackgroundImage
    ? "text-white/88 transition-colors hover:text-brand-accent"
    : "text-brand-ink transition-colors hover:text-brand-accent";

  return (
    <footer
      className={cn(
        "relative isolate overflow-hidden",
        hasBackgroundImage
          ? "bg-brand-ink text-white"
          : "bg-brand-panel text-brand-ink"
      )}
    >
      {backgroundImageSrc && (
        <>
          <img
            src={backgroundImageSrc}
            alt=""
            aria-hidden={true}
            className="absolute inset-0 z-0 size-full object-cover"
          />
          <div
            className="absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(8,11,18,0.72),rgba(8,11,18,0.9))]"
            aria-hidden={true}
          />
        </>
      )}
      <div className="relative z-10 mx-auto max-w-[1320px] px-6 pb-10 pt-14 sm:px-10 sm:pt-16 lg:px-16">
        {tagline && (
          <p
            className={cn(
              "mb-10 text-center text-xl font-bold leading-[25px] lg:text-4xl lg:leading-10",
              textClassName
            )}
          >
            {tagline}
          </p>
        )}

        <div
          className={cn(
            "mx-auto mb-12 h-px w-32",
            hasBackgroundImage ? "bg-white/24" : "bg-brand-line"
          )}
        />

        {columns && columns.length > 0 && (
          <div
            className={cn(
              "grid gap-x-8 gap-y-10 sm:gap-x-12 lg:grid-cols-[1.3fr_1fr_1fr_1fr]",
              columns.length <= 3
                ? "grid-cols-1 sm:grid-cols-2"
                : columns.length === 4
                  ? "grid-cols-2 sm:grid-cols-4"
                  : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
            )}
          >
            <div className="space-y-6">
              <BrandLogo variant="footer" showName className={textClassName} />
              <p className={cn("text-base font-semibold leading-6", textClassName)}>
                Follow us on
              </p>
              <div className="flex gap-2">
                {socials?.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    aria-label={s.label}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "flex size-9 items-center justify-center rounded-md",
                      hasBackgroundImage
                        ? "bg-white text-brand-ink"
                        : "bg-brand-ink text-brand-panel"
                    )}
                  >
                    <s.icon className="size-[17px]" />
                  </a>
                ))}
              </div>
              <p className={cn("text-sm font-semibold", mutedTextClassName)}>
                {copyright || `All rights reserved © ${year}`}
              </p>
            </div>
            {columns.map((col) => (
              <div key={col.title} className="space-y-5">
                <h4 className={cn("text-sm font-semibold uppercase", textClassName)}>
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
                          className={cn("text-base", linkClassName)}
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className={cn("text-base", linkClassName)}
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
