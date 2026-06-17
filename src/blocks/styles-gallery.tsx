import { getTranslations } from "next-intl/server";

import { StylePreviewSwitcher, type StylePreviewItem } from "@/components/style-preview-switcher";

type StyleItem = {
  name: string;
  description: string;
  previewImage: string;
  free: boolean;
};

export async function StylesGallery() {
  const t = await getTranslations("landing");
  const items = t.raw("styles.items") as StyleItem[];

  return (
    <StylePreviewSwitcher
      title={t("styles.title")}
      subtitle={t("styles.subtitle")}
      items={items satisfies StylePreviewItem[]}
    />
  );
}
