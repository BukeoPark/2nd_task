"""입지 영향력 모델 — 수요 유형 분류와 회귀·검증 함수의 동작.

실행: .venv/bin/python -m pytest pipelines/tests/test_build_location_model.py
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from pipelines.transform import build_location_model as m


def test_worker_share_and_demand_type_boundaries():
    assert m.worker_share(60, 40) == pytest.approx(0.6)
    assert m.worker_share(None, 10) is None and m.worker_share(0, 0) is None and m.worker_share(float("nan"), 5) is None
    assert m.demand_type(0.6) == "업무형" and m.demand_type(0.59) == "혼합형"
    assert m.demand_type(0.3) == "주거형" and m.demand_type(0.31) == "혼합형"
    assert m.demand_type(None) is None


def _synthetic(n_dong: int = 30, per_dong: int = 8, seed: int = 0, effect: float = 0.5) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    for d in range(n_dong):
        dong_effect = rng.normal(0, 0.3)
        for t in range(per_dong):
            x = rng.normal()
            for svc in ("CS100001", "CS100002"):
                rows.append({"adongCd": f"d{d}", "trdar_cd": f"d{d}t{t}", "svc_cd": svc, "workers": x, "residents": rng.normal(),
                             "has_subway": float(rng.random() < 0.2), "comp_density": rng.normal(), "anchor_500m": rng.normal(),
                             "log_per_store_q": 10 + (0.2 if svc == "CS100002" else 0) + effect * x + dong_effect + rng.normal(0, 0.3)})
    return pd.DataFrame(rows)


def test_fit_recovers_known_effect_and_flags_noise_features():
    df = _synthetic()
    res = m.fit_model(df)
    assert res["status"] == "ok"
    by = {c["key"]: c for c in res["coefficients"]}
    sd = df["workers"].std(ddof=0)
    assert by["workers"]["beta"] == pytest.approx(0.5 * sd, abs=0.08)       # 표준화 계수 = 효과 × SD
    assert by["workers"]["significant"] and by["workers"]["direction"] == "positive"
    assert not by["residents"]["significant"]                                  # 효과 없는 요인은 유의하지 않음
    assert res["useful"] and res["cv"]["delta"] > 0
    assert res["clusters"] == df["trdar_cd"].nunique()


def test_cv_does_not_reward_pure_noise():
    df = _synthetic(effect=0.0, seed=1)
    cv = m.grouped_cv(df, m.FEATURE_KEYS, "log_per_store_q", "adongCd")
    assert cv["delta"] < 0.02, "효과가 없는 자료에서 요인 모델이 검증 성능을 올리면 누수 의심"
    assert cv["folds"] == 5 and cv["n_groups"] == 30


def test_cv_folds_keep_each_dong_in_one_fold():
    from sklearn.model_selection import GroupKFold
    df = _synthetic()
    for tr, te in GroupKFold(n_splits=5).split(df, groups=df["adongCd"]):
        assert not (set(df.iloc[tr]["adongCd"]) & set(df.iloc[te]["adongCd"]))


def test_vif_flags_collinearity():
    rng = np.random.default_rng(2)
    a = rng.normal(size=200)
    z = pd.DataFrame({"a": a, "b": a + rng.normal(0, 0.05, 200), "c": rng.normal(size=200)})
    v = m.vif(z)
    assert v["a"] > 50 and v["b"] > 50 and v["c"] < 2


def test_too_few_rows_returns_insufficient_without_fitting():
    res = m.fit_model(_synthetic(n_dong=2, per_dong=2))
    assert res["status"] == "insufficient" and res["rows"] < m.MIN_ROWS and "회귀분석을 하지 않았습니다" in res["message"]


def test_constant_feature_is_dropped_not_crashed():
    df = _synthetic()
    df["has_subway"] = 0.0
    res = m.fit_model(df)
    assert res["status"] == "ok" and "has_subway" in res["dropped_constant_features"]
    assert "has_subway" not in {c["key"] for c in res["coefficients"]}
