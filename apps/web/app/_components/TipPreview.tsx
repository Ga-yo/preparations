import "./tip-preview.css";

// 홈 "TIP 미리보기". 문구는 tips 테이블의 짧은 TIP(ltv-dsr, 20261124100100_tips_short_copy.sql)과 같게 둔다.
// 오른쪽은 1단계 연 소득 입력 칸과 TIP이 펼쳐진 모습을 흉내 낸 그림이라 스크린 리더에는 숨기지 않고 글로 읽힌다
const TERMS = ["LTV·DSR", "실거래가와 호가", "전용면적", "역세권·학세권", "용적률·건폐율", "재건축 사업 단계"];

export function TipPreview() {
  return (
    <section className="chb-tip" aria-labelledby="chb-tip-title">
      <div className="chb-tip-wrap">
        <div>
          <p className="chb-tip-eyebrow">TIP</p>
          <h2 id="chb-tip-title" className="chb-tip-title">모르는 용어는<br />입력 칸 바로 옆에서.</h2>
          <p className="chb-tip-lede">
            처음 듣는 말이 나와도 따로 찾아볼 필요 없어요. 입력 칸마다 TIP이 붙어 있어서, 짧게 읽고 바로 고를 수 있어요.
          </p>
          <ul className="chb-tip-terms" aria-label="TIP으로 알려 주는 용어 예">
            {TERMS.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </div>

        <figure className="chb-tip-mock" aria-label="1단계 입력 칸에 TIP이 펼쳐진 예시">
          <p className="chb-tip-label">연 소득 <span>개인 또는 부부 합산</span></p>
          <div className="chb-tip-input"><span>6,200</span><span>만 원</span></div>
          <span className="chb-tip-pill">TIP <span aria-hidden="true">▴</span></span>
          <div className="chb-tip-card">
            <p className="chb-tip-card-title">LTV·DSR, 뭐가 다를까요?</p>
            <p>LTV는 집값을 기준으로, DSR은 내 소득을 기준으로 대출 한도를 정해요. 실제 한도는 둘 중 더 작은 쪽이에요.</p>
            <p className="chb-tip-card-note">알아두기: 지역·보유 주택 수·생애최초 여부에 따라 기준이 달라져요.</p>
          </div>
        </figure>
      </div>
    </section>
  );
}
