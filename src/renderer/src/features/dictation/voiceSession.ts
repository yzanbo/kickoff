// 音声モードの 1 回の会話（React に依存しない）: 聞く → 黙ったら文字にして送る → 返答の文章を読み上げる → 読み終えたらまた聞く、をくり返す。
// 読み上げ中に話すと、読み上げを止めて聞き始める。マイクは会話の間ずっと開いたままにし、話すたびに録音を作り直す
import { errorMessage } from "@shared/errors";
import { micErrorMessage } from "./dictationText";
import { openMic, recordStream, watchLevel, type Recording } from "./recorder";
import { Speaker, type SpeakerSettings } from "./speaker";
import { BARGE_IN_VAD, initialVad, LISTEN_VAD, vadStep, type VadState } from "./vad";

/** 音声モードの様子（聞いている → 文字起こし中 → 送って返答を待っている → 読み上げている） */
export type VoiceModeState =
  | { kind: "off" }
  | { kind: "starting" }
  | { kind: "listening"; heard: boolean }
  | { kind: "transcribing" }
  | { kind: "waiting" }
  | { kind: "speaking" };

/** 読み上げる候補の返答（メインエージェントの文章の記録） */
export interface VoiceReply {
  id: number;
  text: string;
}

export interface VoiceSessionDeps {
  /** 起こした文を送る（作業中なら、いまのやり取りに伝える） */
  send: (text: string) => Promise<void>;
  transcribe: (audio: Blob) => Promise<string>;
  speakerSettings: () => SpeakerSettings;
  onState: (state: VoiceModeState) => void;
  /** 起こした文（パネルに「あなた: …」と出す） */
  onHeard: (text: string) => void;
  /** 失敗の文（会話は続ける。マイクを開けなかったときだけ終わる） */
  onError: (message: string) => void;
  /** マイクの音量（丸の大きさ） */
  onLevel: (level: number) => void;
  /** マイクを開けずに終わった */
  onEnd: () => void;
}

/** 声が聞こえないまま、これだけたったら録音を作り直す（黙っている間の音声を溜めて送らない） */
const IDLE_RESTART_MS = 30_000;
/** 送ってから、これだけ作業が始まらず返答もなければ、また聞き始める */
const NO_RESPONSE_MS = 20_000;

export class VoiceSession {
  private state: VoiceModeState = { kind: "starting" };
  private stream: MediaStream | null = null;
  private unwatch: (() => void) | null = null;
  private recording: Recording | null = null;
  private vad: VadState = initialVad(Date.now());
  private barge: VadState = initialVad(Date.now());
  private listenStartedAt = 0;
  private readonly speaker: Speaker;
  /** もう見た返答（始めたときにあったもの・読んだもの・聞いている間に届いたもの） */
  private seen = new Set<number>();
  private busy = false;
  /** 送ったあとの作業の様子（作業が始まったか・返答が届いたか） */
  private turn: { busySeen: boolean; gotReply: boolean } | null = null;
  private noResponseTimer: number | undefined;
  private ended = false;

  constructor(private readonly deps: VoiceSessionDeps) {
    this.speaker = new Speaker(deps.speakerSettings, (speaking) => this.onSpeaking(speaking), deps.onError);
  }

  /** マイクを開いて聞き始める（いまある返答は読まない） */
  async start(replies: VoiceReply[], busy: boolean) {
    this.seen = new Set(replies.map((r) => r.id));
    this.busy = busy;
    this.setState({ kind: "starting" });
    try {
      this.stream = await openMic();
    } catch (e) {
      this.deps.onError(micErrorMessage(e));
      this.stop();
      this.deps.onEnd();
      return;
    }
    if (this.ended) return this.releaseMic();
    this.unwatch = watchLevel(this.stream, (level, now) => this.onLevel(level, now));
    this.listen();
  }

  /** 終える（録音・読み上げ・マイクをすべてやめる） */
  stop() {
    this.ended = true;
    window.clearTimeout(this.noResponseTimer);
    this.recording?.cancel();
    this.recording = null;
    this.speaker.stop();
    this.unwatch?.();
    this.unwatch = null;
    this.releaseMic();
    this.setState({ kind: "off" });
  }

  /** チャットの返答と作業中かが変わった（送ったあとの返答を読み上げ、作業が終わって読み終えたら、また聞く） */
  update(replies: VoiceReply[], busy: boolean) {
    if (this.ended) return;
    this.busy = busy;
    if (busy && this.turn) this.turn.busySeen = true;
    for (const reply of replies) {
      if (this.seen.has(reply.id)) continue;
      this.seen.add(reply.id);
      // 聞いている間（読み上げに割り込んだあと）に届いた返答は読まない
      if (!this.turn || this.state.kind === "listening" || this.state.kind === "transcribing") continue;
      this.turn.gotReply = true;
      this.speaker.enqueue(reply.text);
    }
    this.afterTurn();
  }

  /** 黙るのを待たずに、いま話した分を送る */
  sendNow() {
    if (this.state.kind === "listening") void this.finishListening();
  }

  /** 読み上げを飛ばす（作業が終わっていれば、すぐ聞き始める） */
  skip() {
    if (this.state.kind !== "speaking" && this.state.kind !== "waiting") return;
    this.speaker.stop();
    if (this.state.kind === "waiting" && !this.turnDone()) return;
    this.turn = null;
    this.listen();
  }

  private setState(state: VoiceModeState) {
    this.state = state;
    this.deps.onState(state);
  }

  private releaseMic() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  /** 聞き始める（録音を新しく作る） */
  private listen() {
    if (this.ended || !this.stream) return;
    window.clearTimeout(this.noResponseTimer);
    this.recording?.cancel();
    this.recording = recordStream(this.stream, { release: false });
    const now = Date.now();
    this.vad = initialVad(now, this.vad.noise);
    this.listenStartedAt = now;
    this.setState({ kind: "listening", heard: false });
  }

  private onLevel(level: number, now: number) {
    this.deps.onLevel(level);
    if (this.state.kind === "listening") {
      const { state, event } = vadStep(this.vad, level, now, LISTEN_VAD);
      this.vad = state;
      if (event === "start") this.setState({ kind: "listening", heard: true });
      else if (event === "end") void this.finishListening();
      else if (!state.heard && now - this.listenStartedAt > IDLE_RESTART_MS) this.listen();
    } else if (this.state.kind === "speaking") {
      const { state, event } = vadStep(this.barge, level, now, BARGE_IN_VAD);
      this.barge = state;
      // 読み上げ中に話したら、読み上げを止めて聞く（まだ届く返答は読まない）
      if (event === "start") {
        this.speaker.stop();
        this.turn = null;
        this.listen();
        this.setState({ kind: "listening", heard: true });
      }
    }
  }

  /** 録音を止めて文字にし、送る（声がなければ、また聞く） */
  private async finishListening() {
    const recording = this.recording;
    if (!recording) return;
    this.recording = null;
    this.setState({ kind: "transcribing" });
    let text: string;
    try {
      text = (await this.deps.transcribe(await recording.stop())).trim();
    } catch (e) {
      if (this.ended) return;
      this.deps.onError(errorMessage(e));
      return this.listen();
    }
    if (this.ended) return;
    if (!text) return this.listen();
    this.deps.onHeard(text);
    this.turn = { busySeen: this.busy, gotReply: false };
    this.setState({ kind: "waiting" });
    try {
      await this.deps.send(text);
    } catch (e) {
      if (this.ended) return;
      this.deps.onError(errorMessage(e));
      this.turn = null;
      return this.listen();
    }
    // 作業が始まらず返答も来ない（送れなかった・すぐ終わった）ときは、しばらくしてまた聞く
    this.noResponseTimer = window.setTimeout(() => {
      if (this.turn && !this.turn.busySeen && !this.turn.gotReply && this.state.kind === "waiting") {
        this.turn = null;
        this.listen();
      }
    }, NO_RESPONSE_MS);
  }

  private onSpeaking(speaking: boolean) {
    if (this.ended) return;
    if (speaking) {
      this.barge = initialVad(Date.now(), this.vad.noise);
      if (this.state.kind === "waiting") this.setState({ kind: "speaking" });
      return;
    }
    if (this.state.kind === "speaking") this.setState({ kind: "waiting" });
    this.afterTurn();
  }

  /** 送った作業が終わったか（作業が始まって終わった・返答が届いて作業していない） */
  private turnDone() {
    return Boolean(this.turn && !this.busy && (this.turn.busySeen || this.turn.gotReply));
  }

  /** 作業が終わって読み上げも終えたら、また聞く */
  private afterTurn() {
    if (this.state.kind !== "waiting" || this.speaker.speaking || !this.turnDone()) return;
    this.turn = null;
    this.listen();
  }
}
