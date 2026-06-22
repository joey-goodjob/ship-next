import { getTranslations } from "next-intl/server";
import {
  type FeaturedCreatorMedia,
  FeaturedCreatorsGallery,
} from "@/components/featured-creators-gallery";

export async function FeaturedCreators() {
  const t = await getTranslations("landing");
  const beatvizVideoBaseUrl =
    "https://pub-64bde3d3ea024866bfbb145e4a8ed3bc.r2.dev/beatviz";

  const rows: FeaturedCreatorMedia[][] = [
    [
      {
        videoSrc: `${beatvizVideoBaseUrl}/beatviz-v-e-5.mp4`,
        posterSrc: "/beatviz-community/community-01.webp",
        alt: "AI music video with robotic performers",
      },
      {
        videoSrc: `${beatvizVideoBaseUrl}/beatviz-v-e-6.mp4`,
        posterSrc: "/beatviz-community/community-02.webp",
        alt: "AI music video urban scene",
      },
      {
        videoSrc: `${beatvizVideoBaseUrl}/beatviz-v-e-2.mp4`,
        posterSrc: "/beatviz-community/community-03.webp",
        alt: "AI singer character music video",
      },
      {
        videoSrc: `${beatvizVideoBaseUrl}/YTDown.1.mp4`,
        posterSrc: "/beatviz-community/community-07.webp",
        alt: "AI fantasy beach music video",
      },
      {
        videoSrc: `${beatvizVideoBaseUrl}/YTDown.2.mp4`,
        posterSrc: "/beatviz-community/community-08.webp",
        alt: "AI palace by the sea music video",
      },
      {
        videoSrc: `${beatvizVideoBaseUrl}/YTDown.3.mp4`,
        posterSrc: "/beatviz-community/community-09.webp",
        alt: "AI portrait music video",
      },
    ],
    [
      {
        videoSrc: `${beatvizVideoBaseUrl}/beatviz-v-e-4.mp4`,
        posterSrc: "/beatviz-community/community-04.webp",
        alt: "AI night city music video",
      },
      {
        videoSrc: `${beatvizVideoBaseUrl}/YTDown.4.mp4`,
        posterSrc: "/beatviz-community/community-05.webp",
        alt: "AI surreal character music video",
      },
      {
        videoSrc: `${beatvizVideoBaseUrl}/YTDown.5.mp4`,
        posterSrc: "/beatviz-community/community-06.webp",
        alt: "AI cinematic music video",
      },
      {
        videoSrc: `${beatvizVideoBaseUrl}/beatviz-v-e-1.mp4`,
        posterSrc: "/beatviz-community/community-11.webp",
        alt: "AI golden fantasy music video",
      },
      {
        videoSrc: `${beatvizVideoBaseUrl}/beatviz-v-e-3.mp4`,
        posterSrc: "/beatviz-community/community-10.webp",
        alt: "AI shadow performance music video",
      },
    ],
  ];

  return (
    <FeaturedCreatorsGallery
      title={t("featured.title")}
      description={t("featured.description")}
      exploreLabel={t("featured.explore_cta")}
      exploreHref="/create"
      rows={rows}
    />
  );
}
