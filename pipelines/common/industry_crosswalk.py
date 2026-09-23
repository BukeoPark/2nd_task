"""소상공인 업종 소분류(indsSclsCd) → 인허가 원천 대응표.

서로 다른 원천의 업종 코드는 같은 값으로 취급하지 않는다. 연결은 반드시 아래 표를 거친다.

상태(status)
  connected       인허가 원천이 연결됨 (매장 연결·주변 개폐업 분석 가능)
  pending         원천은 있으나 인증키·활용신청이 필요해 연동 준비 중 (원천 데이터가 적재되면 connected 로 올라간다)
  not_connected   관련 인허가·등록 제도가 있으나 이번 파일럿에서 원천을 연결하지 못함
  not_applicable  업종 특성상 같은 형태의 매장 인허가 이력이 없음 (기본 매장정보만 제공)

항목 형식: 소분류코드 -> Rule(status, license_codes, uptae, note)
  license_codes : sources.LICENSE_SERVICES / OTHER_LICENSE_CODES 의 코드. 여러 개면 매장 연결 시 모두 후보로 본다.
  uptae         : 주변 분석에서 '같은 업종'으로 볼 인허가 업태명(UPTAENM). None 이면 원천 전체.
명시 항목이 없는 소분류는 GROUP_DEFAULTS(중분류→대분류 순)를 따른다 — 어느 규칙이 적용됐는지는 산출물 rule 열에 남는다.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Rule:
    status: str
    license_codes: tuple[str, ...] = ()
    uptae: tuple[str, ...] | None = None
    note: str = ""


def _lic(*codes: str, uptae: tuple[str, ...] | None = None, note: str = "") -> Rule:
    return Rule("connected", codes, uptae, note)


_GENERAL_RESTAURANT = _lic("072404")
_SNACK_BOTH = _lic("072405", "072404", note="휴게·일반음식점 중 어느 쪽으로도 신고될 수 있어 둘 다 후보")
_FOOD_BOTH = _lic("072404", "072405", note="일반·휴게음식점 중 어느 쪽으로도 신고될 수 있어 둘 다 후보")
_NEIS = Rule("pending", ("NEIS",), note="학원·교습소는 NEIS 학원교습소정보로 확인 — 인증키 필요")

EXPLICIT: dict[str, Rule] = {
    # 음식 ---------------------------------------------------------------
    "I20701": _lic("072404", "072102", note="구내식당은 일반음식점 또는 집단급식소"),
    "I20702": _GENERAL_RESTAURANT,
    "I21001": _lic("072218", "072405", "072404", "072219", note="제과점영업·휴게음식점·일반음식점·즉석판매제조가공업 중 하나로 신고"),
    "I21002": _lic("072219", "072405", "072404", note="떡집은 주로 즉석판매제조가공업으로 신고"),
    "I21005": _SNACK_BOTH, "I21008": _SNACK_BOTH,
    "I21201": _SNACK_BOTH,
    "I21003": _FOOD_BOTH, "I21004": _FOOD_BOTH, "I21006": _FOOD_BOTH, "I21007": _FOOD_BOTH, "I21099": _FOOD_BOTH,
    "I21101": _lic("072302", "072301", note="유흥주점·단란주점"),
    "I21102": _lic("072302"),
    "I21103": _GENERAL_RESTAURANT, "I21104": _GENERAL_RESTAURANT,
    # 숙박 ---------------------------------------------------------------
    "I10101": _lic("031103", "031101"),
    "I10102": _lic("031103", "031101"),
    "I10103": _lic("031104", "031103", note="서울 소재 펜션은 도시민박·숙박업으로 신고되는 경우가 많음"),
    "I10104": _lic("031107"),
    "I10299": _lic("031103", "031104"),
    "I10201": Rule("not_connected", note="고시원은 다중이용업소 등록 대상 — 원천 미연결"),
    # 보건의료 -------------------------------------------------------------
    "Q10101": _lic("010101"), "Q10102": _lic("010101"), "Q10103": _lic("010101", uptae=("치과병원",)),
    "Q10104": _lic("010101", uptae=("한방병원",)), "Q10105": _lic("010101", uptae=("요양병원(일반요양병원)",)),
    "Q10210": _lic("010102", uptae=("치과의원",)),
    "Q10211": _lic("010102", uptae=("한의원",)),
    "Q10402": _lic("010110", note="유사 의료업 중 안마시술소·안마원만 해당"),
    "M11101": _lic("020301"),
    # 소매 중 인허가 대상 --------------------------------------------------------
    "G21501": _lic("010106"),
    "G21602": _lic("010201"),
    "G21502": _lic("010203"),
    "G20701": _lic("114302"),
    "G20509": _lic("072219", note="반찬가게 중 즉석판매제조가공업으로 신고한 경우만 연결됨"),
    "G20503": Rule("not_connected", note="축산물판매업 신고 대상 — 원천 미연결"),
    "G20508": Rule("not_connected", note="건강기능식품판매업 신고 대상 — 원천 코드 판별 불확실로 미연결"),
    "G21401": Rule("not_connected", note="석유판매업 등록 대상 — 원천 미연결"),
    "G21402": Rule("not_connected", note="고압가스 충전 허가 대상 — 원천 미연결"),
    "G21403": Rule("not_connected", note="석유·가스 판매 신고 대상 — 원천 미연결"),
    # 수리·개인 -----------------------------------------------------------
    "S20701": _lic("051801", "051901", note="미용업·이용업"),
    "S20702": _lic("051801", uptae=("피부미용업",)),
    "S20703": _lic("051801", uptae=("네일아트업",)),
    "S20901": _lic("062001"), "S20902": _lic("062001"),
    "S20801": _lic("114401"),
    "S20802": _lic("010110", note="안마시술소·안마원으로 신고된 경우만 연결됨"),
    "S20301": Rule("not_connected", note="자동차관리사업 등록 대상 — 원천 미연결"),
    "S20302": Rule("not_connected", note="세차업 신고 대상 — 원천 미연결"),
    "S21001": Rule("not_connected", note="장례식장업 신고 대상 — 원천 미연결"),
    "S21002": Rule("not_connected", note="장사시설 — 원천 미연결"),
    # 예술·스포츠 ----------------------------------------------------------
    "R10307": _lic("104201"),
    "R10306": _lic("103701"),
    "R10308": _lic("103501"),
    "R10310": _lic("103201"),
    "R10311": _lic("103101"),
    "R10404": _lic("030506", "030507"),
    "R10406": _lic("030505", "030504"),
    "R10407": _lic("030901"),
    "R10402": _lic("031001"),
    "R10309": Rule("not_connected", note="볼링장업 신고 대상 — 원천 미연결"),
    "R10312": Rule("not_connected", note="체육시설 신고 대상 여부가 시설마다 다름 — 원천 미연결"),
    "R10313": Rule("not_connected", note="체육시설 신고 대상 여부가 시설마다 다름 — 원천 미연결"),
    "R10316": Rule("not_connected", note="체육시설 신고 대상 여부가 시설마다 다름 — 원천 미연결"),
    "R10314": Rule("not_connected", note="체육시설 신고 대상 여부가 시설마다 다름 — 원천 미연결"),
    "R10405": Rule("not_connected", note="게임제공업·기타 신고 대상 등 혼재 — 원천 미연결"),
    "R10202": Rule("pending", ("NEIS",), note="독서실은 NEIS 학원교습소정보로 확인 — 인증키 필요"),
    # 교육 ---------------------------------------------------------------
    "P10601": _lic("104101", note="태권도·무술은 체육도장업으로 신고"),
    "P10603": _lic("104201", note="일부만 체력단련장업으로 신고 — 연결 안 되면 '인허가 없음'이 아니라 '연결된 인허가 없음'"),
    "P10501": _NEIS, "P10609": _NEIS, "P10611": _NEIS, "P10613": _NEIS, "P10615": _NEIS,
    "P10617": _NEIS, "P10625": _NEIS, "P10627": _NEIS, "P10629": _NEIS,
    "P10623": Rule("not_connected", note="자동차운전학원 등록 — 원천 미연결"),
    "P10607": Rule("not_connected", note="청소년수련시설 등록 — 원천 미연결"),
    # 시설관리·임대 / 부동산 --------------------------------------------------
    "N10401": _lic("115002", note="유료직업소개소"),
    "N10501": _lic("031201", "031202", "031203"),
    "L10203": Rule("not_connected", note="개업공인중개사 등록 — 원천 미연결"),
}

# 중분류·대분류 기본값. 명시 항목이 없을 때만 쓰인다.
GROUP_DEFAULTS: dict[str, Rule] = {
    # 음식: 한식·중식·일식·서양식·동남아·기타외국 → 일반음식점
    "I201": _GENERAL_RESTAURANT, "I202": _GENERAL_RESTAURANT, "I203": _GENERAL_RESTAURANT,
    "I204": _GENERAL_RESTAURANT, "I205": _GENERAL_RESTAURANT, "I206": _GENERAL_RESTAURANT,
    "Q102": _lic("010102", uptae=("의원",)),
    "M103": Rule("not_applicable", note="개인 자격 등록 업종 — 매장 인허가 이력 해당 없음"),
    "M104": Rule("not_applicable", note="개인 자격 등록 업종 — 매장 인허가 이력 해당 없음"),
    "G2": Rule("not_applicable", note="일반 소매업 — 같은 형태의 인허가 이력이 없어 기본 매장정보만 제공"),
    "I1": Rule("not_connected", note="숙박 세부 업종 원천 미연결"),
    "I2": Rule("not_connected", note="음식 세부 업종 원천 미연결"),
    "L1": Rule("not_applicable", note="같은 형태의 인허가 이력 없음"),
    "M1": Rule("not_applicable", note="전문 서비스업 — 같은 형태의 인허가 이력 없음"),
    "N1": Rule("not_applicable", note="사업 서비스업 — 같은 형태의 인허가 이력 없음"),
    "P1": Rule("not_applicable", note="교육 지원·기타 교육기관 — 학원 등록 대상이 아닌 경우가 많음"),
    "Q1": Rule("not_connected", note="보건의료 세부 업종 원천 미연결"),
    "R1": Rule("not_applicable", note="같은 형태의 인허가 이력 없음"),
    "S2": Rule("not_applicable", note="수리·개인 서비스 — 같은 형태의 인허가 이력 없음"),
}


def resolve(scls_cd: str) -> tuple[Rule, str]:
    """소분류 코드에 적용될 규칙과 그 출처(explicit / group:<코드>)."""
    if scls_cd in EXPLICIT:
        return EXPLICIT[scls_cd], "explicit"
    for prefix in (scls_cd[:4], scls_cd[:2]):
        if prefix in GROUP_DEFAULTS:
            return GROUP_DEFAULTS[prefix], f"group:{prefix}"
    raise KeyError(f"업종 대응표에 규칙이 없는 소분류: {scls_cd}")
