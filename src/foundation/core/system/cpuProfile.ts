// CPU プロファイルの取り方と集計（性能の記録。メインプロセスの診断と、コアのプロセスの診断で同じもの。Electron に依らない純粋関数）

/** Chrome の CPU プロファイル（Profiler.stop の profile。.cpuprofile として保存すると、Chrome の開発者ツールで開ける） */
export interface CpuProfile {
  nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number } }[];
  samples: number[];
  /** 各サンプルの前のサンプルからの時間（マイクロ秒） */
  timeDeltas: number[];
}

/** Chrome の開発者ツールのプロトコルの命令を送る関数（画面はデバッガの sendCommand、メインプロセスは inspector の post） */
export type ProtocolSend = (method: string, params?: object) => Promise<unknown>;

/** CPU プロファイルで、いま実行している関数を記録する間隔（マイクロ秒。1 ミリ秒ごと） */
const SAMPLING_INTERVAL_US = 1000;

/** CPU プロファイルを取り始める（画面とメインプロセスで同じ取り方）。返した関数で止めて、プロファイルを返す */
export async function startCpuProfile(send: ProtocolSend): Promise<() => Promise<CpuProfile>> {
  await send("Profiler.enable");
  await send("Profiler.setSamplingInterval", { interval: SAMPLING_INTERVAL_US });
  await send("Profiler.start");
  return async () => ((await send("Profiler.stop")) as { profile: CpuProfile }).profile;
}

/** 時間を使った関数（自分の中で使った時間。呼んだ先の時間は含まない） */
export interface ProfileHotspot {
  /** 関数の名前（無名なら (anonymous)、(program) は描画など JavaScript の外、(idle) は空き時間） */
  name: string;
  /** ファイル名と行（1 始まり。分からなければ空） */
  where: string;
  selfMs: number;
  /** 記録した時間のうちの割合（%。空き時間を除いた時間に対して） */
  percent: number;
}

/** 空き時間など、関数として数えないもの */
const NOT_WORK = new Set(["(idle)"]);

/** 自分の中で時間を使った関数の上位（同じ関数は 1 つにまとめる） */
export function topSelfTime(profile: CpuProfile, limit = 30): ProfileHotspot[] {
  const byId = new Map(profile.nodes.map((n) => [n.id, n.callFrame]));
  const totals = new Map<string, { name: string; where: string; us: number }>();
  let busy = 0;
  profile.samples.forEach((id, i) => {
    const frame = byId.get(id);
    if (!frame) return;
    const us = profile.timeDeltas[i] ?? 0;
    const name = frame.functionName || "(anonymous)";
    if (NOT_WORK.has(name)) return;
    busy += us;
    const file = frame.url ? frame.url.split("/").pop()!.split("?")[0] : "";
    const where = file ? `${file}:${frame.lineNumber + 1}` : "";
    const key = `${name}@${where}`;
    const entry = totals.get(key) ?? { name, where, us: 0 };
    entry.us += us;
    totals.set(key, entry);
  });
  return [...totals.values()]
    .sort((a, b) => b.us - a.us)
    .slice(0, limit)
    .map((e) => ({ name: e.name, where: e.where, selfMs: Math.round(e.us / 1000), percent: busy ? Math.round((e.us / busy) * 1000) / 10 : 0 }));
}

