import pandas as pd
from pipelines.transform.build_sales_timeseries import merge_sales_stores

def test_store_only_rows_survive_with_names_zero_and_missing_sales():
    key = ["STDR_YYQU_CD", "TRDAR_CD", "SVC_INDUTY_CD"]
    base = {"STDR_YYQU_CD":"20262", "SVC_INDUTY_CD":"CS100001", "TRDAR_CD_NM":"상권", "SVC_INDUTY_CD_NM":"한식"}
    sales = pd.DataFrame([{**base,"TRDAR_CD":"sales_only","THSMON_SELNG_AMT":100}, {**base,"TRDAR_CD":"both","THSMON_SELNG_AMT":200}])
    stores = pd.DataFrame([{**base,"TRDAR_CD":code,"SIMILR_INDUTY_STOR_CO":3,"OPBIZ_STOR_CO":0,"CLSBIZ_STOR_CO":1} for code in ["both","stores_only"]])
    out = merge_sales_stores(sales, stores, key, "TRDAR_CD_NM", ["SIMILR_INDUTY_STOR_CO","OPBIZ_STOR_CO","CLSBIZ_STOR_CO"]).set_index("TRDAR_CD")
    assert len(out)==3
    assert pd.isna(out.loc["stores_only","THSMON_SELNG_AMT"])
    assert out.loc["stores_only","TRDAR_CD_NM"]=="상권"
    assert out.loc["stores_only","OPBIZ_STOR_CO"]==0
    assert out.loc["stores_only","CLSBIZ_STOR_CO"]==1
    assert out.loc["both","THSMON_SELNG_AMT"]==200
    assert pd.isna(out.loc["sales_only","SIMILR_INDUTY_STOR_CO"])
