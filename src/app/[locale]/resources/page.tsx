import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Footer } from "@/blocks/footer";
import { Header } from "@/blocks/header";
import { buildPublicMetadata } from "@/lib/site-metadata";

type PageParams = {
  params: Promise<{ locale: string }>;
};

type ResourcesContent = {
  title: string;
  description: string;
  cardTitle: string;
  cardDescription: string;
  badgeAlt: string;
  uneedBadgeAlt: string;
  metadataTitle: string;
  metadataDescription: string;
};

const DANG_URL = "https://dang.ai";
const DANG_BADGE_URL = "https://assets.dang.ai/badges/dang-verified-dark.png";
const UNEED_URL = "https://www.uneed.best/tool/lyric-video-maker";
const UNEED_BADGE_URL = "https://www.uneed.best/EMBED3.png";

const content: Record<"en" | "zh", ResourcesContent> = {
  en: {
    title: "Resources",
    description:
      "Directory links and trusted places where LyricVideoMaker is listed.",
    cardTitle: "LyricVideoMaker on AI Directories",
    cardDescription: "We are listed on Dang.ai and launching soon on Uneed.",
    badgeAlt: "Verified on DANG!",
    uneedBadgeAlt: "Launching Soon on Uneed",
    metadataTitle: "Resources | LyricVideoMaker",
    metadataDescription:
      "Resources and directory listings for LyricVideoMaker, including the Dang.ai listing badge.",
  },
  zh: {
    title: "Resources",
    description: "这里放 LyricVideoMaker 的资源页面和可信目录收录信息。",
    cardTitle: "LyricVideoMaker on AI Directories",
    cardDescription: "我们已收录在 Dang.ai，并即将在 Uneed 上线。",
    badgeAlt: "Verified on DANG!",
    uneedBadgeAlt: "Launching Soon on Uneed",
    metadataTitle: "Resources | LyricVideoMaker",
    metadataDescription:
      "LyricVideoMaker 的资源页面和目录收录信息，包括 Dang.ai 验证徽章。",
  },
};

function normalizeLocale(locale: string): "en" | "zh" {
  return locale === "zh" ? "zh" : "en";
}

function localizedPath(locale: string) {
  return normalizeLocale(locale) === "zh" ? "/zh/resources" : "/resources";
}

export async function generateMetadata({
  params,
}: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const page = content[normalizeLocale(locale)];

  return buildPublicMetadata({
    title: page.metadataTitle,
    description: page.metadataDescription,
    path: localizedPath(locale),
    alternates: {
      en: "/resources",
      zh: "/zh/resources",
      xDefaultPath: "/resources",
    },
  });
}

export default async function ResourcesPage({ params }: PageParams) {
  const { locale } = await params;
  setRequestLocale(locale);
  const page = content[normalizeLocale(locale)];

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1 px-6 py-16 sm:py-20 lg:py-24">
        <div className="mx-auto flex w-full max-w-[900px] flex-col items-center">
          <div className="max-w-[720px] text-center">
            <h1 className="text-[42px] font-extrabold leading-[1.08] tracking-normal text-brand-ink sm:text-[56px]">
              {page.title}
            </h1>
            <p className="mx-auto mt-5 max-w-[620px] text-base font-medium leading-7 tracking-normal text-brand-muted sm:text-lg">
              {page.description}
            </p>
          </div>

          <section className="mt-12 w-full rounded-[14px] border border-brand-line bg-brand-panel px-6 py-8 shadow-sm sm:px-10 sm:py-10">
            <div className="flex flex-col items-start gap-8 md:flex-row md:items-center md:justify-between">
              <div className="max-w-[460px]">
                <h2 className="text-2xl font-extrabold leading-tight tracking-normal text-brand-ink sm:text-3xl">
                  {page.cardTitle}
                </h2>
                <p className="mt-3 text-base font-medium leading-7 tracking-normal text-brand-muted">
                  {page.cardDescription}
                </p>
              </div>

              <div className="flex w-full flex-col items-start gap-4 sm:w-auto sm:flex-row sm:flex-wrap md:justify-end">
                <a
                  href={DANG_URL}
                  target="_blank"
                  rel="dofollow noopener"
                  className="inline-flex rounded-[10px] outline-none transition-transform focus-visible:ring-2 focus-visible:ring-brand-accent/50 active:scale-[0.98]"
                >
                  <img
                    src={DANG_BADGE_URL}
                    alt={page.badgeAlt}
                    width={260}
                    height={94}
                    className="block h-auto max-w-full border-0"
                  />
                </a>
                <a
                  href={UNEED_URL}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex rounded-[10px] outline-none transition-transform focus-visible:ring-2 focus-visible:ring-brand-accent/50 active:scale-[0.98]"
                >
                  <img
                    src={UNEED_BADGE_URL}
                    alt={page.uneedBadgeAlt}
                    width={250}
                    className="block h-auto max-w-full border-0"
                  />
                </a>
              </div>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
