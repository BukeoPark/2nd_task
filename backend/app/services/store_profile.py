"""매장 기본정보 + '매장 운영이력'(인허가 기준 업력·영업 상태·인증/지정).

표시 원칙
  - 인허가일로 계산한 기간은 '인허가 기준 업력'이다. 현재 브랜드·운영자의 실제 영업기간으로 단정하지 않는다.
  - 없는 인허가일·폐업일을 추정해 채우지 않는다. 연결이 불확실하면 값 대신 상태만 돌려준다.
  - 인증·지정은 해당 업종에 적용되고 원천에서 확인될 때만 '지정'. 확인 못 하면 '미확인'(미지정으로 해석하지 않음).
"""
from __future__ import annotations

from datetime import date

import pandas as pd

from app.services import data_store, taxonomy


class StoreNotFound(KeyError):
    pass


LINK_MESSAGE = {
    "matched": "인허가 정보와 연결됨",
    "ambiguous": "매장 연결 확인 필요 — 같은 상호·주소의 인허가가 여러 건",
    "needs_check": "매장 연결 확인 필요 — 상호는 같지만 주소가 일치하지 않음",
    "closed_only": "영업 중인 인허가를 찾지 못함 — 같은 상호·주소의 폐업 인허가만 있음(과거 이력일 수 있어 연결하지 않음)",
    "no_match": "연결된 인허가 없음 — 상호·주소가 일치하는 인허가를 찾지 못함",
    "source_missing_gu": "이 자치구에는 해당 인허가 원천이 제공되지 않음",
}
COVERAGE_MESSAGE = {
    "pending": "연동 준비 중 — 해당 업종의 공식 자료는 인증키 발급 후 연결됩니다",
    "not_connected": "이 업종의 인허가·등록 자료는 아직 연결하지 않았습니다",
    "not_applicable": "이 업종은 같은 형태의 인허가 이력이 없어 기본 매장정보만 제공합니다",
}
# 모범음식점 지정 대상은 일반음식점(식품위생법 모범업소 제도). 휴게음식점·제과점 등은 해당 없음.
MODEL_RESTAURANT_LICENSE_CODES = {"072404"}


def _clean(rec: dict) -> dict:
    return {k: (None if (v is None or (isinstance(v, float) and pd.isna(v)) or v is pd.NaT) else v) for k, v in rec.items()}


def get_store(bizes_id: str) -> dict:
    stores = data_store.load_parquet("stores.parquet")
    row = stores.loc[stores["bizesId"] == bizes_id]
    if row.empty:
        raise StoreNotFound(bizes_id)
    return _clean(row.iloc[0].to_dict())


def _age_label(permit: date, as_of: date) -> tuple[float, str]:
    months = (as_of.year - permit.year) * 12 + (as_of.month - permit.month) - (1 if as_of.day < permit.day else 0)
    months = max(months, 0)
    return round(months / 12, 1), f"{months // 12}년 {months % 12}개월"


def _license(license_id: str) -> dict | None:
    lic = data_store.load_parquet("licenses.parquet")
    row = lic.loc[lic["license_id"] == license_id]
    return _clean(row.iloc[0].to_dict()) if not row.empty else None


def basic_info(store: dict) -> dict:
    ref = taxonomy.sources()["sbiz_store"]["reference"]
    return {
        "store_id": store["bizesId"], "name": store["bizesNm"], "branch": store["brchNm"],
        "category": {"lcls": store["indsLclsNm"], "mcls": store["indsMclsNm"], "scls": store["indsSclsNm"],
                     "scls_code": store["indsSclsCd"]},
        "address": store["rdnmAdr"] or store["lnoAdr"], "building": store["bldNm"],
        "dong": store["adongNm"], "sigungu": store["signguNm"], "lon": store["lon"], "lat": store["lat"],
        "source": {"title": "소상공인시장진흥공단 상가(상권)정보", "reference": f"{ref.get('stdrYm', '')[:4]}-{ref.get('stdrYm', '')[4:]} 기준"},
    }


def _certifications(store: dict, license: dict | None, is_food: bool) -> list[dict]:
    src = taxonomy.sources()["seoul_model_restaurant"]
    source = {"title": src["title"], "reference": f"{src['reference'].get('collected_at', '-')} 수집"}
    if not is_food:
        return [{"name": "모범음식점", "status": "not_applicable", "label": "해당 없음(음식점 아님)", "source": source}]
    if license is not None and license["license_code"] not in MODEL_RESTAURANT_LICENSE_CODES:
        return [{"name": "모범음식점", "status": "not_applicable",
                 "label": f"해당 없음({license['license_name']}은 지정 대상이 아님)", "source": source}]
    if license is None or license["status_norm"] not in ("active", "suspended"):
        return [{"name": "모범음식점", "status": "unverified", "label": "미확인 — 영업 중 인허가와 연결되지 않아 지정 여부를 확인할 수 없음",
                 "source": source}]
    model = data_store.load_parquet("model_restaurants.parquet")
    hit = model.loc[model["license_id"] == license["license_id"]]
    if hit.empty:
        return [{"name": "모범음식점", "status": "unverified",
                 "label": "미확인 — 현재 지정 현황 목록에서 확인되지 않음(지정되지 않았다는 뜻은 아님)", "source": source}]
    d = hit.iloc[0]["designated_date"]
    return [{"name": "모범음식점", "status": "designated", "designated_date": None if pd.isna(d) else d.date().isoformat(),
             "label": "지정 현황 목록에 있음", "source": source}]


def operation_history(store: dict) -> dict:
    tax = taxonomy.scls_row(store["indsSclsCd"])
    sources = taxonomy.sources()
    coverage = {"status": tax["status"], "label": taxonomy.COVERAGE_LABEL[tax["status"]],
                "license_names": tax["license_names"], "note": tax["note"]}
    is_food = tax["indsLclsCd"] == "I2"
    result = {"coverage": coverage, "link": None, "license": None, "certifications": [], "sources": []}

    if tax["status"] != "connected":
        result["link"] = {"status": tax["status"], "message": COVERAGE_MESSAGE[tax["status"]]}
        result["certifications"] = _certifications(store, None, is_food)
        return result

    links = data_store.load_parquet("store_license_links.parquet")
    row = links.loc[links["bizesId"] == store["bizesId"]]
    link = _clean(row.iloc[0].to_dict()) if not row.empty else {"link_status": "no_match"}
    status = link["link_status"]
    result["link"] = {"status": status, "message": LINK_MESSAGE[status],
                      "distance_m": link.get("distance_m"), "name_relation": link.get("name_relation")}

    lic = _license(link["license_id"]) if status == "matched" and link.get("license_id") else None
    local = sources["seoul_localdata"]
    as_of = date.fromisoformat(local["reference"]["collected_at"])
    if lic:
        permit = lic["permit_date"].date() if lic["permit_date"] is not None else None
        years, label = _age_label(permit, as_of) if permit else (None, None)
        others = link.get("other_license_ids")
        result["license"] = {
            "license_name": lic["license_name"], "uptae": lic["uptae"],
            "permit_date": permit.isoformat() if permit else None,
            "age_basis": "인허가 기준 업력", "age_years": years, "age_label": label, "age_as_of": as_of.isoformat(),
            "age_caveat": "인허가일부터 자료 기준일까지의 기간입니다. 영업자 지위승계·상호 변경이 있어도 인허가가 유지되면 이어서 계산되므로, "
                          "현재 운영자나 현재 브랜드의 영업기간과 다를 수 있습니다.",
            "state_name": lic["state_name"], "detail_state": lic["detail_state"],
            "other_license_count": len(others) if others is not None else 0,
            "duplicate_license_count": int(link.get("n_dup_licenses") or 0),
        }
    lic_ref = local["reference"]
    result["sources"].append({"title": local["title"],
                              "reference": f"{lic_ref.get('collected_at')} 수집 (원천 최종 갱신 {lic_ref.get('source_updated_max')})"})
    result["certifications"] = _certifications(store, lic, is_food)
    return result
