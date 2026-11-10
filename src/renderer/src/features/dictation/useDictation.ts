import { useEffect, useRef, useState } from "react";
import { api } from "@/api";
import { errorMessage } from "@shared/errors";
import { openSettings } from "@/features/settings/openSettings";
import { micErrorMessage } from "./dictationText";
import { startRecording, watchLevel, type Recording } from "./recorder";
import { initialVad, LISTEN_VAD, vadStep } from "./vad";
import { useVoiceStatus, voiceStatusStore } from "@/stores/voice";

/** これより長く押していたら長押し（離したところで止めて起こす）。短ければ 1 回押し（もう一度押すまで録る） */
export const HOLD_MS = 400;

/** 声が聞こえないまま、これだけたったら録音を止める */
const SILENCE_STOP_MS = 60_000;

/** 音声入力の状態（録音の準備中 → 録音中 → 文字起こし中 → 入れたら idle。失敗したら error で、録った音声があれば起こし直せる） */
export type DictationState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "recording"; startedAt: number }
  | { kind: "transcribing" }
  | { kind: "error"; message: string; audio?: Blob; send?: boolean };

export type Dictation = ReturnType<typeof useDictation>;

/**
 * チャット欄の音声入力。1 回押して話し、話し終わったらもう一度押す（toggle）か、押したまま話して離す（press / release）。
 * onText に起こした文を渡す（send なら、入れてそのまま送る）。準備ができていなければ、設定の「音声入力」を開く。
 * 声が 1 分聞こえなければ止める（話していればそこまでを起こし、一度も話していなければ何も入れない）
 */
export function useDictation({ onText }: { onText: (text: string, send: boolean) => void }) {
  const status = useVoiceStatus().data;
  const [state, setState] = useState<DictationState>({ kind: "idle" });
  const recording = useRef<Recording | null>(null);
  // 音量の見張り（声が聞こえないまま 1 分たったら止める）
  const stopWatch = useRef<(() => void) | null>(null);
  // 押し始めた時刻（長押しの見分け）と、押したときに録音中だったか
  const pressed = useRef<{ at: number; wasRecording: boolean } | null>(null);
  // 始める・やめる・閉じるたびに進める（マイクや文字起こしを待つ間にやめた・閉じたら、届いたものを捨てる）
  const attempt = useRef(0);
  const textRef = useRef(onText);
  textRef.current = onText;

  // チャット欄を閉じたら、録音をやめてマイクを放す
  useEffect(
    () => () => {
      attempt.current++;
      stopWatch.current?.();
      recording.current?.cancel();
    },
    [],
  );

  /** 音量の見張りをやめる */
  function unwatch() {
    stopWatch.current?.();
    stopWatch.current = null;
  }

  async function transcribe(audio: Blob, send: boolean) {
    const id = ++attempt.current;
    setState({ kind: "transcribing" });
    try {
      const { text } = await api.transcribe(audio);
      if (id !== attempt.current) return;
      if (!text.trim()) return setState({ kind: "error", message: "聞き取れる声がありませんでした。" });
      setState({ kind: "idle" });
      textRef.current(text, send);
    } catch (e) {
      if (id === attempt.current) setState({ kind: "error", message: errorMessage(e), audio, send });
    }
  }

  async function start() {
    const id = ++attempt.current;
    setState({ kind: "starting" });
    // 準備ができていなければ（取ってある状態が古いこともあるので取り直して確かめ）、設定を開いて案内する
    const fresh = status?.ready ? status : await voiceStatusStore.reload().catch(() => undefined);
    if (id !== attempt.current) return;
    if (!fresh?.ready) {
      setState({ kind: "idle" });
      openSettings("voice");
      return;
    }
    try {
      const { recording: rec, stream } = await startRecording();
      if (id !== attempt.current) return rec.cancel();
      recording.current = rec;
      let vad = initialVad(Date.now());
      stopWatch.current = watchLevel(stream, (level, now) => {
        vad = vadStep(vad, level, now, LISTEN_VAD).state;
        if (now - vad.lastVoiceAt < SILENCE_STOP_MS) return;
        if (vad.heard) void finish(false);
        else {
          cancel();
          setState({ kind: "error", message: "1 分間声が聞こえなかったため、音声入力を止めました。" });
        }
      });
      setState({ kind: "recording", startedAt: Date.now() });
    } catch (e) {
      if (id === attempt.current) setState({ kind: "error", message: micErrorMessage(e) });
    }
  }

  /** 録音を止めて文字起こしする（send なら、入れてそのまま送る） */
  async function finish(send: boolean) {
    const current = recording.current;
    if (!current) return;
    recording.current = null;
    unwatch();
    setState({ kind: "transcribing" });
    void transcribe(await current.stop(), send);
  }

  /** 録音・文字起こしをやめる（何も入れない） */
  function cancel() {
    attempt.current++;
    unwatch();
    recording.current?.cancel();
    recording.current = null;
    setState({ kind: "idle" });
  }

  /** 押したとき・⌘⇧Space: 録音していなければ始め、録音中なら止めて起こす */
  function toggle() {
    if (state.kind === "recording") void finish(false);
    else if (state.kind === "idle" || state.kind === "error") void start();
  }

  /** マイクのボタンを押し始めた（録音していなければ始める） */
  function press() {
    const wasRecording = state.kind === "recording";
    pressed.current = { at: Date.now(), wasRecording };
    if (!wasRecording && (state.kind === "idle" || state.kind === "error")) void start();
  }

  /** マイクのボタンを離した（押したときに録音中だった = 2 回目の押し、か長押しなら、止めて起こす。短い 1 回目なら録り続ける） */
  function release() {
    const p = pressed.current;
    pressed.current = null;
    if (!p || !recording.current) return;
    if (p.wasRecording || Date.now() - p.at >= HOLD_MS) void finish(false);
  }

  return {
    state,
    /** 準備ができているか（取れるまでは使える前提で出し、押したときに確かめる） */
    ready: status?.ready ?? true,
    recording: state.kind === "recording",
    toggle,
    press,
    release,
    finish,
    cancel,
    /** 失敗したとき、録った音声で起こし直す */
    retry: () => {
      if (state.kind === "error" && state.audio) void transcribe(state.audio, Boolean(state.send));
    },
    dismiss: () => setState({ kind: "idle" }),
  };
}
