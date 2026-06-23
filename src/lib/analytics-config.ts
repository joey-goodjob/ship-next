export type AnalyticsConfigMap = Record<string, string | undefined>;

export type AnalyticsConfig = {
  googleAnalyticsId: string | null;
  clarityId: string | null;
  plausible: {
    domain: string;
    src: string;
  } | null;
};

const SAFE_TRACKING_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function cleanTrackingId(value: string | undefined): string | null {
  const id = value?.trim();
  if (!id || !SAFE_TRACKING_ID_PATTERN.test(id)) {
    return null;
  }

  return id;
}

function cleanPlausibleConfig(configs: AnalyticsConfigMap): AnalyticsConfig["plausible"] {
  const domain = configs.plausible_domain?.trim();
  const src = configs.plausible_src?.trim();

  if (!domain || !src) {
    return null;
  }

  try {
    const url = new URL(src);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    return { domain, src: url.toString() };
  } catch {
    return null;
  }
}

export function buildAnalyticsConfig(configs: AnalyticsConfigMap): AnalyticsConfig {
  return {
    googleAnalyticsId: cleanTrackingId(configs.google_analytics_id),
    clarityId: cleanTrackingId(configs.clarity_id),
    plausible: cleanPlausibleConfig(configs),
  };
}
