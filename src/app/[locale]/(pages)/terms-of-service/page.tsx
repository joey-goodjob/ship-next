import type { Metadata } from "next";
import { buildPublicMetadata } from "@/lib/site-metadata";

type PageParams = {
  params: Promise<{ locale: string }>;
};

type LegalSection = {
  title: string;
  body: string[];
};

const content = {
  en: {
    title: "Terms of Service",
    updated: "Last updated: 2026-06-18",
    description:
      "Review the LyricVideoMaker terms for accounts, credits, subscriptions, uploads, exports, commercial use, and acceptable use of the AI lyric video service.",
    sections: [
      {
        title: "1. Acceptance of Terms",
        body: [
          "By accessing or using LyricVideoMaker, you agree to these Terms of Service. If you do not agree, do not use the service.",
        ],
      },
      {
        title: "2. Service Description",
        body: [
          "LyricVideoMaker provides tools for creating AI-assisted lyric videos from audio, lyrics, prompts, images, and related project inputs. Features may change as the product evolves.",
        ],
      },
      {
        title: "3. Accounts and Security",
        body: [
          "You are responsible for your account credentials and for activity under your account. Notify us if you believe your account has been accessed without authorization.",
        ],
      },
      {
        title: "4. Credits, Plans, and Billing",
        body: [
          "Paid plans and credit packs are billed as shown at checkout. Credits, subscriptions, renewals, and refunds are governed by the plan terms presented when you purchase.",
        ],
      },
      {
        title: "5. Your Content and Rights",
        body: [
          "You are responsible for the audio, lyrics, images, prompts, and other materials you upload. You must have the rights needed to create and publish exported videos.",
          "Subject to these terms, your exported lyric videos are yours to use, including for commercial releases, when you have the necessary rights to the underlying content.",
        ],
      },
      {
        title: "6. Acceptable Use",
        body: [
          "You may not use the service to violate laws, infringe third-party rights, upload malicious content, attempt unauthorized access, or abuse generation, storage, payment, or account systems.",
        ],
      },
      {
        title: "7. Service Availability",
        body: [
          "We aim to keep the service reliable, but AI generation, storage, payment, and third-party provider availability can vary. We may modify, suspend, or discontinue features when needed.",
        ],
      },
      {
        title: "8. Limitation of Liability",
        body: [
          "To the fullest extent permitted by law, LyricVideoMaker is not liable for indirect, incidental, consequential, special, or punitive damages resulting from use of the service.",
        ],
      },
      {
        title: "9. Changes and Contact",
        body: [
          "We may update these terms from time to time. If you have questions, contact us through the support or contact options provided on LyricVideoMaker.",
        ],
      },
    ],
  },
  zh: {
    title: "服务条款",
    updated: "最后更新：2026-06-18",
    description:
      "查看 LyricVideoMaker 关于账号、积分、订阅、上传、导出、商业使用和 AI 歌词视频服务可接受使用的条款。",
    sections: [
      {
        title: "1. 接受条款",
        body: [
          "访问或使用 LyricVideoMaker 即表示你同意本服务条款。如果你不同意，请不要使用本服务。",
        ],
      },
      {
        title: "2. 服务说明",
        body: [
          "LyricVideoMaker 提供基于音频、歌词、提示词、图片和相关项目输入制作 AI 辅助歌词视频的工具。随着产品迭代，功能可能会调整。",
        ],
      },
      {
        title: "3. 账号与安全",
        body: [
          "你需要对自己的账号凭证以及账号下发生的活动负责。如果你认为账号被未经授权访问，请及时通知我们。",
        ],
      },
      {
        title: "4. 积分、方案与付款",
        body: [
          "付费方案和积分包按照结账页面展示的内容计费。积分、订阅、续费和退款以购买时展示的方案条款为准。",
        ],
      },
      {
        title: "5. 你的内容与权利",
        body: [
          "你需要对上传的音频、歌词、图片、提示词和其他素材负责，并确保拥有创建和发布导出视频所需的权利。",
          "在遵守本条款的前提下，导出的歌词视频归你使用；如果你拥有底层音乐和素材的必要权利，也可以用于商业发布。",
        ],
      },
      {
        title: "6. 可接受使用",
        body: [
          "你不得使用本服务违法、侵犯第三方权利、上传恶意内容、尝试未经授权访问，或滥用生成、存储、支付和账号系统。",
        ],
      },
      {
        title: "7. 服务可用性",
        body: [
          "我们会努力保持服务稳定，但 AI 生成、存储、支付和第三方服务的可用性可能会变化。必要时，我们可能修改、暂停或停止部分功能。",
        ],
      },
      {
        title: "8. 责任限制",
        body: [
          "在法律允许的最大范围内，LyricVideoMaker 不对因使用本服务产生的间接、附带、后果性、特殊或惩罚性损害承担责任。",
        ],
      },
      {
        title: "9. 条款变更与联系",
        body: [
          "我们可能不时更新本条款。如果你有疑问，请通过 LyricVideoMaker 网站提供的支持或联系入口与我们联系。",
        ],
      },
    ],
  },
} as const;

function normalizeLocale(locale: string): keyof typeof content {
  return locale === "zh" ? "zh" : "en";
}

function localizedPath(locale: string) {
  return normalizeLocale(locale) === "zh" ? "/zh/terms-of-service" : "/terms-of-service";
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const page = content[normalizeLocale(locale)];
  const path = localizedPath(locale);
  const title = `${page.title} | LyricVideoMaker`;

  return buildPublicMetadata({
    title,
    description: page.description,
    path,
    alternates: {
      en: "/terms-of-service",
      zh: "/zh/terms-of-service",
      xDefaultPath: "/terms-of-service",
    },
  });
}

export default async function TermsOfServicePage({ params }: PageParams) {
  const { locale } = await params;
  const page = content[normalizeLocale(locale)];

  return (
    <>
      <h1>{page.title}</h1>
      <p>
        <em>{page.updated}</em>
      </p>
      {page.sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
    </>
  );
}
