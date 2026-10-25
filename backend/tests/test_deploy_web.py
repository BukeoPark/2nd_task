from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.web import mount_frontend


def test_same_origin_frontend_routes_and_api(tmp_path):
    (tmp_path / "index.html").write_text("<html>상권분석</html>")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app.js").write_text("console.log('ok')")
    app = FastAPI()
    @app.get("/api/test")
    def api():
        return {"ok": True}
    mount_frontend(app, tmp_path)
    client = TestClient(app)
    assert "상권분석" in client.get("/map?mode=founder").text
    assert client.get("/assets/app.js").status_code == 200
    assert client.get("/api/test").json() == {"ok": True}
    assert client.get("/api/unknown").status_code == 404
    assert client.get("/.env").status_code == 404
    assert client.get("/assets/missing.js").status_code == 404
    assert client.post("/map").status_code == 405


def test_missing_frontend_build_is_reported(tmp_path):
    import pytest
    with pytest.raises(RuntimeError, match="빌드"):
        mount_frontend(FastAPI(), tmp_path)
