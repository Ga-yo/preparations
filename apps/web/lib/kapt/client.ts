import "server-only";

const BASE = "https://apis.data.go.kr/1613000/";

// 서비스키가 URL 쿼리에 실리므로 메시지·cause에 URL·키·원본 예외를 남기지 않는다
export class KaptError extends Error {
  constructor(readonly status: number | null, name: string) {
    super(`K-apt 요청 실패 (${status ?? name})`);
    this.name = name;
  }
}

export async function kaptGet(path: string, params: Record<string, string>): Promise<unknown> {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key) throw new KaptError(null, "MissingKey");
  // 포털 키는 인코딩된 형태로 받는 경우가 있어 수집기(unquote)와 같이 디코딩 후 다시 인코딩한다
  const q = new URLSearchParams({ serviceKey: decodeURIComponent(key), _type: "json", ...params });
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}?${q}`, { signal: AbortSignal.timeout(5000) });
  } catch (e) {
    throw new KaptError(null, e instanceof Error ? e.name : "FetchError");
  }
  if (!res.ok) throw new KaptError(res.status, "HttpError");
  let body: { response?: { header?: { resultCode?: string } } };
  try {
    body = await res.json();
  } catch {
    throw new KaptError(res.status, "ParseError");
  }
  const code = body.response?.header?.resultCode;
  if (code !== "00") throw new KaptError(res.status, `ResultCode${code ?? "Missing"}`);
  return body;
}
