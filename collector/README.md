
## 실행

```
cd collector
uv run --env-file .env python main.py regions
uv run pytest -v
```

`.env.example`을 복사해 `.env`를 만든다 (커밋 금지). `db.client()`는 환경변수만 읽는다.

## 대출 상품 (FSS) 가짜 데이터

`FSS_API_KEY`가 없을 때는 `FSS_DUMMY=1 uv run python main.py loan_products_fss`로
`tests/fixtures/fss_mortgage_dummy.json`(가짜 은행·금리, source='DUMMY(테스트용 가짜 데이터)')을 적재한다.
로컬 DB에서만 쓸 것. 키가 있는 실행은 `dummy:*` 행을 모두 종료(end_date)하므로 실제 데이터가 가짜를 자동 대체한다.
