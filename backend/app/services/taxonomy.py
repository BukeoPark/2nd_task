"""공식 업종 분류(대·중·소) 트리와 소분류별 데이터 지원 범위."""
from __future__ import annotations

from app.services import data_store

LEVEL_COLUMNS = {"lcls": ("indsLclsCd", "indsLclsNm"), "mcls": ("indsMclsCd", "indsMclsNm"), "scls": ("indsSclsCd", "indsSclsNm")}

COVERAGE_LABEL = {
    "connected": "인허가 이력 연결",
    "pending": "연동 준비 중",
    "not_connected": "원천 미연결",
    "not_applicable": "해당 인허가 없음",
}


def _taxonomy():
    return data_store.load_parquet("industry_taxonomy.parquet")


def sources() -> dict:
    return data_store.load_json("data_sources.json")


def scls_row(scls_cd: str) -> dict:
    df = _taxonomy()
    row = df.loc[df["indsSclsCd"] == scls_cd]
    if row.empty:
        raise KeyError(scls_cd)
    rec = row.iloc[0].to_dict()
    for col in ("license_codes", "license_names"):
        rec[col] = [] if rec[col] is None else list(rec[col])
    rec["uptae"] = None if rec["uptae"] is None else list(rec["uptae"])
    return rec


def category_tree() -> dict:
    df = _taxonomy()
    tree = []
    for (lcd, lnm), lg in df.groupby(["indsLclsCd", "indsLclsNm"], sort=True):
        mids = []
        for (mcd, mnm), mg in lg.groupby(["indsMclsCd", "indsMclsNm"], sort=True):
            smalls = [
                {"code": r.indsSclsCd, "name": r.indsSclsNm, "store_count": int(r.store_count),
                 "coverage": r.status, "coverage_label": COVERAGE_LABEL[r.status],
                 "license_names": list(r.license_names), "note": r.note}
                for r in mg.sort_values("indsSclsCd").itertuples()
            ]
            mids.append({"code": mcd, "name": mnm, "store_count": int(mg["store_count"].sum()), "children": smalls})
        tree.append({"code": lcd, "name": lnm, "store_count": int(lg["store_count"].sum()), "children": mids})

    coverage = (df.groupby("status").agg(scls=("indsSclsCd", "size"), stores=("store_count", "sum"))
                .reset_index().to_dict(orient="records"))
    for c in coverage:
        c["label"] = COVERAGE_LABEL[c["status"]]
        c["scls"], c["stores"] = int(c["scls"]), int(c["stores"])
    return {
        "standard": sources()["sbiz_upjong"]["reference"],
        "counts": {"lcls": int(df["indsLclsCd"].nunique()), "mcls": int(df["indsMclsCd"].nunique()), "scls": len(df)},
        "coverage": coverage,
        "tree": tree,
    }


def codes_under(level: str, code: str) -> list[str]:
    """선택한 분류(대·중·소) 아래의 소분류 코드 목록. 없는 코드면 KeyError."""
    if level not in LEVEL_COLUMNS:
        raise ValueError(f"level 은 {sorted(LEVEL_COLUMNS)} 중 하나여야 합니다")
    df = _taxonomy()
    hit = df.loc[df[LEVEL_COLUMNS[level][0]] == code, "indsSclsCd"]
    if hit.empty:
        raise KeyError(code)
    return hit.tolist()
