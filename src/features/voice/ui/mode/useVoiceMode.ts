import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useKeepAliveHold } from "@/features/chat/ui";
import { defaultsOf } from "@shared/foundation/contract/settings";
import { voiceSettings } from "@shared/voice/settings";
import { transcribeAudio } from "@/features/voice/ui/api";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "@/features/voice/ui/storage";
import { useVoiceStatus } from "@/features/voice/ui/store";
import { useAppSettings } from "@/foundation/ui/settings/appSettings";
import { ensureVoiceReady } from "@/features/voice/ui/capture/ensureVoiceReady";
import { createLevelChannel } from "@/features/voice/ui/capture/levelChannel";
import { armVoiceHandoff, disarmVoiceHandoff, RETURN_MS, returnVoiceHandoff, takeVoiceHandoff } from "./voiceHandoff";
import type { VoiceReply } from "@/features/composer/ui";
import { VoiceSession, type VoiceModeState } from "./voiceSession";

export type VoiceMode = ReturnType<typeof useVoiceMode>;

/** 話し終わったときの扱い（すぐ送る / チャット欄に入れる） */
export type VoiceDelivery = "send" | "fill";

/**
 * 音声モード（チャット欄の波形のボタン）: 聞いて、話し終わったら起こした文をすぐ送るかチャット欄に入れ（storage.settings.modeDelivery）、
 * 届いた返答の文章を読み上げる（voiceSession.ts）。replies はこのチャットのメインエージェントの返答、busy は作業中か、
 * send は起こした文を送る口（作業中なら、いま / あとでの送り方で）、fill はチャット欄に入れる口。
 * チャット欄から送ったら noteSent を呼ぶ（止めていた読み上げを戻す）。
 * draft は送る前の新しいチャット（送ったら、できたチャットへ音声モードを引き継ぐ。voiceHandoff.ts）、chatId は既存のチャット
 * （引き継がれたら、描いたときに音声モードを続け、そのチャットの返答をはじめから読む）。
 * 文字起こしの準備ができていない・OpenAI の声で API キーがなければ、設定の「音声入力」を開く。チャット欄を閉じたら終える
 */
export function useVoiceMode({
  replies,
  busy,
  send,
  fill,
  draft,
  chatId,
}: {
  replies: VoiceReply[];
  busy: boolean;
  send: (text: string) => Promise<void>;
  fill: (text: string) => void;
  draft?: boolean;
  chatId?: number;
}) {
  const status = useVoiceStatus().data;
  const settings = useAppSettings().data;
  const [state, setState] = useState<VoiceModeState>({ kind: "off" });
  const [error, setError] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [delivery, setDelivery] = useSetting(storage.settings.modeDelivery);
  const session = useRef<VoiceSession | null>(null);
  const [levels] = useState(createLevelChannel);
  const latest = useLatest({ replies, busy, send, fill, settings, delivery });
  // 音声モードの間は、タブを裏に回しても会話の欄を止めない（裏でも聞き続け、届いた返答を読み上げる。止めると下の片付けで終わる）
  const hold = useKeepAliveHold("voice");

  useEffect(() => {
    session.current?.update(replies, busy);
  }, [replies, busy]);

  async function start({ readAll = false }: { readAll?: boolean } = {}) {
    if (session.current) return;
    // 準備を確かめている間にタブを裏に回しても止めないよう、待つ前に立てる
    hold(true);
    // 準備ができていなければ（OpenAI の声で読むなら API キーも）、設定を開いて案内する
    if (!(await ensureVoiceReady(status, { openaiTts: latest.current.settings?.voice_tts_provider === "openai" }))) return hold(false);
    setError(null);
    setHeard(null);
    setMuted(false);
    const s = new VoiceSession({
      deliver: async (text) => {
        if (latest.current.delivery === "fill") return latest.current.fill(text);
        // 新しいチャットから送るなら、できたチャットへ引き継ぐ
        if (draft) armVoiceHandoff();
        await latest.current.send(text);
        s.noteSent();
      },
      transcribe: transcribeAudio,
      speakerSettings: () => latest.current.settings ?? defaultsOf(voiceSettings),
      onState: setState,
      onHeard: setHeard,
      onError: setError,
      onLevel: levels.emit,
      onMuted: setMuted,
      onEnd: () => {
        if (session.current !== s) return;
        session.current = null;
        hold(false);
      },
    });
    session.current = s;
    await s.start(readAll ? [] : latest.current.replies, latest.current.busy);
  }

  function stop() {
    if (draft) disarmVoiceHandoff();
    session.current?.stop();
    session.current = null;
    hold(false);
    setState({ kind: "off" });
  }

  // 描いたときに 1 回だけ。片付けは描いたときのチャット・下書きかで行う
  const resumeHandoff = useEffectEvent(() => {
    // 新しいチャットから引き継いだ音声モードを続ける（そのチャットの返答は、まだ届いていないものも含めてはじめから読む）
    const resumedAt = chatId !== undefined && takeVoiceHandoff(chatId) ? Date.now() : null;
    if (resumedAt !== null) void start({ readAll: true });
    return { resumedAt, chatId, draft };
  });
  useEffect(() => {
    const mounted = resumeHandoff();
    return () => {
      // 受け取ってすぐ作り直された（StrictMode など）なら、作り直したチャット欄に引き継ぎ直す
      if (mounted.resumedAt !== null && mounted.chatId !== undefined && Date.now() - mounted.resumedAt < RETURN_MS) returnVoiceHandoff(mounted.chatId);
      session.current?.stop();
      session.current = null;
      // 新しいチャットを閉じた（送ってチャットができたときは、閉じる前に引き継ぎ先を決めている）
      if (mounted.draft) disarmVoiceHandoff();
    };
  }, []);

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
    /** チャット欄から送る前（新しいチャットなら、できたチャットへ引き継ぐ印を付ける） */
    beforeSend: () => {
      if (draft && session.current) armVoiceHandoff();
    },
    stop,
    sendNow: () => session.current?.sendNow(),
    skip: () => session.current?.skip(),
    /** チャット欄から送った（止めていた読み上げを戻し、その返答を読む） */
    noteSent: () => session.current?.noteSent(),
    dismissError: () => setError(null),
    /** マイクの音量を受け取る（返した関数でやめる） */
    subscribeLevel: levels.subscribe,
  };
}
