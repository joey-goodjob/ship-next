import type { Metadata } from "next";
import Script from "next/script";
import { Suspense } from "react";
import { getLocale } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { envConfigs } from "@/config";
import { BugEventReporter } from "@/components/bug-event-reporter";
import { SiteTrafficTracker } from "@/components/site-traffic-tracker";
import { UtmCapture } from "@/components/utm-capture";
import { buildAnalyticsConfig } from "@/lib/analytics-config";
import { buildPublicMetadata } from "@/lib/site-metadata";
import { getAllConfigs } from "@/modules/config/service";
import "./globals.css";

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
  const analyticsConfig = buildAnalyticsConfig(configs);

  return (
    <html lang={locale} className="dark" suppressHydrationWarning>
      <body className="font-sans antialiased">
        {analyticsConfig.googleAnalyticsId && (
          <>
            <Script
              id="google-analytics-loader"
              src={`https://www.googletagmanager.com/gtag/js?id=${analyticsConfig.googleAnalyticsId}`}
              strategy="afterInteractive"
              async
            />
            <Script
              id="google-analytics"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${analyticsConfig.googleAnalyticsId}');
                `,
              }}
            />
          </>
        )}
        {analyticsConfig.clarityId && (
          <Script
            id="clarity-script"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                (function(c,l,a,r,i,t,y){
                  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
                })(window, document, "clarity", "script", "${analyticsConfig.clarityId}");
              `,
            }}
          />
        )}
        {analyticsConfig.plausible && (
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
              data-domain={analyticsConfig.plausible.domain}
              src={analyticsConfig.plausible.src}
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
          <Suspense fallback={null}>
            <BugEventReporter />
            <UtmCapture />
            <SiteTrafficTracker />
          </Suspense>
          {children}
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
