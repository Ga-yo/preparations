import { StartButton } from "./Hero";
import "./how.css";

// 홈 첫 화면 아래 "이용 방법". 앱 1~5단계·리포트에 실제로 있는 기능만 쓴다.
// 숫자는 계산 결과가 아니라 보여 주기용 예시(연소득 6,200만·현금 1.4억·대출 3.8억, 연 4%·30년 원리금균등이면 월 약 181만 원)
type Row = { k: string; v: string } | { check: string };
const STEPS: { stages: string; title: string; body: string; rows: Row[] }[] = [
  {
    stages: "1~2단계", title: "내 상황 입력",
    body: "소득, 보유 자금, 원하는 지역과 생활 조건을 한 번만 입력해요.",
    rows: [{ k: "연소득", v: "6,200만 원" }, { k: "보유 자금", v: "1억 4천만 원" }, { k: "출퇴근", v: "강남역 근처" }],
  },
  {
    stages: "3~4단계", title: "예산 안에서 후보 찾기",
    body: "대출 한도와 취득세·중개보수를 계산하고, 실거래가로 조건에 맞는 단지를 찾아요.",
    rows: [{ k: "구매 가능 예산", v: "약 5억 원" }, { k: "예상 월 상환", v: "약 181만 원" }, { k: "조건에 맞는 단지", v: "12곳" }],
  },
  {
    stages: "5단계 · 리포트", title: "비교하고 확인하기",
    body: "관심 단지를 나란히 비교하고, 사기 전에 확인할 것을 리포트로 받아요.",
    rows: [{ check: "계약 전에 확인할 서류" }, { check: "대출 미리 상담하기" }, { check: "주택 구매 절차" }],
  },
];

export function HowItWorks({ start }: { start: () => Promise<void> }) {
  return (
    <section className="chb-how" aria-labelledby="chb-how-title">
      <div className="chb-how-wrap">
        <p className="chb-how-eyebrow">이용 방법</p>
        <h2 id="chb-how-title" className="chb-how-title">내 상황을 알려 주면,<br />나머지는 채비가 정리해요.</h2>
        <ol className="chb-how-grid">
          {STEPS.map((s, i) => (
            <li key={s.title} className="chb-how-card">
              <p className="chb-how-step">STEP {i + 1} <span>· {s.stages}</span></p>
              <h3>{s.title}</h3>
              <p className="chb-how-body">{s.body}</p>
              <div className="chb-how-box">
                <span className="chb-how-tag">예시</span>
                <ul>
                  {s.rows.map((r) => "check" in r
                    ? <li key={r.check} className="chb-how-check"><span aria-hidden="true" />{r.check}</li>
                    : <li key={r.k}><span>{r.k}</span><b>{r.v}</b></li>)}
                </ul>
              </div>
            </li>
          ))}
        </ol>
        <form action={start} className="chb-how-cta">
          <StartButton />
        </form>
      </div>
    </section>
  );
}
