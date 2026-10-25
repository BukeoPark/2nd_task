"""가공 데이터만 배포용 ZIP으로 묶는다. 원본·키·사용자 캐시는 포함하지 않는다."""
from pathlib import Path
import hashlib
import zipfile

ROOT = Path(__file__).resolve().parents[1]

if __name__ == "__main__":
    source = ROOT / "data" / "processed"
    target = ROOT / ".deploy" / "analysis-data.zip"
    files = sorted(p for p in source.iterdir() if p.is_file() and p.suffix in {".parquet", ".json", ".geojson"})
    if not files:
        raise SystemExit("가공 데이터가 없습니다.")
    target.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
        for path in files:
            bundle.write(path, path.name)
    with target.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    print(f"파일: {target.name} / {len(files)}개 / {target.stat().st_size:,} bytes")
    print(f"DATA_BUNDLE_SHA256={digest}")
