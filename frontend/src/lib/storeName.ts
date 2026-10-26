import PREFERRED_BRANDS from "./storeBrandPreferred.json" with { type: "json" };
import NAME_PLACES from "./storeNamePlaces.json" with { type: "json" };
import BRANCH_PLACES from "./storeBranchPlaces.json" with { type: "json" };
import BRAND_PREFIXES from "./storeBrandPrefixes.json" with { type: "json" };
/** Display-only branch recovery from processed station and neighborhood names.
 * Recheck the complete label: source branches may begin partway through a place name. */
import BRANCH_SUFFIXES from "./storeBranchSuffixes.json" with { type: "json" };

/** Brand names come from the brand registry plus user-confirmed display aliases. */


const BRANDS = [...new Set([...PREFERRED_BRANDS, ...BRAND_PREFIXES])];

export function splitStoreName(name: string, branch: string | null | undefined): { name: string; branch: string | null } {
  const originalBranch = branch?.trim() || null;
  const originalName = name.trim();
  const trimmed = originalBranch && !originalName.endsWith(originalBranch)
    ? originalName + originalBranch : originalName;
  // These are business-category endings, not branch markers.
  // Do not merge a second source branch onto an already complete branch label.
  if (originalBranch && /점$/.test(originalName)) return { name, branch: originalBranch };
  const isPlace = (value: string) => BRANCH_PLACES.some(place => value.startsWith(place));
  // Preserve a complete source brand when only a shorter franchise prefix matches.
  const productTail = /^(치킨|버거|전기|바베큐|부산어묵|AND|대통령|노래|단란|민속|제과|과자|정육|편의|음식|휴게|만두|체인)/i;
  // Known brands let us retain building, park and institution branch names intact.
  for (const brand of BRANDS) {
    if (!trimmed.startsWith(brand)) continue;
    const suffix = trimmed.slice(brand.length).trim().replace(/점주$/, "점");
    if (suffix.length >= 2 && suffix.endsWith("점") && !productTail.test(suffix)
      && (isPlace(suffix) || (brand.length >= 3 && !originalBranch))) return { name: brand, branch: suffix };
  }
  if (!originalBranch && /(?:반점|주점|과자점|제과점|음식점|정육점|상점|편의점|면식점|매점)$/.test(trimmed)) return { name, branch: null };
  // A known place can occur before a building/school qualifier, not only directly before 점.
  const locationCandidates = NAME_PLACES.flatMap(place => {
    const index = trimmed.indexOf(place, 2);
    return index >= 2 && /점(?:주)?$/.test(trimmed) ? [{ index, place }] : [];
  }).sort((a,b) => a.index - b.index || b.place.length - a.place.length);
  if (locationCandidates.length) {
    const index = locationCandidates[0].index;
    return { name: trimmed.slice(0, index).trim(), branch: trimmed.slice(index).replace(/점주$/, "점") };
  }
  for (const suffix of BRANCH_SUFFIXES) {
    if (!trimmed.endsWith(suffix)) continue;
    const base = trimmed.slice(0, -suffix.length).trim();
    if (base.length >= 2) return { name: base, branch: suffix };
  }
  return { name, branch: originalBranch };
}
