"use client";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import "./hero.css";

// 상태 카드가 차례로 보여 주는 단계. 앱 1~5단계에 실제로 있는 기능만 쓴다
const STEPS = ["예산·대출 한도 계산 중", "취득세·중개보수 계산 중", "실거래가와 예산 비교 중", "후보 단지 조건 비교 중", "정비사업 단계 확인 중"];
const DONE = { title: "구매 전 확인 항목 정리 완료", sub: "5단계 점검 · 확인 필요 2건" };

const Check = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;

function StartButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="chb-btn" disabled={pending}>
      {pending ? "준비하는 중…" : "채비 시작하기"}
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </button>
  );
}

function useStatusTicker() {
  // -1이면 완료 상태. 움직임 줄이기 설정이면 완료 상태로 멈춘다
  const [step, setStep] = useState(-1);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let i = -1;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      i = i + 1 < STEPS.length ? i + 1 : -1;
      setStep(i);
      timer = setTimeout(tick, i === -1 ? 5000 : 1100);
    };
    timer = setTimeout(tick, 2500);
    return () => clearTimeout(timer);
  }, []);
  return step;
}

export function Hero({ start }: { start: () => Promise<void> }) {
  const step = useStatusTicker();
  const video = useRef<HTMLVideoElement>(null);
  // hero.mp4가 아직 없을 수 있어 실제로 로드된 뒤에만 재생 버튼을 보인다
  const [hasVideo, setHasVideo] = useState(false);
  const [paused, setPaused] = useState(true);

  useEffect(() => {
    const v = video.current;
    if (v && window.matchMedia("(prefers-reduced-motion: reduce)").matches) v.removeAttribute("autoplay");
  }, []);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  return (
    <section className="chb-hero">
      <div className="chb-wrap">
        <div>
          <span className="chb-brand"><i aria-hidden="true" />채비</span>
          <h1 className="chb-title">첫 집,<br />혼자 판단하지<br />않도록</h1>
          <p className="chb-lede">
            채비는 내 자금과 소득으로 살 수 있는 예산부터 대출 한도, <span className="chb-nowrap">취득세·중개보수</span>, 실거래가까지 계산해 주는 AI 길잡이예요.
            집을 사기 전 무엇을 준비하고 확인해야 하는지 단계별로 함께 채비해요.
          </p>
          <form action={start} className="chb-ctas">
            <StartButton />
          </form>
          <ul className="chb-checks">
            <li><Check />베타 기간 무료</li>
            <li><Check />중개 수수료 없음</li>
            <li><Check />매물 광고 없음</li>
          </ul>
        </div>

        <div className="chb-visual">
          <div className="chb-glow" aria-hidden="true" />
          <div className="chb-arch">
            <video ref={video} autoPlay muted loop playsInline preload="auto" aria-hidden="true"
              onLoadedData={() => setHasVideo(true)} onPlay={() => setPaused(false)} onPause={() => setPaused(true)}>
              <source src="/hero.mp4" type="video/mp4" />
            </video>
          </div>

          <div className="chb-float chb-f1" aria-hidden="true"><b>@채비 <i /></b><span>후보 단지 3곳 비교 중</span></div>

          <div className="chb-float chb-f2" aria-hidden="true">
            <span><svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg></span>
            <span><svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg></span>
          </div>

          {hasVideo && (
            <button type="button" className="chb-float chb-f3" onClick={toggle} aria-label={paused ? "배경 영상 재생" : "배경 영상 일시정지"}>
              {paused
                ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12l10-6z" /></svg>
                : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12" /></svg>}
              {paused ? "영상 재생" : "영상 정지"}
            </button>
          )}

          <div className="chb-float chb-f4" aria-hidden="true">
            <span className="chb-ic">{step === -1 ? <Check /> : <span className="chb-spin" />}</span>
            <div>
              <b>{step === -1 ? DONE.title : STEPS[step]}</b>
              <small>{step === -1 ? DONE.sub : `${step + 1} / ${STEPS.length} 항목`}</small>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
