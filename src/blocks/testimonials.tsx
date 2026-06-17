import { getTranslations } from "next-intl/server";
import { TestimonialsWall, type TestimonialWallItem } from "@/components/testimonials-wall";

const AVATAR_SRCS = [
  "https://pub-387a24462b7d44e395219fe1c8295ad7.r2.dev/aisongsgenerator/page-sections-testimonials-items-0-avatar-b9b05a85132a.webp",
  "https://pub-387a24462b7d44e395219fe1c8295ad7.r2.dev/aisongsgenerator/page-sections-testimonials-items-1-avatar-5c831de4cdde.webp",
  "https://pub-387a24462b7d44e395219fe1c8295ad7.r2.dev/aisongsgenerator/page-sections-testimonials-items-2-avatar-5790e2398517.webp",
  "https://pub-387a24462b7d44e395219fe1c8295ad7.r2.dev/aisongsgenerator/page-sections-testimonials-items-3-avatar-442374c09b67.webp",
  "https://pub-387a24462b7d44e395219fe1c8295ad7.r2.dev/aisongsgenerator/page-sections-testimonials-items-4-avatar-fecafbee45e7.webp",
  "https://pub-387a24462b7d44e395219fe1c8295ad7.r2.dev/aisongsgenerator/page-sections-testimonials-items-5-avatar-1b038c541faa.webp",
  "https://pub-387a24462b7d44e395219fe1c8295ad7.r2.dev/aisongsgenerator/page-sections-testimonials-items-6-avatar-9797752069af.webp",
  "https://pub-387a24462b7d44e395219fe1c8295ad7.r2.dev/aisongsgenerator/page-sections-testimonials-items-7-avatar-606043eeac58.webp",
  "/imgs/testimonials/avatar-09.webp",
  "/imgs/testimonials/avatar-10.webp",
  "/imgs/testimonials/avatar-11.webp",
  "/imgs/testimonials/avatar-12.webp",
] as const;

export async function Testimonials() {
  const t = await getTranslations("landing");
  const items = (t.raw("testimonials.items") as TestimonialWallItem[]).map((item, index) => ({
    ...item,
    avatarSrc: item.avatarSrc || AVATAR_SRCS[index % AVATAR_SRCS.length],
  }));

  return (
    <TestimonialsWall
      title={t("testimonials.title")}
      description={t("testimonials.description")}
      items={items}
    />
  );
}
