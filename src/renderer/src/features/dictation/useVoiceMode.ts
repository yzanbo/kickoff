import { useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS } from "@shared/types";
import { api } from "@/api";
import { useAppSettings } from "@/stores/settings";
import { useVoiceStatus, voiceStatusStore } from "@/stores/voice";
import { openSettings } from "@/features/settings/openSettings";
import { VoiceSession, type VoiceModeState, type VoiceReply } from "./voiceSession";

export type VoiceMode = ReturnType<typeof useVoiceMode>;

/** 音量を受け取る相手（パネルの丸。React の描き直しをせずに大きさを変える） */
type LevelListener = (level: number) => void;

/**
 * 音声モード（チャット欄の波形のボタン）: 話しかけると送り、返答の文章を読み上げ、読み終えたらまた聞く（voiceSession.ts）。
 * replies はこのチャットのメインエージェントの返答、busy は作業中か、send は起こした文を送る口。
 * 文字起こしの準備ができていない・OpenAI の声で API キーがなければ、設定の「音声入力」を開く。チャット欄を閉じたら終える
 */
export function useVoiceMode({ replies, busy, send }: { replies: VoiceReply[]; busy: boolean; send: (text: string) => Promise<void> }) {
  const status = useVoiceStatus().data;
  const settings = useAppSettings().data;
  const [state, setState] = useState<VoiceModeState>({ kind: "off" });
  const [error, setError] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const session = useRef<VoiceSession | null>(null);
  const levelListeners = useRef(new Set<LevelListener>());
  const latest = useRef({ replies, busy, send, settings });
  latest.current = { replies, busy, send, settings };

  useEffect(() => {
    session.current?.update(replies, busy);
  }, [replies, busy]);

  useEffect(
    () => () => {
      session.current?.stop();
      session.current = null;
    },
    [],
  );

  async function start() {
    if (session.current) return;
    // 準備ができていなければ（取ってある状態が古いこともあるので取り直して確かめ）、設定を開いて案内する
    const fresh = status?.ready ? status : await voiceStatusStore.reload().catch(() => undefined);
    const ttsReady = latest.current.settings?.voice_tts_provider !== "openai" || fresh?.openai.key_saved;
    if (!fresh?.ready || !ttsReady) return openSettings("voice");
    setError(null);
    setHeard(null);
    const s = new VoiceSession({
      send: (text) => latest.current.send(text),
      transcribe: async (audio) => (await api.transcribe(audio)).text,
      speakerSettings: () => latest.current.settings ?? DEFAULT_SETTINGS,
      onState: setState,
      onHeard: setHeard,
      onError: setError,
      onLevel: (level) => levelListeners.current.forEach((f) => f(level)),
      onEnd: () => {
        if (session.current === s) session.current = null;
      },
    });
    session.current = s;
    await s.start(latest.current.replies, latest.current.busy);
  }

  function stop() {
    session.current?.stop();
    session.current = null;
    setState({ kind: "off" });
  }

  return {
    state,
    active: state.kind !== "off",
    error,
    heard,
    /** 準備ができているか（取れるまでは使える前提で出し、押したときに確かめる） */
    ready: status?.ready ?? true,
    start: () => void start(),
    stop,
    sendNow: () => session.current?.sendNow(),
    skip: () => session.current?.skip(),
    dismissError: () => setError(null),
    /** マイクの音量を受け取る（返した関数でやめる） */
    subscribeLevel: (listener: LevelListener) => {
      levelListeners.current.add(listener);
      return () => void levelListeners.current.delete(listener);
    },
  };
}
