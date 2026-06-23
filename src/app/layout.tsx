import type { Metadata } from "next";
import Script from "next/script";
import { getLocale } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { envConfigs } from "@/config";
import { buildPublicMetadata } from "@/lib/site-metadata";
import { getAllConfigs } from "@/modules/config/service";
import "./globals.css";

type PlausibleConfig = {
  domain: string;
  src: string;
};

function getPlausibleConfig(configs: Record<string, string>): PlausibleConfig | null {
  const domain = configs.plausible_domain?.trim();
  const src = configs.plausible_src?.trim();

  if (!domain || !src) {
    return null;
  }

  try {
    const url = new URL(src);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    return { domain, src: url.toString() };
  } catch {
    return null;
  }
}

export const metadata: Metadata = {
  ...buildPublicMetadata({
    title: envConfigs.app_name,
    description: envConfigs.app_description,
    path: "/",
    alternates: {
      en: "/",
      zh: "/zh",
      xDefaultPath: "/",
    },
  }),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const configs = await getAllConfigs();
  const plausibleConfig = getPlausibleConfig(configs);

  return (
    <html lang={locale} className="dark" suppressHydrationWarning>
      <body className="font-sans antialiased">
        {plausibleConfig && (
          <>
            <Script
              id="plausible-queue"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html:
                  "window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)}",
              }}
            />
            <Script
              id="plausible-script"
              data-domain={plausibleConfig.domain}
              src={plausibleConfig.src}
              strategy="afterInteractive"
              defer
              async
            />
          </>
        )}
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          forcedTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
