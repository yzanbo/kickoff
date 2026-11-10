import { useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS } from "@shared/types";
import { api } from "@/api";
import { useSetting } from "@/hooks/useSetting";
import { VOICE_MODE_DELIVERY } from "@/lib/storageKeys";
import { useAppSettings } from "@/stores/settings";
import { useVoiceStatus, voiceStatusStore } from "@/stores/voice";
import { openSettings } from "@/features/settings/openSettings";
import { VoiceSession, type VoiceModeState, type VoiceReply } from "./voiceSession";

export type VoiceMode = ReturnType<typeof useVoiceMode>;

/** 音量を受け取る相手（パネルの丸。React の描き直しをせずに大きさを変える） */
type LevelListener = (level: number) => void;

/** 話し終わったときの扱い（すぐ送る / チャット欄に入れる） */
export type VoiceDelivery = "send" | "fill";

/**
 * 音声モード（チャット欄の波形のボタン）: 聞いて、話し終わったら起こした文をすぐ送るかチャット欄に入れ（VOICE_MODE_DELIVERY）、
 * 届いた返答の文章を読み上げる（voiceSession.ts）。replies はこのチャットのメインエージェントの返答、busy は作業中か、
 * send は起こした文を送る口（作業中なら、いま / あとでの送り方で）、fill はチャット欄に入れる口。
 * チャット欄から送ったら noteSent を呼ぶ（止めていた読み上げを戻す）。
 * 文字起こしの準備ができていない・OpenAI の声で API キーがなければ、設定の「音声入力」を開く。チャット欄を閉じたら終える
 */
export function useVoiceMode({ replies, busy, send, fill }: { replies: VoiceReply[]; busy: boolean; send: (text: string) => Promise<void>; fill: (text: string) => void }) {
  const status = useVoiceStatus().data;
  const settings = useAppSettings().data;
  const [state, setState] = useState<VoiceModeState>({ kind: "off" });
  const [error, setError] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [delivery, setDelivery] = useSetting(VOICE_MODE_DELIVERY);
  const session = useRef<VoiceSession | null>(null);
  const levelListeners = useRef(new Set<LevelListener>());
  const latest = useRef({ replies, busy, send, fill, settings, delivery });
  latest.current = { replies, busy, send, fill, settings, delivery };

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
    setMuted(false);
    const s = new VoiceSession({
      deliver: async (text) => {
        if (latest.current.delivery === "fill") return latest.current.fill(text);
        await latest.current.send(text);
        s.noteSent();
      },
      transcribe: async (audio) => (await api.transcribe(audio)).text,
      speakerSettings: () => latest.current.settings ?? DEFAULT_SETTINGS,
      onState: setState,
      onHeard: setHeard,
      onError: setError,
      onLevel: (level) => levelListeners.current.forEach((f) => f(level)),
      onMuted: setMuted,
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
    /** 読み上げを止めているか（次に送るか、作業が終わるまで） */
    muted,
    busy,
    delivery: delivery as VoiceDelivery,
    setDelivery,
    /** 準備ができているか（取れるまでは使える前提で出し、押したときに確かめる） */
    ready: status?.ready ?? true,
    start: () => void start(),
    stop,
    sendNow: () => session.current?.sendNow(),
    skip: () => session.current?.skip(),
    /** チャット欄から送った（止めていた読み上げを戻し、その返答を読む） */
    noteSent: () => session.current?.noteSent(),
    dismissError: () => setError(null),
    /** マイクの音量を受け取る（返した関数でやめる） */
    subscribeLevel: (listener: LevelListener) => {
      levelListeners.current.add(listener);
      return () => void levelListeners.current.delete(listener);
    },
  };
}
