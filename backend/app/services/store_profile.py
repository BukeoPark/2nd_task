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


def _trdar_of(bizes_id: str) -> dict | None:
    """매장이 경계 안에 드는 서울시 상권(없으면 None) — 상권 상세 화면으로 이동하는 링크용."""
    st = data_store.load_parquet("store_trdar.parquet")
    hit = st.loc[st["bizesId"] == bizes_id]
    if hit.empty:
        return None
    ta = data_store.load_parquet("trdar_areas.parquet").set_index("trdar_cd")
    cd = hit.iloc[0]["trdar_cd"]
    if cd not in ta.index:
        return None
    t = ta.loc[cd]
    return {"code": cd, "name": t["trdar_nm"], "type": t["trdar_type"], "lon": float(t["lon"]), "lat": float(t["lat"])}


def basic_info(store: dict) -> dict:
    ref = taxonomy.sources()["sbiz_store"]["reference"]
    return {
        "store_id": store["bizesId"], "name": store["bizesNm"], "branch": store["brchNm"],
        "category": {"lcls": store["indsLclsNm"], "mcls": store["indsMclsNm"], "scls": store["indsSclsNm"],
                     "scls_code": store["indsSclsCd"]},
        "address": store["rdnmAdr"] or store["lnoAdr"], "building": store["bldNm"],
        "dong": store["adongNm"], "adong_cd": store["adongCd"], "trdar": _trdar_of(store["bizesId"]), "sigungu": store["signguNm"], "lon": store["lon"], "lat": store["lat"],
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


BUSINESS_STATUS_LABEL = {"licensed_open": "인허가상 영업", "licensed_closed": "인허가상 폐업 기록 확인", "unconfirmed": "영업 여부 미확인"}
CLOSURE_CAVEAT = "인허가 자료상 폐업 기록이며 실제 현장 폐업이 확정된 것은 아닙니다. 재입점·상호 변경으로 현재 영업 중일 수 있습니다."
CLOSURE_EVIDENCE_LABEL = {
    "closed_after_snapshot": "폐업일이 상가정보 기준월 이후라 상가정보에 아직 반영되지 않았을 수 있음",
    "replaced_by_new_license": "폐업 이후 같은 건물에 다른 상호의 새 인허가가 생기고 상가정보에도 등재됨",
}
BUSINESS_CAVEAT = "인허가 자료상의 상태일 뿐 실제 현장 영업이 확인된 것은 아닙니다. 네이버 등 지도 검색 결과 유무로는 판정하지 않습니다."


def business_status(coverage_status: str, link: dict | None, lic: dict | None, close_date, closure: dict | None = None) -> dict:
    """인허가 기록만으로 구분한 영업 상태 — 인허가상 영업 / 인허가상 폐업 / 영업 여부 미확인.

    · 인허가상 영업: 매칭이 확인된 인허가(강한 일치)가 영업 상태
    · 인허가상 폐업: 매칭이 확인된 인허가에 폐업 기록이 있을 때(현재 연결 규칙은 폐업 인허가를 매장에 붙이지 않아 해당 매장이 없다)
    · 영업 여부 미확인: 인허가 원천이 없거나, 매칭이 없거나 불확실하거나, 폐업 인허가와만 일치(과거 이력일 수 있어 폐업으로 판정하지 않음)
    """
    if coverage_status != "connected":
        return {"status": "unconfirmed", "label": BUSINESS_STATUS_LABEL["unconfirmed"],
                "basis": "이 업종은 인허가 자료가 연결되지 않아 영업 여부를 확인할 수 없음", "caveat": BUSINESS_CAVEAT}
    if lic is not None:
        norm = lic.get("status_norm")
        if norm == "active":
            return {"status": "licensed_open", "label": BUSINESS_STATUS_LABEL["licensed_open"],
                    "basis": f"인허가 기록({lic['license_name']})에 '{lic['state_name']}'으로 표시", "caveat": BUSINESS_CAVEAT}
        if norm == "closed":
            when = close_date.date().isoformat() if close_date is not None and not pd.isna(close_date) else "폐업일 자료 없음"
            return {"status": "licensed_closed", "label": BUSINESS_STATUS_LABEL["licensed_closed"],
                    "basis": f"연결된 인허가 기록({lic['license_name']})에 폐업 표시 · {when}", "caveat": BUSINESS_CAVEAT}
        return {"status": "unconfirmed", "label": BUSINESS_STATUS_LABEL["unconfirmed"],
                "basis": f"연결된 인허가의 상태가 '{lic['state_name']}'이라 영업 여부를 판정하지 않음", "caveat": BUSINESS_CAVEAT}
    status = (link or {}).get("status", "no_match")
    if status == "closed_only" and closure is not None:
        # 영업 인허가가 연결되지 않은 매장 중, 보수적 근거(closed_after_snapshot·replaced_by_new_license)가 확인된 매장만
        return {"status": "licensed_closed", "label": BUSINESS_STATUS_LABEL["licensed_closed"],
                "basis": f"폐업 인허가('{closure['license_name']}') · 폐업일 {closure['close_date'] or '자료 없음'} · 근거: {closure['evidence_label']}",
                "caveat": CLOSURE_CAVEAT, "closure": closure}
    return {"status": "unconfirmed", "label": BUSINESS_STATUS_LABEL["unconfirmed"],
            "basis": LINK_MESSAGE.get(status, LINK_MESSAGE["no_match"]) + ("" if status != "closed_only" else " — 폐업으로 판정하지 않음"),
            "caveat": BUSINESS_CAVEAT}


def closure_evidence(bizes_id: str) -> dict | None:
    """폐업 기록 확인(confirmed)으로 판정된 매장의 근거. 판정 자료가 없거나 확인되지 않았으면 None."""
    try:
        ev = data_store.load_parquet("store_closure_evidence.parquet")
    except data_store.DataNotReady:
        return None
    row = ev.loc[(ev["bizesId"] == bizes_id) & (ev["closure_status"] == "confirmed")]
    if row.empty:
        return None
    r = _clean(row.iloc[0].to_dict())
    return {"license_id": r["closed_license_id"], "license_ids": [str(x) for x in r["closed_license_ids"]], "license_name": r["closed_license_name"],
            "close_date": None if r["close_date"] is None else r["close_date"].date().isoformat(),
            "evidence": r["evidence"], "evidence_label": CLOSURE_EVIDENCE_LABEL[r["evidence"]],
            "replaced_by_license_id": r.get("replaced_by_license_id")}


def _data_dates(license_codes) -> dict:
    """화면에 같이 보일 자료 기준일 — 상가정보 기준월과 인허가 자료 수집·갱신일. 없는 날짜는 None(채우지 않는다)."""
    sources = taxonomy.sources()
    sbiz = sources["sbiz_store"]["reference"]
    ym = sbiz.get("stdrYm", "")
    key = "neis_academy" if list(license_codes) == ["NEIS"] else "seoul_localdata"
    ref = sources[key]["reference"]
    return {"store_info": {"title": "소상공인 상가(상권)정보", "base": f"{ym[:4]}-{ym[4:]}" if len(ym) == 6 else None, "collected_at": sbiz.get("collected_at")},
            "license": {"title": sources[key]["title"], "collected_at": ref.get("collected_at"), "source_updated": ref.get("source_updated_max")}}


def operation_history(store: dict) -> dict:
    tax = taxonomy.scls_row(store["indsSclsCd"])
    sources = taxonomy.sources()
    coverage = {"status": tax["status"], "label": taxonomy.COVERAGE_LABEL[tax["status"]],
                "license_names": tax["license_names"], "note": tax["note"]}
    is_food = tax["indsLclsCd"] == "I2"
    result = {"coverage": coverage, "link": None, "license": None, "certifications": [], "sources": [],
              "business_status": None, "data_dates": _data_dates(tax["license_codes"] or [])}

    if tax["status"] != "connected":
        result["link"] = {"status": tax["status"], "message": COVERAGE_MESSAGE[tax["status"]]}
        result["certifications"] = _certifications(store, None, is_food)
        result["business_status"] = business_status(tax["status"], None, None, None)
        result["data_dates"]["license"] = None  # 인허가 자료가 연결되지 않은 업종은 인허가 기준일이 없다
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
    closure = closure_evidence(store["bizesId"]) if status == "closed_only" else None
    result["business_status"] = business_status("connected", result["link"], lic, None if lic is None else lic.get("close_date"), closure)
    return result
