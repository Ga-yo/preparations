const block = "animate-pulse rounded-lg bg-chb-line";

export function DetailSkeleton() {
  return (
    <section aria-busy="true" className="rounded-3xl border border-chb-line bg-white p-6">
      <span className="sr-only">상세를 불러오는 중</span>
      <div aria-hidden="true" className="space-y-3">
        <div className={`${block} h-7 w-2/3`} />
        <div className={`${block} h-4 w-1/2`} />
        <div className={`${block} h-9 w-3/5`} />
        <div className={`${block} h-6 w-4/5`} />
        <div className={`${block} mt-4 h-11 w-full`} />
        <div className={`${block} h-24 w-full`} />
        <div className={`${block} h-24 w-full`} />
        <div className={`${block} h-16 w-full`} />
        <div className={`${block} h-16 w-full`} />
      </div>
    </section>
  );
}
