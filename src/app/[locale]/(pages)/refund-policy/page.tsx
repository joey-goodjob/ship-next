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
    title: "Refund Policy",
    updated: "Last updated: 2026-06-29",
    description:
      "Read LyricVideoMaker refund rules for AI generation credits, subscriptions, failed generation jobs, duplicate payments, and billing support.",
    sections: [
      {
        title: "1. Overview",
        body: [
          "This Refund Policy explains how LyricVideoMaker handles refunds for credit packs, subscriptions, and AI lyric video generation. It should be read together with our Terms of Service and the checkout terms shown when you purchase.",
        ],
      },
      {
        title: "2. AI Generation Credits",
        body: [
          "AI generation uses third-party compute and media processing resources. Credits that have already been consumed by a completed generation are generally not refundable, unless required by law or unless we determine that a platform-side error caused the issue.",
          "If a generation fails because of a service error and no usable result is provided, we may restore the affected credits or provide another reasonable remedy.",
        ],
      },
      {
        title: "3. Subscriptions and Credit Packs",
        body: [
          "Subscription and credit-pack purchases are billed as displayed at checkout. Renewal cancellation stops future billing, but it does not automatically refund prior charges.",
          "If you believe you were charged in error, paid twice, or purchased the wrong plan by mistake, contact us as soon as possible so we can review the transaction.",
        ],
      },
      {
        title: "4. Watermarked and Watermark-Free Exports",
        body: [
          "Free exports include a watermark. Paid credits may be used for watermark-free exports where available. Refund eligibility depends on the generation and billing status, not on later changes to your release plans or commercial use decisions.",
        ],
      },
      {
        title: "5. How to Request Help",
        body: [
          "For billing or refund questions, contact us through the contact page and include the email address on your account, the order date, and a short description of the issue.",
        ],
      },
    ],
  },
  zh: {
    title: "退款政策",
    updated: "最后更新：2026-06-29",
    description:
      "了解 LyricVideoMaker 关于 AI 生成积分、订阅、生成失败、重复付款和账单支持的退款规则。",
    sections: [
      {
        title: "1. 概述",
        body: [
          "本退款政策说明 LyricVideoMaker 如何处理积分包、订阅和 AI 歌词视频生成相关退款。本政策应与服务条款以及购买时结账页面展示的条款一起阅读。",
        ],
      },
      {
        title: "2. AI 生成积分",
        body: [
          "AI 生成会消耗第三方算力和媒体处理资源。已经用于完成生成的积分通常不可退款，除非法律另有要求，或我们确认问题由平台侧错误导致。",
          "如果生成因服务错误失败，并且没有提供可用结果，我们可能会恢复受影响的积分，或提供其他合理处理方式。",
        ],
      },
      {
        title: "3. 订阅和积分包",
        body: [
          "订阅和积分包按结账页面展示的内容计费。取消续订会停止未来扣费，但不会自动退还此前已经产生的费用。",
          "如果你认为自己被误扣费、重复付款，或误买了错误方案，请尽快联系我们，我们会协助核查交易。",
        ],
      },
      {
        title: "4. 带水印和无水印导出",
        body: [
          "免费导出包含水印。可用时，付费积分可用于无水印导出。退款资格取决于生成和账单状态，不取决于之后的发布计划或商用决策变化。",
        ],
      },
      {
        title: "5. 如何请求帮助",
        body: [
          "如有账单或退款问题，请通过联系页面联系我们，并提供账号邮箱、订单日期和问题简述。",
        ],
      },
    ],
  },
} as const;

function normalizeLocale(locale: string): keyof typeof content {
  return locale === "zh" ? "zh" : "en";
}

function localizedPath(locale: string) {
  return normalizeLocale(locale) === "zh" ? "/zh/refund-policy" : "/refund-policy";
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const page = content[normalizeLocale(locale)];

  return buildPublicMetadata({
    title: `${page.title} | LyricVideoMaker`,
    description: page.description,
    path: localizedPath(locale),
    alternates: {
      en: "/refund-policy",
      zh: "/zh/refund-policy",
      xDefaultPath: "/refund-policy",
    },
  });
}

export default async function RefundPolicyPage({ params }: PageParams) {
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
