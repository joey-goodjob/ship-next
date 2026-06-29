import { getTranslations } from "next-intl/server";
import {
  SiteFooter,
  type FooterColumn,
} from "@/components/site-footer";

export async function Footer() {
  const t = await getTranslations("landing");

  const columns: FooterColumn[] = [
    {
      title: t("footer.products"),
      links: [
        {
          label: t("footer.lyric_video_generator"),
          href: "/lyric-video-generator",
        },
        {
          label: t("footer.free_lyric_video_maker"),
          href: "/free-lyric-video-maker",
        },
        {
          label: t("footer.audio_to_lyric_video"),
          href: "/audio-to-lyric-video",
        },
        { label: t("footer.song_to_lyric_video"), href: "/song-to-lyric-video" },
        {
          label: t("footer.tiktok_lyric_video_generator"),
          href: "/tiktok-lyric-video-generator",
        },
        {
          label: t("footer.ai_music_video_generator"),
          href: "/ai-music-video-generator",
        },
      ],
    },
    {
      title: t("footer.tools"),
      links: [
        { label: t("footer.add_lyrics_to_video"), href: "/add-lyrics-to-video" },
        { label: t("footer.karaoke_video_maker"), href: "/karaoke-video-maker" },
        {
          label: t("footer.auto_lyrics_transcription"),
          href: "/auto-lyrics-transcription",
        },
        { label: t("footer.lyric_video_templates"), href: "/lyric-video-templates" },
      ],
    },
    {
      title: t("footer.resources"),
      links: [
        { label: t("footer.resources"), href: "/resources" },
        {
          label: t("footer.how_to_make_a_lyric_video"),
          href: "/how-to-make-a-lyric-video",
        },
        { label: t("footer.ai_lyric_video_maker"), href: "/#create" },
        { label: t("footer.pricing"), href: "/pricing" },
      ],
    },
    {
      title: t("footer.alternatives"),
      links: [
        { label: t("footer.kapwing_alternative"), href: "/kapwing-alternative" },
        { label: t("footer.veed_alternative"), href: "/veed-alternative" },
        { label: t("footer.capify_alternative"), href: "/capify-alternative" },
        {
          label: t("footer.neural_frames_alternative"),
          href: "/neural-frames-alternative",
        },
      ],
    },
    {
      title: t("footer.company"),
      links: [
        { label: t("footer.privacy"), href: "/privacy-policy" },
        { label: t("footer.terms"), href: "/terms-of-service" },
        { label: t("footer.refund"), href: "/refund-policy" },
        { label: t("footer.contact"), href: "/contact" },
      ],
    },
  ];

  return (
    <SiteFooter
      tagline={t("footer.tagline")}
      columns={columns}
    />
  );
}
