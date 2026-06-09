"use client";

import { Check, Info, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/core/i18n/navigation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FEATURES = [
  "1080p, 24 FPS",
  "AI lyric transcription",
  "Audio trimmer",
  "Watermark-free",
  "Commercial use",
  "Unlimited exports",
  "Premium AI models",
  "Upload your own images",
  "Edit images with AI",
  "Lip Sync",
  "Reduced-credit actions",
  "Adobe Premiere export",
  "DaVinci Resolve export",
  "Final Cut Pro export",
];

const PLANS = [
  { key: "free", price: "$0", credits: "150 credits one time", enabled: 3 },
  { key: "creator", price: "$39", credits: "2,000 credits per month", enabled: 7 },
  { key: "pro", price: "$99", credits: "6,000 credits per month", enabled: 14, popular: true },
  { key: "ultra", price: "$149", credits: "10,000 credits per month", enabled: 14 },
] as const;

const FAQ_KEYS = ["free_preview", "credits", "static_video", "models", "rights"] as const;

function PlanCard({ plan }: { plan: (typeof PLANS)[number] }) {
  const t = useTranslations("landing");
  const popular = "popular" in plan && plan.popular;
  const inner = (
    <div className="h-full rounded-[22px] border border-brand-line bg-brand-panel px-6 py-7">
      <h3 className="text-lg font-black text-brand-ink">{t(`pricing_plans.${plan.key}.name`)}</h3>
      <div className="mt-10 flex items-end gap-2">
        <span className="text-5xl font-black tracking-[-0.04em] text-brand-ink">{plan.price}</span>
        <span className="mb-2 font-black text-brand-muted">/ month</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-brand-muted">{t(`pricing_plans.${plan.key}.note`)}</p>
      <div className="mt-10 flex items-center gap-2 font-black">
        {plan.credits}
        <Info className="size-4" />
      </div>
      <Link
        href="/#create"
        className={`mt-6 flex h-11 items-center justify-center rounded-md border text-base font-black ${
          popular ? "border-brand-accent bg-brand-accent text-brand-ink" : "border-brand-ink bg-brand-panel text-brand-ink"
        }`}
      >
        {t(`pricing_plans.${plan.key}.cta`)}
      </Link>
      <div className="mt-6 border-t border-brand-line pt-5">
        <p className="mb-4 text-xs font-black uppercase text-brand-muted">Features</p>
        <ul className="space-y-3">
          {FEATURES.map((feature, index) => {
            const ok = index < plan.enabled;
            return (
              <li key={feature} className={`flex items-center gap-2 text-sm font-semibold ${ok ? "text-brand-ink" : "text-brand-subtle"}`}>
                {ok ? <Check className="size-4 text-emerald-500" /> : <X className="size-4 text-red-300" />}
                {feature}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );

  if (!popular) return inner;

  return (
    <div className="rounded-[24px] bg-brand-accent p-1">
      <div className="pb-2 pt-1 text-center text-base font-black uppercase">Most Popular</div>
      {inner}
    </div>
  );
}

export function Pricing({ title }: { title?: string } = {}) {
  const t = useTranslations("landing");

  return (
    <main className="bg-brand-panel text-brand-ink">
      <section id="pricing" className="px-5 pb-16 pt-10 sm:pb-24">
        <div className="mx-auto max-w-[1280px]">
          <div className="text-center">
            <h1 className="text-5xl font-black tracking-[-0.05em] sm:text-[58px]">
              {title ?? t("pricing.title")}
            </h1>
            <p className="mt-4 text-2xl">{t("pricing.description")}</p>
            <div className="mx-auto mt-8 inline-flex items-center gap-2 rounded-md bg-brand-soft p-1.5 text-base font-black text-brand-muted">
              <span className="rounded-md bg-brand-panel px-5 py-3 text-brand-ink shadow-sm">Monthly</span>
              <span className="px-5 py-3">Annual</span>
              <span className="rounded-full border border-emerald-400 px-4 py-2 text-xs uppercase text-emerald-500">Save 2 months</span>
            </div>
          </div>

          <div className="mt-16 grid gap-5 lg:grid-cols-4">
            {PLANS.map((plan) => <PlanCard key={plan.key} plan={plan} />)}
          </div>

          <div className="mt-20 rounded-[24px] border border-brand-line bg-brand-panel p-8 lg:grid lg:grid-cols-[1fr_380px] lg:gap-10">
            <div>
              <h2 className="text-3xl font-black tracking-[-0.03em]">{t("credits_pack.title")}</h2>
              <p className="mt-3 font-semibold text-brand-muted">{t("credits_pack.description")}</p>
              <div className="mt-8 grid grid-cols-2 overflow-hidden rounded-md bg-brand-soft md:grid-cols-7">
                {["500", "1,000", "2,500", "5,000", "10,000", "20,000", "50,000"].map((value) => (
                  <div key={value} className={`px-5 py-5 text-center ${value === "2,500" ? "bg-brand-panel shadow-md" : ""}`}>
                    <div className="text-2xl font-black">{value}</div>
                    <div className="mt-3 border-t pt-3 text-xl font-black text-brand-muted">
                      {value === "2,500" ? "$50" : value === "500" ? "$15" : value === "1,000" ? "$25" : value === "5,000" ? "$90" : value === "10,000" ? "$170" : value === "20,000" ? "$330" : "$800"}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-8 flex items-start gap-3 text-lg font-black">
                <Check className="mt-1 size-5" />
                {t("credits_pack.included")}
              </p>
            </div>
            <div className="mt-8 rounded-[22px] border border-brand-line p-6 lg:mt-0">
              <p className="font-black">One-time purchase</p>
              <div className="mt-5 text-4xl font-black">$50</div>
              <p className="mt-3 font-semibold text-brand-muted">Instant access. No subscription required.</p>
              <Link href="/#create" className="mt-5 flex h-12 items-center justify-center rounded-md bg-brand-accent font-black text-brand-ink">
                Continue with 2,500 credits
              </Link>
            </div>
          </div>

          <div className="mt-16 rounded-[24px] border border-brand-line bg-brand-panel p-8 lg:grid lg:grid-cols-2 lg:gap-12">
            <div>
              <h2 className="text-3xl font-black tracking-[-0.03em]">{t("calculator.title")}</h2>
              <div className="mt-8 space-y-8">
                <div>
                  <p className="font-black">1. Set Your Song Length</p>
                  <div className="mt-5 h-1.5 rounded-full bg-brand-line">
                    <div className="h-full w-1/4 rounded-full bg-brand-accent" />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-brand-muted">03:00</p>
                </div>
                <div>
                  <p className="font-black">2. Choose Backdrop Type</p>
                  <div className="mt-3 inline-flex rounded-md bg-brand-soft p-1 font-black">
                    <span className="rounded bg-brand-panel px-5 py-2">Static</span>
                    <span className="px-5 py-2 text-brand-muted">Animated</span>
                  </div>
                </div>
                <div>
                  <p className="font-black">3. Choose Resolution</p>
                  <div className="mt-3 inline-flex rounded-md bg-brand-soft p-1 font-black">
                    <span className="rounded bg-brand-panel px-5 py-2">1080p</span>
                    <span className="px-5 py-2 text-brand-muted">4K</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-10 flex min-h-72 flex-col items-center justify-center border-t border-brand-line lg:mt-0 lg:border-l lg:border-t-0">
              <p className="font-semibold text-brand-muted">Estimated Credits Needed:</p>
              <div className="mt-6 text-5xl font-black text-brand-accent">310 credits*</div>
            </div>
          </div>

          <div className="mt-16 rounded-[24px] border border-brand-line bg-brand-panel p-8">
            <h2 className="text-3xl font-black tracking-[-0.03em]">Credit Info</h2>
            {["Upload a Song and Lyric Transcription", "Generate Image", "Convert Image to Video", "Upscale to 4K"].map((group) => (
              <div key={group} className="mt-10">
                <h3 className="font-black">{group}</h3>
                <div className="mt-5 divide-y divide-brand-line border-t border-brand-line">
                  {["Director Model", "Character Model", "Remix Model"].map((model, index) => (
                    <div key={model} className="grid gap-3 py-4 text-sm md:grid-cols-2">
                      <div>
                        <p className="font-black text-brand-ink">{model}</p>
                        <p className="mt-1 text-xs font-semibold text-brand-muted">High quality AI generation for lyric video projects</p>
                      </div>
                      <p className="font-semibold text-brand-ink">{index === 0 ? "1 credit per second of audio" : index === 1 ? "5 credits per image" : "20 credits per generation"}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-20 grid items-center gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <h2 className="text-4xl font-black tracking-[-0.04em]">{t("enterprise.pitch")}</h2>
            <div className="rounded-[24px] border border-brand-line bg-brand-panel p-6">
              <p className="font-black">Enterprise</p>
              <h3 className="mt-8 text-4xl font-black tracking-[-0.04em]">Get a quote</h3>
              <Link href="/#create" className="mt-6 flex h-12 items-center justify-center rounded-md border border-brand-ink font-black">
                Contact Sales
              </Link>
              <ul className="mt-7 space-y-3 border-t pt-6 font-semibold">
                {["Everything in Ultra", "Custom credit amounts", "API access", "Access to a professional video editor team"].map((item) => (
                  <li key={item} className="flex gap-2"><Check className="size-5 text-emerald-500" /> {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-brand-soft px-5 py-24 text-center">
        <h2 className="text-4xl font-black tracking-[-0.04em]">{t("pricing_faq.title")}</h2>
        <p className="mt-5">{t("pricing_faq.description")}</p>
        <Accordion className="mx-auto mt-12 max-w-[760px] overflow-hidden rounded-sm bg-brand-panel text-left shadow-sm" defaultValue={["free_preview"]}>
          {FAQ_KEYS.map((key) => (
            <AccordionItem key={key} value={key} className="border-brand-line">
              <AccordionTrigger className="px-5 py-6 font-black text-brand-muted hover:no-underline">
                {t(`faq.${key}.question`)}
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-6 font-semibold leading-8 text-brand-muted">
                {t(`faq.${key}.answer`)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className="bg-brand-cta-gradient px-5 py-20 text-center">
        <p className="text-lg leading-9">{t("pricing_cta.copy")}</p>
        <Link href="/#create" className="mt-8 inline-flex h-[62px] items-center justify-center rounded-[9px] bg-brand-accent px-9 text-2xl font-black uppercase text-brand-ink">
          Contact us
        </Link>
      </section>
    </main>
  );
}
