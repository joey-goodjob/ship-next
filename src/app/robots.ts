import type { MetadataRoute } from 'next';
import { envConfigs } from '@/config';

function baseUrl() {
  return (envConfigs.app_url || 'https://lyricvideomaker.app').replace(/\/$/, '');
}

export default function robots(): MetadataRoute.Robots {
  const base = baseUrl();

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
