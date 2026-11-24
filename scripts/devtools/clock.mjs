// 画面の時計を決まった起点から進める（記録と通しの確かめで、画面の相対時刻「3 分前」などを毎回そろえる）。
// CDP の Page.addScriptToEvaluateOnNewDocument に渡し、読み込み直してから使う

/** 画面の Date を「now ＋ 読み込んでからの経過」に替える文（引数なしの new Date()・Date()・Date.now() だけを替え、ほかはそのまま） */
export function fixedClockSource(now) {
  return `(() => {
  const RealDate = Date;
  const offset = ${Number(now)} - RealDate.now();
  const current = () => RealDate.now() + offset;
  globalThis.Date = new Proxy(RealDate, {
    construct: (target, args, newTarget) => Reflect.construct(target, args.length ? args : [current()], newTarget),
    apply: () => new RealDate(current()).toString(),
    get: (target, key, receiver) => (key === "now" ? current : Reflect.get(target, key, receiver)),
  });
})();`;
}
