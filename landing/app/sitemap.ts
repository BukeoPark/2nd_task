import type { MetadataRoute } from "next";
import { normalizeSiteUrl } from "../lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)}/`, changeFrequency: "monthly", priority: 1 }];
}
