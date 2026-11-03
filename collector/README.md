
## 실행

```
cd collector
uv run --env-file .env python main.py regions
uv run pytest -v
```

`.env.example`을 복사해 `.env`를 만든다 (커밋 금지). `db.client()`는 환경변수만 읽는다.
`loan_products_fss` job은 아직 없다.
