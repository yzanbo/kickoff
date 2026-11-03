import { useEffect, useRef, useState } from "react";
import { api } from "../../api";
import { errorMessage } from "../../errors";
import { openSettings } from "../settings/openSettings";
import { micErrorMessage } from "./dictationText";
import { startRecording, type Recording } from "./recorder";
import { refreshVoiceStatus, useVoiceStatus } from "./voiceStatus";

/** 音声入力の状態（録音の準備中 → 録音中 → 文字起こし中 → 入れたら idle。失敗したら error で、録った音声があれば起こし直せる） */
export type DictationState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "recording"; startedAt: number }
  | { kind: "transcribing" }
  | { kind: "error"; message: string; audio?: Blob; send?: boolean };

export type Dictation = ReturnType<typeof useDictation>;

/**
 * チャット欄の音声入力（1 回押して話し、話し終わったらもう一度押す）。
 * onText に起こした文を渡す（send なら、入れてそのまま送る）。準備ができていなければ、設定の「音声入力」を開く
 */
export function useDictation({ onText }: { onText: (text: string, send: boolean) => void }) {
  const status = useVoiceStatus();
  const [state, setState] = useState<DictationState>({ kind: "idle" });
  const recording = useRef<Recording | null>(null);
  // 始める・やめる・閉じるたびに進める（マイクや文字起こしを待つ間にやめた・閉じたら、届いたものを捨てる）
  const attempt = useRef(0);
  const textRef = useRef(onText);
  textRef.current = onText;

  // チャット欄を閉じたら、録音をやめてマイクを放す
  useEffect(
    () => () => {
      attempt.current++;
      recording.current?.cancel();
    },
    [],
  );

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
    const fresh = status?.ready ? status : await refreshVoiceStatus().catch(() => undefined);
    if (id !== attempt.current) return;
    if (!fresh?.ready) {
      setState({ kind: "idle" });
      openSettings("voice");
      return;
    }
    try {
      const rec = await startRecording();
      if (id !== attempt.current) return rec.cancel();
      recording.current = rec;
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
    setState({ kind: "transcribing" });
    void transcribe(await current.stop(), send);
  }

  /** 録音・文字起こしをやめる（何も入れない） */
  function cancel() {
    attempt.current++;
    recording.current?.cancel();
    recording.current = null;
    setState({ kind: "idle" });
  }

  /** 押したとき・⌘⇧Space: 録音していなければ始め、録音中なら止めて起こす */
  function toggle() {
    if (state.kind === "recording") void finish(false);
    else if (state.kind === "idle" || state.kind === "error") void start();
  }

  return {
    state,
    /** 準備ができているか（取れるまでは使える前提で出し、押したときに確かめる） */
    ready: status?.ready ?? true,
    recording: state.kind === "recording",
    toggle,
    finish,
    cancel,
    /** 失敗したとき、録った音声で起こし直す */
    retry: () => {
      if (state.kind === "error" && state.audio) void transcribe(state.audio, Boolean(state.send));
    },
    dismiss: () => setState({ kind: "idle" }),
  };
}
