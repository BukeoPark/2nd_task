import type { MetadataRoute } from "next";
import { isProductionSite, normalizeSiteUrl } from "../lib/site";

export const dynamic = "force-static";

const SITE = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

/** 실제 주소로 배포했을 때만 색인을 허용한다. 로컬·미리보기 주소는 막는다. */
export default function robots(): MetadataRoute.Robots {
  return isProductionSite(SITE)
    ? { rules: { userAgent: "*", allow: "/" }, sitemap: `${SITE}/sitemap.xml` }
    : { rules: { userAgent: "*", disallow: "/" } };
}
