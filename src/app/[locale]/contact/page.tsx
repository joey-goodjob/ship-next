import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { Footer } from "@/blocks/footer";
import { Header } from "@/blocks/header";
import { DiscordIcon } from "@/components/discord-icon";
import { setRequestLocale } from "next-intl/server";
import { buildPublicMetadata } from "@/lib/site-metadata";

type PageParams = {
  params: Promise<{ locale: string }>;
};

type ContactContent = {
  title: string;
  description: string;
  supportLabel: string;
  emailButton: string;
  discordLabel: string;
  discordText: string;
  discordButton: string;
  metadataTitle: string;
  metadataDescription: string;
};

const SUPPORT_EMAIL = "hello@lyricvideomaker.app";
const DISCORD_URL = "https://discord.gg/2YmWtNx3z7";

const content: Record<"en" | "zh", ContactContent> = {
  en: {
    title: "Get in Touch with LyricVideoMaker",
    description:
      "If you're interested in learning more about LyricVideoMaker, write to us. For support or billing-related questions, contact Support.",
    supportLabel: "Support",
    emailButton: "Send Email",
    discordLabel: "Need Help?",
    discordText: "Join our Discord server for support and quick answers.",
    discordButton: "Join Discord",
    metadataTitle: "Contact LyricVideoMaker",
    metadataDescription:
      "Contact LyricVideoMaker support by email or join the Discord server for help with lyric video creation, billing, and product questions.",
  },
  zh: {
    title: "联系 LyricVideoMaker",
    description:
      "如果你想了解 LyricVideoMaker，或者有支持、账单相关问题，可以通过邮箱联系我们，也可以加入 Discord 获取快速帮助。",
    supportLabel: "支持",
    emailButton: "发送邮件",
    discordLabel: "需要帮助？",
    discordText: "加入我们的 Discord 服务器，获取支持和快速解答。",
    discordButton: "加入 Discord",
    metadataTitle: "联系 LyricVideoMaker",
    metadataDescription:
      "通过邮箱联系 LyricVideoMaker 支持，或加入 Discord 获取歌词视频制作、账单和产品问题的帮助。",
  },
};

function normalizeLocale(locale: string): "en" | "zh" {
  return locale === "zh" ? "zh" : "en";
}

function localizedPath(locale: string) {
  return normalizeLocale(locale) === "zh" ? "/zh/contact" : "/contact";
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
      en: "/contact",
      zh: "/zh/contact",
      xDefaultPath: "/contact",
    },
  });
}

export default async function ContactPage({ params }: PageParams) {
  const { locale } = await params;
  setRequestLocale(locale);
  const page = content[normalizeLocale(locale)];

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <main className="px-6 py-8 sm:py-8">
        <div className="mx-auto flex w-full max-w-[900px] flex-col items-center">
          <div className="text-center">
            <h1 className="text-[40px] font-extrabold leading-[1.08] tracking-normal text-white sm:text-[46px] lg:whitespace-nowrap lg:text-[48px]">
              {page.title}
            </h1>
            <p className="mx-auto mt-4 max-w-[640px] text-[18px] leading-7 tracking-normal text-zinc-400">
              {page.description}
            </p>
          </div>

          <div className="mt-16 flex w-full max-w-[672px] flex-col gap-8">
            <section className="rounded-[14px] border border-white/35 bg-black px-10 py-10 sm:px-12">
              <div className="flex items-start gap-5">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-[12px] border border-white/30 bg-white/8 text-white">
                  <Mail className="size-7" />
                </div>
                <div className="min-w-0 pt-1">
                  <p className="text-sm font-medium tracking-normal text-zinc-500">
                    {page.supportLabel}
                  </p>
                  <p className="mt-3 break-words text-[20px] font-bold leading-7 tracking-normal text-white">
                    {SUPPORT_EMAIL}
                  </p>
                </div>
              </div>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="mt-8 flex h-[52px] w-full items-center justify-center rounded-[10px] bg-brand-accent px-4 text-base font-bold tracking-normal text-brand-accent-ink transition-colors [@media(hover:hover)]:hover:bg-brand-accent-hover"
              >
                {page.emailButton}
              </a>
            </section>

            <section className="rounded-[14px] border border-white/20 bg-black px-10 py-10 sm:px-12">
              <div className="flex items-start gap-5">
                <div className="flex size-14 shrink-0 items-center justify-center rounded-[12px] border border-white/30 bg-white/8 text-white">
                  <DiscordIcon className="size-7" />
                </div>
                <div className="min-w-0 pt-1">
                  <p className="text-sm font-medium tracking-normal text-zinc-500">
                    {page.discordLabel}
                  </p>
                  <p className="mt-3 text-base leading-7 tracking-normal text-zinc-200">
                    {page.discordText}
                  </p>
                </div>
              </div>
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 flex h-[52px] w-full items-center justify-center rounded-[10px] bg-brand-accent px-4 text-base font-bold tracking-normal text-brand-accent-ink transition-colors [@media(hover:hover)]:hover:bg-brand-accent-hover"
              >
                {page.discordButton}
              </a>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
