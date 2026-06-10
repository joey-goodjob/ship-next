import { envConfigs } from "@/config";
import { cn } from "@/lib/utils";

const logoVariants = {
  header: {
    src: "/logo-header.png",
    className: "size-10",
    textClassName: "text-[26px] font-extrabold tracking-[-0.012em]",
  },
  footer: {
    src: "/logo-footer.png",
    className: "size-14",
    textClassName: "text-[34px] font-extrabold tracking-tight",
  },
  sidebar: {
    src: "/logo-sidebar.png",
    className: "size-8",
    textClassName: "text-sm font-extrabold leading-none",
  },
  topbar: {
    src: "/logo-topbar.png",
    className: "size-8",
    textClassName: "text-base font-extrabold leading-none sm:text-lg",
  },
} as const;

export type BrandLogoVariant = keyof typeof logoVariants;

export function BrandLogo({
  variant = "header",
  className,
  textClassName,
  showName = false,
  name = envConfigs.app_name,
  alt = envConfigs.app_name,
}: {
  variant?: BrandLogoVariant;
  className?: string;
  textClassName?: string;
  showName?: boolean;
  name?: string;
  alt?: string;
}) {
  const logo = logoVariants[variant];
  const image = (
    <img
      src={logo.src}
      alt={showName ? "" : alt}
      className={cn("block shrink-0 object-contain", logo.className)}
    />
  );

  if (!showName) {
    return <span className={cn("inline-flex shrink-0 items-center", className)}>{image}</span>;
  }

  return (
    <span className={cn("inline-flex min-w-0 shrink-0 items-center gap-2 text-brand-ink", className)}>
      {image}
      <span className={cn("truncate", logo.textClassName, textClassName)}>
        {name}
      </span>
    </span>
  );
}
