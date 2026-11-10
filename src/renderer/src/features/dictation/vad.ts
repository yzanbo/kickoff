// 声の始まりと終わりの見分け（純粋関数）: マイクの音量（RMS）を少しずつ渡し、話し始めた・話し終わった（黙った）を返す。
// 音声モードの「黙ったら送る」・読み上げ中に話したら止める・音声入力の「1 分声がなければ止める」で使う

export interface VadOptions {
  /** これより小さい音量は、まわりの音がどれだけ静かでも声とみなさない */
  floor: number;
  /** まわりの音（雑音）の何倍を声とみなすか */
  ratio: number;
  /** この長さ続けて声の大きさなら、話し始めたとみなす（咳・物音で始めない） */
  minSpeechMs: number;
  /** 話し始めたあと、この長さ黙ったら話し終わったとみなす */
  silenceMs: number;
}

/** 音声モードの聞き取り（1.5 秒黙ったら送る） */
export const LISTEN_VAD: VadOptions = { floor: 0.012, ratio: 3, minSpeechMs: 150, silenceMs: 1500 };

/** 読み上げ中の割り込み（スピーカーの音を拾っても止まらないよう、大きく・長めに話したときだけ） */
export const BARGE_IN_VAD: VadOptions = { floor: 0.05, ratio: 6, minSpeechMs: 400, silenceMs: 1500 };

export interface VadState {
  /** まわりの音の大きさ（声でないときの音量をならしたもの） */
  noise: number;
  speaking: boolean;
  /** 声の大きさが続いている始まり・黙っている始まり */
  aboveSince: number | null;
  belowSince: number | null;
  /** 一度でも話し始めたか */
  heard: boolean;
  /** 最後に声を聞いた時刻（まだなら始めた時刻） */
  lastVoiceAt: number;
}

export type VadEvent = "start" | "end" | null;

export const initialVad = (now: number, noise = 0.004): VadState => ({ noise, speaking: false, aboveSince: null, belowSince: null, heard: false, lastVoiceAt: now });

/** 声とみなす音量 */
export const vadThreshold = (state: VadState, opts: VadOptions) => Math.max(opts.floor, state.noise * opts.ratio);

/** 音量 1 つを足して、次の状態と、話し始めた（start）・話し終わった（end）を返す */
export function vadStep(state: VadState, level: number, now: number, opts: VadOptions): { state: VadState; event: VadEvent } {
  const loud = level >= vadThreshold(state, opts);
  if (loud) {
    // 声の大きさの間も、まわりの音はごくゆっくり追う（ずっと鳴っている雑音を、いつまでも声とみなさない。10 秒ほどでなじむ）
    const noise = state.noise * 0.995 + level * 0.005;
    const aboveSince = state.aboveSince ?? now;
    const starts = !state.speaking && now - aboveSince >= opts.minSpeechMs;
    const speaking = state.speaking || starts;
    return {
      state: { ...state, noise, aboveSince, belowSince: null, speaking, heard: state.heard || speaking, lastVoiceAt: speaking ? now : state.lastVoiceAt },
      event: starts ? "start" : null,
    };
  }
  // 声でないときは、まわりの音の大きさを速めにならして追う
  const noise = state.noise * 0.95 + level * 0.05;
  if (!state.speaking) return { state: { ...state, noise, aboveSince: null }, event: null };
  const belowSince = state.belowSince ?? now;
  if (now - belowSince >= opts.silenceMs) {
    return { state: { ...state, noise, aboveSince: null, belowSince: null, speaking: false }, event: "end" };
  }
  return { state: { ...state, noise, aboveSince: null, belowSince }, event: null };
}
