"""입지 영향력 분석 — 상권 수요 유형 분류(Phase 2)와 입지 요인·점포당 추정매출 회귀(Phase 3).

실행: .venv/bin/python -m pipelines.transform.build_location_model
입력: data/processed/{trdar,dong}_hinterland, trdar_areas, store_trdar, stores, store_anchor, sales_industry_crosswalk,
      trdar_industry_sales
출력: data/processed/location_features.parquet  상권·행정동 1행 — 직장·상주인구, 직장인구 비중, 수요 유형, 지하철 유무, 앵커 노출
      data/processed/location_model_rows.parquet 상권×업종 1행 — 모델 입력(입지 요인)과 목표값(점포당 추정매출, 로그)
      data/processed/location_model.json         회귀 계수·신뢰구간·교차검증 성능·VIF·제외 건수·변수 정의
      outputs/tables/location_model_{coefficients,log}.csv

분석 단위와 목표값
  - 단위: 서울시 상권 × 서울시 음식 업종(CS1xxxxx). 점포가 MIN_STORES 곳 미만인 분기는 쓰지 않는다.
  - 목표값: 최근 RECENT_QUARTERS 개 분기 점포당 분기 추정매출 평균의 로그. 개별 매장 매출이 아니라 '상권·업종 점포들의 평균'이다.
  - 입지 요인 5개(점포당 매출을 직접 계산하는 데 쓰인 서울시 점포 수는 쓰지 않는다 → 경쟁 밀도는 상가정보(소상공인) 점포 수로 만든다):
      직장인구·상주인구(서울시 상권 영역 안 인구), 지하철역 유무(서울시 집객시설 수), 같은 업종 점포 밀도(상가정보 ÷ 상권 면적), 앵커 노출(스타벅스·다이소 반경 500m 수의 상권 내 매장 평균)
  - 업종 고정효과(업종 더미)를 통제하고, 같은 상권의 여러 업종 행은 상관돼 있으므로 상권 단위 군집 표준오차를 쓴다.

검증(데이터 누수·과대평가 방지)
  - 가까운 상권은 특성이 비슷하므로 행정동 단위 GroupKFold(5분할)로 '처음 보는 동네'를 맞히게 한다. 표준화 기준은 매 분할의 학습 구간에서만 계산해 검증에 그대로 적용한다.
  - 입지 요인을 넣은 모델과 '업종만 넣은 기준 모델'의 검증 R² 를 같이 싣는다. 요인이 기준 모델보다 나아지지 않으면(`useful=false`) 화면은 계수를 참고용으로만 보여준다.
  - 최종 테스트 데이터는 따로 두지 않았다(표본이 상권 150곳 안팎). 계수는 전체 자료로 구하고 성능은 교차검증 값만 보고한다.

해석 한계: 상관이지 인과가 아니다. 상권 평균을 설명할 뿐 특정 매장의 매출을 예측하지 않는다.
"""
from __future__ import annotations

import argparse
import json

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.model_selection import GroupKFold

from pipelines.common import config

MIN_STORES = 3             # 상권×업종×분기 점포 수 최소(서울시 추정매출 비교 기준과 같음)
RECENT_QUARTERS = 4        # 목표값에 쓰는 최근 분기 수
MIN_QUARTERS = 2           # 이만큼 이상의 유효 분기가 있는 행만 쓴다
FOOD_PREFIX = "CS1"        # 서울시 서비스 업종 코드 — 음식
WORKER_TYPE_MIN = 0.60     # 직장인구 ÷ (직장+상주인구) 가 이 이상이면 업무형
RESIDENT_TYPE_MAX = 0.30   # 이 이하이면 주거형, 사이는 혼합형
MIN_ROWS = 60              # 모델 최소 행 수
N_FOLDS = 5
ANCHOR_RADIUS_COL = ("starbucks_cnt_500m", "daiso_cnt_500m")

FEATURES: list[dict] = [
    {"key": "workers", "label": "직장인구", "unit": "명", "definition": "상권 영역 안 직장인구(명) — 로그(1+값)", "source": "서울시 상권분석서비스 직장인구-상권"},
    {"key": "residents", "label": "상주인구", "unit": "명", "definition": "상권 영역 안 상주인구(명) — 로그(1+값)", "source": "서울시 상권분석서비스 상주인구-상권"},
    {"key": "has_subway", "label": "지하철역 있음", "unit": "", "definition": "상권 영역 안 지하철역이 1곳 이상(1) 또는 없음(0). 역까지 거리는 역 좌표가 없어 쓰지 못함", "source": "서울시 상권분석서비스 집객시설-상권"},
    {"key": "comp_density", "label": "같은 업종 점포 밀도", "unit": "곳/㎢", "definition": "상권 안 같은 업종 점포 수(상가정보) ÷ 상권 면적(km²) — 로그(1+값)", "source": "소상공인 상가(상권)정보 + 서울시 상권 영역"},
    {"key": "anchor_500m", "label": "앵커 브랜드 노출", "unit": "곳", "definition": "상권 안 매장의 반경 500m 스타벅스·다이소 점포 수 평균 — 로그(1+값)", "source": "소상공인 상가정보 기반 앵커 연산"},
]
FEATURE_KEYS = [f["key"] for f in FEATURES]
BINARY = {"has_subway"}


# ───────────────────────── 순수 함수(테스트 대상) ─────────────────────────

def worker_share(workers, residents) -> float | None:
    """직장인구 ÷ (직장인구 + 상주인구). 하나라도 없거나 합이 0 이하면 None."""
    if workers is None or residents is None or pd.isna(workers) or pd.isna(residents) or workers + residents <= 0:
        return None
    return float(workers) / float(workers + residents)


def demand_type(share: float | None) -> str | None:
    """직장인구 비중 → 수요 유형. 비중을 모르면 None(분류하지 않음)."""
    if share is None or pd.isna(share):
        return None
    if share >= WORKER_TYPE_MIN:
        return "업무형"
    if share <= RESIDENT_TYPE_MAX:
        return "주거형"
    return "혼합형"


def _design(df: pd.DataFrame, feats: list[str], svc_levels: list[str], mean: pd.Series, sd: pd.Series) -> np.ndarray:
    """[상수, 표준화한 입지 요인, 업종 더미(첫 업종 제외)] 설계행렬. 표준화 기준(mean·sd)은 호출하는 쪽이 정해 넘긴다."""
    z = ((df[feats] - mean) / sd).to_numpy(dtype=float) if feats else np.empty((len(df), 0))
    dummies = np.column_stack([(df["svc_cd"] == s).to_numpy(dtype=float) for s in svc_levels[1:]]) if len(svc_levels) > 1 else np.empty((len(df), 0))
    return np.column_stack([np.ones(len(df)), z, dummies])


def fit_ols_clustered(X: np.ndarray, y: np.ndarray, groups: np.ndarray) -> dict:
    """OLS + 군집 강건 표준오차(CR1). 자유도는 군집 수 - 1."""
    n, k = X.shape
    xtx_inv = np.linalg.pinv(X.T @ X)
    beta = xtx_inv @ X.T @ y
    resid = y - X @ beta
    meat = np.zeros((k, k))
    ids = pd.unique(groups)
    for g in ids:
        m = groups == g
        s = X[m].T @ resid[m]
        meat += np.outer(s, s)
    G = len(ids)
    scale = (G / (G - 1)) * ((n - 1) / (n - k)) if G > 1 and n > k else 1.0
    cov = scale * xtx_inv @ meat @ xtx_inv
    se = np.sqrt(np.clip(np.diag(cov), 0, None))
    with np.errstate(divide="ignore", invalid="ignore"):
        t = np.where(se > 0, beta / se, np.nan)
    df_t = max(G - 1, 1)
    p = 2 * stats.t.sf(np.abs(t), df_t)
    crit = stats.t.ppf(0.975, df_t)
    ss_res, ss_tot = float(resid @ resid), float(((y - y.mean()) ** 2).sum())
    return {"beta": beta, "se": se, "p": p, "lo": beta - crit * se, "hi": beta + crit * se, "r2": 1 - ss_res / ss_tot if ss_tot > 0 else None,
            "n": n, "clusters": G}


def vif(z: pd.DataFrame) -> dict[str, float | None]:
    """각 입지 요인을 나머지 요인으로 설명했을 때의 분산팽창계수. 요인이 하나뿐이면 1."""
    out: dict[str, float | None] = {}
    cols = list(z.columns)
    for c in cols:
        others = [o for o in cols if o != c]
        if not others:
            out[c] = 1.0
            continue
        A = np.column_stack([np.ones(len(z)), z[others].to_numpy(dtype=float)])
        coef, *_ = np.linalg.lstsq(A, z[c].to_numpy(dtype=float), rcond=None)
        res = z[c].to_numpy(dtype=float) - A @ coef
        tot = float(((z[c] - z[c].mean()) ** 2).sum())
        r2 = 1 - float(res @ res) / tot if tot > 0 else 0.0
        out[c] = round(1 / (1 - r2), 3) if r2 < 0.999999 else None
    return out


def grouped_cv(df: pd.DataFrame, feats: list[str], y_col: str, group_col: str, n_folds: int = N_FOLDS) -> dict:
    """행정동 단위 GroupKFold. 표준화 기준은 학습 구간에서만 계산한다. 반환: 검증 R²(요인 모델·기준 모델)와 분할 수."""
    svc_levels = sorted(df["svc_cd"].unique())
    groups = df[group_col].to_numpy()
    n_groups = len(pd.unique(groups))
    folds = min(n_folds, n_groups)
    y = df[y_col].to_numpy(dtype=float)
    pred = {"full": np.full(len(df), np.nan), "base": np.full(len(df), np.nan)}
    for tr, te in GroupKFold(n_splits=folds).split(df, y, groups):
        d_tr, d_te = df.iloc[tr], df.iloc[te]
        mean, sd = d_tr[feats].mean(), d_tr[feats].std(ddof=0).replace(0, 1.0)
        for name, fs in (("full", feats), ("base", [])):
            m, s = (mean[fs], sd[fs]) if fs else (pd.Series(dtype=float), pd.Series(dtype=float))
            Xtr, Xte = _design(d_tr, fs, svc_levels, m, s), _design(d_te, fs, svc_levels, m, s)
            beta = np.linalg.pinv(Xtr.T @ Xtr) @ Xtr.T @ y[tr]
            pred[name][te] = Xte @ beta
    sst = float(((y - y.mean()) ** 2).sum())
    r2 = {k: round(1 - float(((y - p) ** 2).sum()) / sst, 4) for k, p in pred.items()}
    return {"folds": folds, "group_col": group_col, "n_groups": n_groups, "r2_full": r2["full"], "r2_base": r2["base"],
            "delta": round(r2["full"] - r2["base"], 4)}


def fit_model(rows: pd.DataFrame) -> dict:
    """모델 입력 표(상권×업종 행) → 계수·검증·VIF 를 담은 dict. 행이 부족하면 status='insufficient'."""
    if len(rows) < MIN_ROWS:
        return {"status": "insufficient", "rows": len(rows), "min_rows": MIN_ROWS,
                "message": f"모델에 쓸 수 있는 상권×업종 행이 {len(rows)}개(최소 {MIN_ROWS}개 필요)라 회귀분석을 하지 않았습니다."}
    feats = [k for k in FEATURE_KEYS if rows[k].std(ddof=0) > 0]
    dropped = [k for k in FEATURE_KEYS if k not in feats]
    svc_levels = sorted(rows["svc_cd"].unique())
    mean, sd = rows[feats].mean(), rows[feats].std(ddof=0)
    X = _design(rows, feats, svc_levels, mean, sd)
    y = rows["log_per_store_q"].to_numpy(dtype=float)
    fit = fit_ols_clustered(X, y, rows["trdar_cd"].to_numpy())
    cv = grouped_cv(rows, feats, "log_per_store_q", "adongCd")
    z = (rows[feats] - mean) / sd
    coefs = []
    for i, k in enumerate(feats, start=1):
        b, lo, hi = float(fit["beta"][i]), float(fit["lo"][i]), float(fit["hi"][i])
        coefs.append({
            "key": k, "beta": round(b, 4), "se": round(float(fit["se"][i]), 4), "p": round(float(fit["p"][i]), 4),
            "pct_per_sd": round((np.exp(b) - 1) * 100, 1), "pct_lo": round((np.exp(lo) - 1) * 100, 1), "pct_hi": round((np.exp(hi) - 1) * 100, 1),
            "significant": bool(lo > 0 or hi < 0), "direction": "positive" if b > 0 else "negative",
            "mean": round(float(mean[k]), 4), "sd": round(float(sd[k]), 4),
        })
    return {
        "status": "ok", "rows": int(fit["n"]), "clusters": int(fit["clusters"]), "services": len(svc_levels), "r2_in_sample": round(float(fit["r2"]), 4),
        "cv": cv, "useful": bool(cv["delta"] > 0), "coefficients": coefs, "vif": vif(z), "dropped_constant_features": dropped,
        "corr": z.corr().round(3).to_dict(),
    }


# ───────────────────────── 데이터 구성 ─────────────────────────

def _read(name: str) -> pd.DataFrame:
    path = config.PROCESSED_DIR / name
    if not path.exists():
        raise SystemExit(f"입력이 없습니다: data/processed/{name} — 앞 단계 파이프라인(분기 갱신)을 먼저 실행하세요")
    return pd.read_parquet(path)


def build_features(log: list) -> pd.DataFrame:
    """상권·행정동 단위의 수요·접근성 지표와 수요 유형."""
    anchors = _read("store_anchor.parquet")
    anchors["anchor_500m"] = anchors[list(ANCHOR_RADIUS_COL)].sum(axis=1)
    stores = _read("stores.parquet")[["bizesId", "adongCd"]]
    st_trdar = _read("store_trdar.parquet")[["bizesId", "trdar_cd"]]
    a_tr = anchors.merge(st_trdar, on="bizesId").groupby("trdar_cd")["anchor_500m"].mean()
    a_dong = anchors.merge(stores, on="bizesId").groupby("adongCd")["anchor_500m"].mean()

    out = []
    for level, hl_name, cd in (("trdar", "trdar_hinterland.parquet", "trdar_cd"), ("dong", "dong_hinterland.parquet", "adongCd")):
        hl = _read(hl_name)
        df = pd.DataFrame({
            "level": level, "code": hl[cd].astype(str), "workers": hl["wrc_total"], "residents": hl["repop_total"],
            "fac_subway": hl["fac_subway"],
        })
        df["has_subway"] = np.where(df["fac_subway"].isna(), np.nan, (df["fac_subway"] > 0).astype(float))
        df["worker_share"] = [worker_share(a, b) for a, b in zip(df["workers"], df["residents"])]
        df["demand_type"] = [demand_type(s) for s in df["worker_share"]]
        amap = a_tr if level == "trdar" else a_dong
        df["anchor_500m"] = df["code"].map(amap)
        if level == "trdar":
            ta = _read("trdar_areas.parquet").set_index("trdar_cd")
            df["name"] = df["code"].map(ta["trdar_nm"])
            df["adongCd"] = df["code"].map(ta["adongCd"])
            df["area_km2"] = df["code"].map(ta["area_m2"]) / 1e6
        else:
            df["name"] = df["code"].map(_read("dong_crosswalk.parquet").set_index("adongCd")["dong_nm"])
            df["adongCd"] = df["code"]
            df["area_km2"] = np.nan
        counts = df["demand_type"].value_counts()
        for t in ("업무형", "혼합형", "주거형"):
            log.append({"step": f"{level} 수요 유형", "item": t, "count": int(counts.get(t, 0))})
        log.append({"step": f"{level} 수요 유형", "item": "직장·상주인구 없음(분류 안 함)", "count": int(df["demand_type"].isna().sum())})
        out.append(df)
    res = pd.concat(out, ignore_index=True)
    return res.sort_values(["level", "code"]).reset_index(drop=True)


def build_model_rows(features: pd.DataFrame, log: list) -> pd.DataFrame:
    """상권×음식 업종 행 — 목표값(점포당 매출 로그)과 입지 요인."""
    sales = _read("trdar_industry_sales.parquet")
    sales = sales.loc[sales["svc_cd"].str.startswith(FOOD_PREFIX)]
    quarters = sorted(sales["quarter"].unique())[-RECENT_QUARTERS:]
    log.append({"step": "목표값", "item": f"사용 분기 {quarters[0]}~{quarters[-1]}", "count": len(quarters)})
    recent = sales.loc[sales["quarter"].isin(quarters)]
    ok = recent["per_store_q"].notna() & (recent["per_store_q"] > 0) & (recent["stores"] >= MIN_STORES)
    log.append({"step": "목표값", "item": "제외: 점포 수 부족·매출 결측 분기 행", "count": int((~ok).sum())})
    agg = recent.loc[ok].groupby(["trdar_cd", "svc_cd", "svc_nm"], as_index=False).agg(per_store_q=("per_store_q", "mean"), n_quarters=("quarter", "nunique"))
    short = agg["n_quarters"] < MIN_QUARTERS
    log.append({"step": "목표값", "item": f"제외: 유효 분기 {MIN_QUARTERS}개 미만 상권×업종", "count": int(short.sum())})
    agg = agg.loc[~short].copy()
    agg["log_per_store_q"] = np.log(agg["per_store_q"])

    tr = features.loc[features["level"] == "trdar"].set_index("code")
    agg["workers"] = agg["trdar_cd"].map(tr["workers"])
    agg["residents"] = agg["trdar_cd"].map(tr["residents"])
    agg["has_subway"] = agg["trdar_cd"].map(tr["has_subway"])
    agg["anchor_500m"] = agg["trdar_cd"].map(tr["anchor_500m"])
    agg["adongCd"] = agg["trdar_cd"].map(tr["adongCd"])
    agg["area_km2"] = agg["trdar_cd"].map(tr["area_km2"])

    # 같은 업종 점포 밀도: 상가정보 점포를 서울시 업종(svc)으로 옮겨 상권별로 센다(중복 등록은 1곳).
    cw = _read("sales_industry_crosswalk.parquet")
    cw = cw.loc[cw["svc_cd"].notna(), ["indsSclsCd", "svc_cd"]]
    st = _read("stores.parquet")[["bizesId", "bizesNm", "rdnmAdr", "indsSclsCd", "indsSclsNm"]].merge(_read("store_trdar.parquet")[["bizesId", "trdar_cd"]], on="bizesId")
    st = st.drop_duplicates(["bizesNm", "rdnmAdr", "indsSclsNm"]).merge(cw, on="indsSclsCd")
    cnt = st.groupby(["trdar_cd", "svc_cd"]).size().rename("comp_n").reset_index()
    agg = agg.merge(cnt, on=["trdar_cd", "svc_cd"], how="left")
    agg["comp_n"] = agg["comp_n"].fillna(0)
    agg["comp_density"] = agg["comp_n"] / agg["area_km2"]

    need = ["workers", "residents", "has_subway", "anchor_500m", "comp_density", "adongCd"]
    missing = agg[need].isna().any(axis=1)
    log.append({"step": "입지 요인", "item": "제외: 직장·상주인구·지하철·앵커·면적 중 결측", "count": int(missing.sum())})
    agg = agg.loc[~missing].copy()
    for k, src in (("workers", "workers"), ("residents", "residents"), ("comp_density", "comp_density"), ("anchor_500m", "anchor_500m")):
        agg[k] = np.log1p(agg[src].astype(float))
    agg["has_subway"] = agg["has_subway"].astype(float)
    log.append({"step": "모델 입력", "item": "상권×업종 행", "count": len(agg)})
    log.append({"step": "모델 입력", "item": "상권 수", "count": int(agg["trdar_cd"].nunique())})
    log.append({"step": "모델 입력", "item": "업종 수", "count": int(agg["svc_cd"].nunique())})
    return agg.sort_values(["svc_cd", "trdar_cd"]).reset_index(drop=True)


def build(log: list) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    features = build_features(log)
    rows = build_model_rows(features, log)
    model = fit_model(rows)
    model["features"] = FEATURES
    model["thresholds"] = {"worker_type_min": WORKER_TYPE_MIN, "resident_type_max": RESIDENT_TYPE_MAX}
    model["target"] = {"name": "점포당 분기 추정매출(로그)", "recent_quarters": RECENT_QUARTERS, "min_stores": MIN_STORES, "min_quarters": MIN_QUARTERS}
    return features, rows, model


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.parse_args()
    log: list[dict] = []
    features, rows, model = build(log)
    p_feat, p_rows, p_json = (config.PROCESSED_DIR / n for n in ("location_features.parquet", "location_model_rows.parquet", "location_model.json"))
    features.to_parquet(p_feat, index=False)
    rows.to_parquet(p_rows, index=False)
    p_json.write_text(json.dumps(model, ensure_ascii=False, indent=2), encoding="utf-8")
    pd.DataFrame(log).to_csv(config.TABLES_DIR / "location_model_log.csv", index=False)
    if model["status"] == "ok":
        pd.DataFrame(model["coefficients"]).to_csv(config.TABLES_DIR / "location_model_coefficients.csv", index=False)
    for p in (p_feat, p_rows, p_json):
        print(f"[done] {p.relative_to(config.ROOT)}")
    for r in log:
        print(f"  {r['step']}: {r['item']} {r['count']}")
    if model["status"] == "ok":
        cv = model["cv"]
        print(f"  검증 R²(행정동 {cv['n_groups']}곳 분할 {cv['folds']}회): 요인 모델 {cv['r2_full']} / 업종만 {cv['r2_base']} (차이 {cv['delta']})")
        for c in model["coefficients"]:
            print(f"  {c['key']}: +1SD → {c['pct_per_sd']:+.1f}% (95% {c['pct_lo']:+.1f}~{c['pct_hi']:+.1f}, p={c['p']})")
    else:
        print(f"  {model['message']}")


if __name__ == "__main__":
    main()
