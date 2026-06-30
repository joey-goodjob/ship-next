import { getTranslations } from "next-intl/server";
import { TestimonialsWall, type TestimonialWallItem } from "@/components/testimonials-wall";

const AVATAR_SRCS = [
  "https://cdn.lyricvideomaker.app/imgs/testimonials/avatar-01.webp",
  "https://cdn.lyricvideomaker.app/imgs/testimonials/avatar-02.webp",
  "https://cdn.lyricvideomaker.app/imgs/testimonials/avatar-03.webp",
  "https://cdn.lyricvideomaker.app/imgs/testimonials/avatar-04.webp",
  "https://cdn.lyricvideomaker.app/imgs/testimonials/avatar-05.webp",
  "https://cdn.lyricvideomaker.app/imgs/testimonials/avatar-06.webp",
  "https://cdn.lyricvideomaker.app/imgs/testimonials/avatar-07.webp",
  "https://cdn.lyricvideomaker.app/imgs/testimonials/avatar-08.webp",
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
