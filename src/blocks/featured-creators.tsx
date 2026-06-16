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
        posterSrc: "/beatviz-community/community-01.jpg",
        alt: "AI music video with robotic performers",
      },
      {
        videoSrc: `${beatvizVideoBaseUrl}/beatviz-v-e-6.mp4`,
        posterSrc: "/beatviz-community/community-02.jpg",
        alt: "AI music video urban scene",
      },
      {
        videoSrc: `${beatvizVideoBaseUrl}/beatviz-v-e-2.mp4`,
        posterSrc: "/beatviz-community/community-03.jpg",
        alt: "AI singer character music video",
      },
      {
        videoSrc: `${beatvizVideoBaseUrl}/YTDown.1.mp4`,
        posterSrc: "/beatviz-community/community-07.jpg",
        alt: "AI fantasy beach music video",
      },
      {
        videoSrc: `${beatvizVideoBaseUrl}/YTDown.2.mp4`,
        posterSrc: "/beatviz-community/community-08.jpg",
        alt: "AI palace by the sea music video",
      },
      {
        videoSrc: `${beatvizVideoBaseUrl}/YTDown.3.mp4`,
        posterSrc: "/beatviz-community/community-09.jpg",
        alt: "AI portrait music video",
      },
    ],
    [
      {
        videoSrc: `${beatvizVideoBaseUrl}/beatviz-v-e-4.mp4`,
        posterSrc: "/beatviz-community/community-04.jpg",
        alt: "AI night city music video",
      },
      {
        videoSrc: `${beatvizVideoBaseUrl}/YTDown.4.mp4`,
        posterSrc: "/beatviz-community/community-05.jpg",
        alt: "AI surreal character music video",
      },
      {
        videoSrc: `${beatvizVideoBaseUrl}/YTDown.5.mp4`,
        posterSrc: "/beatviz-community/community-06.jpg",
        alt: "AI cinematic music video",
      },
      {
        videoSrc: `${beatvizVideoBaseUrl}/beatviz-v-e-1.mp4`,
        posterSrc: "/beatviz-community/community-11.jpg",
        alt: "AI golden fantasy music video",
      },
      {
        videoSrc: `${beatvizVideoBaseUrl}/beatviz-v-e-3.mp4`,
        posterSrc: "/beatviz-community/community-10.jpg",
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
