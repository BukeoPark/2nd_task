import hashlib
import zipfile
import pytest
from app.deploy import unpack_bundle


def archive(tmp_path, extra=None):
    file = tmp_path / "data.zip"
    with zipfile.ZipFile(file, "w") as z:
        z.writestr("regions.geojson", "{}")
        z.writestr("stores.parquet", b"test")
        for name, content in (extra or {}).items():
            z.writestr(name, content)
    return file, hashlib.sha256(file.read_bytes()).hexdigest()


def test_verified_data_bundle_is_restored(tmp_path):
    file, sha = archive(tmp_path)
    dest = tmp_path / "processed"
    unpack_bundle(file, dest, sha)
    assert (dest / "stores.parquet").read_bytes() == b"test"


def test_checksum_failure_does_not_write_data(tmp_path):
    file, _ = archive(tmp_path)
    dest = tmp_path / "processed"
    with pytest.raises(ValueError, match="불일치"):
        unpack_bundle(file, dest, "0" * 64)
    assert not dest.exists()


@pytest.mark.parametrize("name", ["../escape.json", "/escape.json", ".env", "nested/file.json"])
def test_bundle_rejects_non_data_and_traversal_before_writing(tmp_path, name):
    file, sha = archive(tmp_path, {name: "secret"})
    dest = tmp_path / "processed"
    with pytest.raises(ValueError):
        unpack_bundle(file, dest, sha)
    assert not dest.exists()


def test_private_image_bundle_does_not_need_external_download(tmp_path, monkeypatch):
    from app.deploy import prepare_data
    from app.config import settings
    file, sha = archive(tmp_path)
    dest = tmp_path / "processed"
    monkeypatch.setattr(settings, "data_bundle_path", file)
    monkeypatch.setattr(settings, "data_bundle_sha256", sha)
    monkeypatch.setattr(settings, "processed_dir", dest)
    monkeypatch.setattr(settings, "data_bundle_url", "")
    prepare_data()
    assert (dest / "stores.parquet").is_file()
