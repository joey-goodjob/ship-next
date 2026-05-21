import { getTranslations } from "next-intl/server";
import { AudioLines, Clapperboard, Download, ImageIcon, Type } from "lucide-react";

const STEPS = [
  { key: "upload", icon: AudioLines },
  { key: "lyrics", icon: Type },
  { key: "storyboard", icon: Clapperboard },
  { key: "images", icon: ImageIcon },
  { key: "export", icon: Download },
] as const;

export async function Workflow() {
  const t = await getTranslations("landing");

  return (
    <section id="workflow" className="border-t border-border px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-14 max-w-2xl">
          <h2 className="font-serif text-4xl font-normal tracking-tight sm:text-5xl">
            {t("workflow.title")}
          </h2>
          <p className="mt-5 text-muted-foreground">{t("workflow.description")}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-5">
          {STEPS.map(({ key, icon: Icon }, index) => (
            <div key={key} className="rounded-lg border bg-card p-5">
              <div className="mb-6 flex items-center justify-between">
                <Icon className="size-5" />
                <span className="text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="font-medium">{t(`workflow.${key}.title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t(`workflow.${key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
