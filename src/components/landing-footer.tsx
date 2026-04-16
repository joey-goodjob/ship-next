import { Link } from "@/core/i18n/navigation";
import { envConfigs } from "@/config";

export interface FooterColumn {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
}

export function LandingFooter({
  columns,
  copyright,
}: {
  columns?: FooterColumn[];
  copyright?: string;
}) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {columns && columns.length > 0 && (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            {/* Brand */}
            <div className="space-y-3">
              <span className="font-semibold">{envConfigs.app_name}</span>
              <p className="text-sm text-muted-foreground">
                {envConfigs.app_description}
              </p>
            </div>

            {/* Link columns */}
            {columns.map((col) => (
              <div key={col.title} className="space-y-3">
                <h4 className="text-sm font-medium">{col.title}</h4>
                <ul className="space-y-2">
                  {col.links.map((link) => (
                    <li key={link.href}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
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

        <div className="border-t border-border pt-6 text-center text-sm text-muted-foreground">
          {copyright || `© ${year} ${envConfigs.app_name}. All rights reserved.`}
        </div>
      </div>
    </footer>
  );
}
