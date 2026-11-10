// 音声モードの 1 回の会話（React に依存しない）: 聞く → 黙ったら文字にして渡す（送る・入力欄に入れるは呼ぶ側）→ また聞く、をくり返し、
// その間に届いた返答の文章を読み上げる。AI が作業中でも聞き続ける（話した分は、いま / あとでの送り方で送る）。
// 話している途中・文字にしている間に届いた返答は、渡し終えてから読む。読み上げ中に話すと、読み上げを止めて聞き始め、
// 次に送るか作業が終わるまで読まない。マイクは会話の間ずっと開いたままにし、話すたびに録音を作り直す
import { errorMessage } from "@shared/errors";
import { micErrorMessage, transcribeParts } from "./dictationText";
import { openMic, recordStream, watchLevel, type Recording } from "./recorder";
import { Speaker, type SpeakerSettings } from "./speaker";
import { BARGE_IN_VAD, initialVad, LISTEN_VAD, vadStep, type VadState } from "./vad";

/** 音声モードの様子（聞いている → 文字起こし中 → 聞いている、の間に読み上げが入る） */
export type VoiceModeState = { kind: "off" } | { kind: "starting" } | { kind: "listening"; heard: boolean } | { kind: "transcribing" } | { kind: "speaking" };

/** 読み上げる候補の返答（メインエージェントの文章の記録） */
export interface VoiceReply {
  id: number;
  text: string;
}

export interface VoiceSessionDeps {
  /** 起こした文を渡す（すぐ送る・入力欄に入れる。送ったなら呼ぶ側が noteSent を呼ぶ） */
  deliver: (text: string) => Promise<void>;
  transcribe: (audio: Blob) => Promise<string>;
  speakerSettings: () => SpeakerSettings;
  onState: (state: VoiceModeState) => void;
  /** 起こした文（パネルに「あなた: …」と出す） */
  onHeard: (text: string) => void;
  /** 失敗の文（会話は続ける。マイクを開けなかったときだけ終わる） */
  onError: (message: string) => void;
  /** マイクの音量（丸の大きさ） */
  onLevel: (level: number) => void;
  /** 読み上げを止めているか（割り込んだ・飛ばした。次に送るか作業が終わるまで） */
  onMuted: (muted: boolean) => void;
  /** マイクを開けずに終わった */
  onEnd: () => void;
}

/** 声が聞こえないまま、これだけたったら録音を作り直す（黙っている間の音声を溜めて送らない） */
const IDLE_RESTART_MS = 30_000;

export class VoiceSession {
  private state: VoiceModeState = { kind: "starting" };
  private stream: MediaStream | null = null;
  private unwatch: (() => void) | null = null;
  private recording: Recording | null = null;
  private vad: VadState = initialVad(Date.now());
  private barge: VadState = initialVad(Date.now());
  private listenStartedAt = 0;
  private readonly speaker: Speaker;
  /** もう見た返答（始めたときにあったもの・読んだもの・止めている間に届いたもの） */
  private seen = new Set<number>();
  private busy = false;
  /** 読み上げを止めている（割り込んだ・飛ばした） */
  private muted = false;
  /** 話している途中・文字にしている間に届いた返答（渡し終えてから読む） */
  private pending: string[] = [];
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
    this.resume();
  }

  /** 終える（録音・読み上げ・マイクをすべてやめる） */
  stop() {
    this.ended = true;
    this.recording?.cancel();
    this.recording = null;
    this.pending = [];
    this.speaker.stop();
    this.unwatch?.();
    this.unwatch = null;
    this.releaseMic();
    this.setState({ kind: "off" });
  }

  /** チャットの返答と作業中かが変わった（新しい返答を読み上げる。作業が終わったら、止めていた読み上げを戻す） */
  update(replies: VoiceReply[], busy: boolean) {
    if (this.ended) return;
    for (const reply of replies) {
      if (this.seen.has(reply.id)) continue;
      this.seen.add(reply.id);
      if (!this.muted) this.hear(reply.text);
    }
    const finished = this.busy && !busy;
    this.busy = busy;
    if (finished) this.setMuted(false);
  }

  /** 起こした文を送った（音声モードのすぐ送る・入力欄から送った）。止めていた読み上げを戻し、その返答を読む */
  noteSent() {
    this.setMuted(false);
  }

  /** 黙るのを待たずに、いま話した分を渡す */
  sendNow() {
    if (this.state.kind === "listening") void this.finishListening();
  }

  /** 読み上げを止める（次に送るか、作業が終わるまで読まない） */
  skip() {
    if (this.state.kind !== "speaking") return;
    this.setMuted(true);
    this.pending = [];
    this.listen();
    this.speaker.stop();
  }

  private setState(state: VoiceModeState) {
    this.state = state;
    this.deps.onState(state);
  }

  private setMuted(muted: boolean) {
    if (this.muted === muted) return;
    this.muted = muted;
    this.deps.onMuted(muted);
  }

  private releaseMic() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  /** 返答を読む（話している途中・文字にしている間は、渡し終えるまで取っておく） */
  private hear(text: string) {
    const talking = (this.state.kind === "listening" && this.state.heard) || this.state.kind === "transcribing" || this.state.kind === "starting";
    if (talking) this.pending.push(text);
    else this.speaker.enqueue(text);
  }

  /** 手が空いたら: 取っておいた返答があれば読み、なければ聞く */
  private resume() {
    if (this.ended) return;
    const pending = this.muted ? [] : this.pending;
    this.pending = [];
    this.listen();
    for (const text of pending) this.speaker.enqueue(text);
  }

  /** 聞き始める（録音を新しく作る） */
  private listen() {
    if (this.ended || !this.stream) return;
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
      // 読み上げ中に話したら、読み上げを止めて聞く（次に送るか作業が終わるまで、届く返答は読まない）
      if (event === "start") {
        this.setMuted(true);
        this.pending = [];
        this.listen();
        this.speaker.stop();
        this.vad = { ...this.vad, heard: true, speaking: true, lastVoiceAt: now };
        this.setState({ kind: "listening", heard: true });
      }
    }
  }

  /** 録音を止めて文字にし、渡す（声がなければ、また聞く） */
  private async finishListening() {
    const recording = this.recording;
    if (!recording) return;
    this.recording = null;
    this.setState({ kind: "transcribing" });
    let text: string;
    try {
      text = (await transcribeParts(await recording.stop(), this.deps.transcribe)).trim();
    } catch (e) {
      if (this.ended) return;
      this.deps.onError(errorMessage(e));
      return this.resume();
    }
    if (this.ended) return;
    if (text) {
      this.deps.onHeard(text);
      try {
        await this.deps.deliver(text);
      } catch (e) {
        if (this.ended) return;
        this.deps.onError(errorMessage(e));
      }
    }
    this.resume();
  }

  private onSpeaking(speaking: boolean) {
    if (this.ended) return;
    if (speaking) {
      // 読み上げている間は録らない（スピーカーの音を送らない）。割り込みだけ見張る
      this.recording?.cancel();
      this.recording = null;
      this.barge = initialVad(Date.now(), this.vad.noise);
      this.setState({ kind: "speaking" });
      return;
    }
    if (this.state.kind === "speaking") this.resume();
  }
}
