from datetime import date

import pandas as pd
import PublicDataReader as pdr

from lib import db


def _s(v):
    return None if pd.isna(v) or not str(v).strip() else str(v).strip()


def transform(df: pd.DataFrame) -> list[dict]:
    rows = []
    for _, x in df.iterrows():
        sido, sigungu, emd, ri = _s(x["시도명"]), _s(x["시군구명"]), _s(x["읍면동명"]), _s(x["동리명"])
        rows.append({
            "code": str(x["법정동코드"]), "sido": sido, "sigungu": sigungu,
            "eupmyeondong": emd, "ri": ri,
            "full_name": " ".join(p for p in (sido, sigungu, emd, ri) if p),
            "is_active": _s(x["말소일자"]) is None,  # 말소일자 있으면 폐지 코드
        })
    return rows


def source_as_of(df: pd.DataFrame) -> date:
    # 데이터 기준일 = 목록에 나타난 가장 늦은 생성/말소일자
    d = pd.to_datetime(pd.concat([df["생성일자"], df["말소일자"]]).dropna(), format="%Y%m%d")
    return d.max().date()


def run() -> None:
    df = pdr.code_bdong()
    rows = transform(df)
    n = db.upsert_rows("regions", rows, on_conflict="code")  # upsert only: FK 참조 유지
    db.mark_freshness("regions", source_as_of(df), "PublicDataReader code_bdong (행정표준코드관리시스템)",
                      f"{n} rows, {sum(r['is_active'] for r in rows)} active")
    print(f"regions: {n} rows")
