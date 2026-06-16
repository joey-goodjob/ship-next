import { getTranslations } from "next-intl/server";
import {
  FeaturedCreatorsGallery,
  type FeaturedCreatorVideo,
} from "@/components/featured-creators-gallery";

export async function FeaturedCreators() {
  const t = await getTranslations("landing");

  const rows: FeaturedCreatorVideo[][] = [
    [
      { src: "/beatmv-showcase/G7V2Biy3omw.mp4" },
      {
        src: "/beatmv-showcase/XvzlglZbZf0.mp4",
        title: t("featured.cards.one_click.title"),
        description: t("featured.cards.one_click.description"),
      },
      { src: "/beatmv-showcase/s7OrG5Iq2Kw.mp4" },
      {
        src: "/beatmv-showcase/_8QsZGLyZGQ.mp4",
        title: t("featured.cards.styles.title"),
        description: t("featured.cards.styles.description"),
      },
    ],
    [
      {
        src: "/beatmv-showcase/-Nb-M1GAOX8.mp4",
        title: t("featured.cards.lip_sync.title"),
        description: t("featured.cards.lip_sync.description"),
      },
      { src: "/beatmv-showcase/edvPrDCWwOk.mp4" },
      {
        src: "/beatmv-showcase/7NK_JOkuSVY.mp4",
        title: t("featured.cards.any_format.title"),
        description: t("featured.cards.any_format.description"),
      },
      { src: "/beatmv-showcase/fpUpVznI4Yc.mp4" },
    ],
  ];

  return (
    <FeaturedCreatorsGallery
      title={t("featured.title")}
      description={t("featured.description")}
      rows={rows}
    />
  );
}
