import { getTranslations } from "next-intl/server";
import {
  type FeaturedCreatorMedia,
  FeaturedCreatorsGallery,
} from "@/components/featured-creators-gallery";

export async function FeaturedCreators() {
  const t = await getTranslations("landing");
  const beatVideoBaseUrl = "https://cdn.lyricvideomaker.app/beat";

  const rows: FeaturedCreatorMedia[][] = [
    [
      {
        videoSrc: `${beatVideoBaseUrl}/beat-v-e-5.mp4`,
        posterSrc: "/beatviz-community/community-01.webp",
        alt: "AI music video with robotic performers",
      },
      {
        videoSrc: `${beatVideoBaseUrl}/beat-v-e-6.mp4`,
        posterSrc: "/beatviz-community/community-02.webp",
        alt: "AI music video urban scene",
      },
      {
        videoSrc: `${beatVideoBaseUrl}/beat-v-e-2.mp4`,
        posterSrc: "/beatviz-community/community-03.webp",
        alt: "AI singer character music video",
      },
      {
        videoSrc: `${beatVideoBaseUrl}/YTDown.1.mp4`,
        posterSrc: "/beatviz-community/community-07.webp",
        alt: "AI fantasy beach music video",
      },
      {
        videoSrc: `${beatVideoBaseUrl}/YTDown.2.mp4`,
        posterSrc: "/beatviz-community/community-08.webp",
        alt: "AI palace by the sea music video",
      },
      {
        videoSrc: `${beatVideoBaseUrl}/YTDown.3.mp4`,
        posterSrc: "/beatviz-community/community-09.webp",
        alt: "AI portrait music video",
      },
    ],
    [
      {
        videoSrc: `${beatVideoBaseUrl}/beat-v-e-4.mp4`,
        posterSrc: "/beatviz-community/community-04.webp",
        alt: "AI night city music video",
      },
      {
        videoSrc: `${beatVideoBaseUrl}/YTDown.4.mp4`,
        posterSrc: "/beatviz-community/community-05.webp",
        alt: "AI surreal character music video",
      },
      {
        videoSrc: `${beatVideoBaseUrl}/YTDown.5.mp4`,
        posterSrc: "/beatviz-community/community-06.webp",
        alt: "AI cinematic music video",
      },
      {
        videoSrc: `${beatVideoBaseUrl}/beat-v-e-1.mp4`,
        posterSrc: "/beatviz-community/community-11.webp",
        alt: "AI golden fantasy music video",
      },
      {
        videoSrc: `${beatVideoBaseUrl}/beat-v-e-3.mp4`,
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
