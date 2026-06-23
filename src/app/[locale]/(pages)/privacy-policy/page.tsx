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
    title: "Privacy Policy",
    updated: "Last updated: 2026-06-18",
    description:
      "Read how LyricVideoMaker collects, uses, and protects account, upload, payment, and product usage data for the AI lyric video maker.",
    sections: [
      {
        title: "1. Introduction",
        body: [
          "LyricVideoMaker respects your privacy. This policy explains what information we collect, how we use it, and the choices you have when using our AI lyric video creation service.",
        ],
      },
      {
        title: "2. Information We Collect",
        body: [
          "We collect account information such as your name and email address, product usage data, uploaded media and project metadata, and payment records processed by third-party payment providers.",
        ],
      },
      {
        title: "3. How We Use Information",
        body: [
          "We use information to provide and improve the service, process payments, manage credits and subscriptions, generate and store lyric video projects, prevent abuse, and respond to support requests.",
        ],
      },
      {
        title: "4. Service Providers",
        body: [
          "We may share necessary data with trusted providers for authentication, storage, payments, analytics, email, and AI media processing. These providers may only use the data to support our service.",
        ],
      },
      {
        title: "5. Data Security and Retention",
        body: [
          "We use reasonable technical and organizational measures to protect your information. We keep data only as long as needed for service operation, legal obligations, dispute resolution, or account management.",
        ],
      },
      {
        title: "6. Your Choices",
        body: [
          "You may access, update, or request deletion of your account information by using your account settings or contacting us through the website.",
        ],
      },
      {
        title: "7. Contact",
        body: [
          "If you have questions about this privacy policy, contact us through the support or contact options provided on LyricVideoMaker.",
        ],
      },
    ],
  },
  zh: {
    title: "隐私政策",
    updated: "最后更新：2026-06-18",
    description:
      "了解 LyricVideoMaker 如何收集、使用和保护账号、上传素材、支付记录与 AI 歌词视频制作相关数据。",
    sections: [
      {
        title: "1. 简介",
        body: [
          "LyricVideoMaker 尊重你的隐私。本政策说明你使用 AI 歌词视频制作服务时，我们会收集哪些信息、如何使用这些信息，以及你可以如何管理自己的数据。",
        ],
      },
      {
        title: "2. 我们收集的信息",
        body: [
          "我们会收集账号信息，例如姓名和邮箱；产品使用数据；上传的媒体文件和项目元数据；以及由第三方支付服务处理的付款记录。",
        ],
      },
      {
        title: "3. 信息用途",
        body: [
          "我们使用这些信息来提供和改进服务、处理付款、管理积分和订阅、生成和保存歌词视频项目、防止滥用，并回复支持请求。",
        ],
      },
      {
        title: "4. 服务提供商",
        body: [
          "我们可能会把必要数据提供给可信服务商，用于认证、存储、支付、分析、邮件和 AI 媒体处理。这些服务商只能将数据用于支持我们的服务。",
        ],
      },
      {
        title: "5. 数据安全和保留",
        body: [
          "我们采用合理的技术和组织措施保护你的信息。我们只会在服务运营、法律义务、争议处理或账号管理所需的期限内保留数据。",
        ],
      },
      {
        title: "6. 你的选择",
        body: [
          "你可以通过账号设置访问、更新或请求删除账号信息，也可以通过网站上的支持或联系方式联系我们。",
        ],
      },
      {
        title: "7. 联系我们",
        body: [
          "如果你对本隐私政策有疑问，请通过 LyricVideoMaker 网站提供的支持或联系入口与我们联系。",
        ],
      },
    ],
  },
} as const;

function normalizeLocale(locale: string): keyof typeof content {
  return locale === "zh" ? "zh" : "en";
}

function localizedPath(locale: string) {
  return normalizeLocale(locale) === "zh" ? "/zh/privacy-policy" : "/privacy-policy";
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
      en: "/privacy-policy",
      zh: "/zh/privacy-policy",
      xDefaultPath: "/privacy-policy",
    },
  });
}

export default async function PrivacyPolicyPage({ params }: PageParams) {
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
