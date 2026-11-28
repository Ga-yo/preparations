import { StartButton } from "./Hero";
import "./closing.css";

// 홈 맨 아래 마무리 배너. 끝까지 읽은 사람에게 시작 버튼을 한 번 더 보여 준다
export function ClosingCta({ start }: { start: () => Promise<void> }) {
  return (
    <section className="chb-end" aria-labelledby="chb-end-title">
      <div className="chb-end-band">
        <div className="chb-end-rings" aria-hidden="true" />
        <div className="chb-end-text">
          <p className="chb-end-eyebrow">첫 집 채비</p>
          <h2 id="chb-end-title" className="chb-end-title">좋은 집을 고르는 일,<br />좋은 시작이 될 수 있도록.</h2>
        </div>
        <form action={start}>
          <StartButton className="chb-btn chb-btn-light" />
        </form>
      </div>
    </section>
  );
}
