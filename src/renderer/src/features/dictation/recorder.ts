import { readSetting } from "@/lib/storage";
import { VOICE_MIC_DEVICE } from "@/lib/storageKeys";

/** 録音中の音声（止めると録った音声の区切りの一覧、やめると捨てる。release なら、どちらでもマイクを放す） */
export interface Recording {
  stop(): Promise<Blob[]>;
  cancel(): void;
}

/** 録る形式（Chromium は webm の Opus。使えなければ既定に任せる） */
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

/** 録る音質（話し声には十分。1 時間でおよそ 14MB） */
const AUDIO_BITS_PER_SECOND = 32_000;

/** 録った音声を受け取る間隔（区切りの大きさを見張るため） */
const SLICE_MS = 1000;

/**
 * この大きさを超えたら、録音を新しく作り直して次の区切りにする（長さの上限をなくすため。
 * 文字起こしの 1 回に送れるのは 25MB までなので、区切りごとに起こしてつなぐ）
 */
export const PART_BYTES = 20 * 1024 * 1024;

/** 音量を測る間隔 */
const LEVEL_INTERVAL_MS = 50;

/**
 * マイクを開く（マイクの ▾ で選んだもの。見つからなければ既定のマイク）。
 * 許可がなければ getUserMedia の例外のまま失敗する（文は micErrorMessage）
 */
export async function openMic(): Promise<MediaStream> {
  const base = { echoCancellation: true, noiseSuppression: true };
  const deviceId = readSetting(VOICE_MIC_DEVICE);
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: { ...base, deviceId: { exact: deviceId } } });
    } catch (e) {
      // 選んだマイクを外した（見つからない）ときだけ既定に戻す。許可がないなどは、そのまま知らせる
      const name = (e as { name?: unknown } | null)?.name;
      if (name !== "NotFoundError" && name !== "OverconstrainedError") throw e;
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: base });
}

/**
 * 開いたマイクで録り始める（release なら止める・やめるときにマイクも放す。音声モードは開いたまま何回も録る）。
 * 長さの上限はなく、partBytes を超えるたびに録音を作り直して区切る（区切りはそれぞれ単独で再生・文字起こしできる）
 */
export function recordStream(stream: MediaStream, { release, partBytes = PART_BYTES }: { release: boolean; partBytes?: number }): Recording {
  const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  const parts: Promise<Blob | null>[] = [];
  let current: MediaRecorder | null = null;
  let cancelled = false;
  let finished = false;
  const begin = () => {
    const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
    const chunks: Blob[] = [];
    let size = 0;
    parts.push(
      new Promise<Blob | null>((resolve) => {
        recorder.onstop = () => resolve(cancelled ? null : new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
      }),
    );
    recorder.ondataavailable = (e) => {
      if (e.data.size === 0) return;
      chunks.push(e.data);
      size += e.data.size;
      // 大きくなったら、次の録音を先に始めてから止める（つなぎ目で声を落とさない）
      if (size >= partBytes && recorder === current && !finished) {
        begin();
        recorder.stop();
      }
    };
    recorder.start(SLICE_MS);
    current = recorder;
  };
  const end = async () => {
    finished = true;
    if (current && current.state !== "inactive") current.stop();
    const blobs = (await Promise.all(parts)).filter((b): b is Blob => Boolean(b && b.size > 0));
    if (release) stream.getTracks().forEach((t) => t.stop());
    return blobs;
  };
  begin();
  return {
    stop: end,
    cancel: () => {
      cancelled = true;
      void end();
    },
  };
}

/**
 * マイクの音量（RMS。0〜1）を 50ms ごとに知らせる（AudioContext の AnalyserNode。返した関数で止める）。
 * 声の始まり・終わりの見分け（vad.ts）と、音声モードの丸の大きさに使う
 */
export function watchLevel(stream: MediaStream, onLevel: (level: number, now: number) => void): () => void {
  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const timer = window.setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) sum += v * v;
    onLevel(Math.sqrt(sum / samples.length), Date.now());
  }, LEVEL_INTERVAL_MS);
  return () => {
    window.clearInterval(timer);
    source.disconnect();
    void context.close();
  };
}

/** 選べるマイクの一覧（許可を得る前は名前が空なので「マイク 1」などにする） */
export async function listMics(): Promise<{ id: string; label: string }[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "audioinput" && d.deviceId !== "default" && d.deviceId !== "communications")
    .map((d, i) => ({ id: d.deviceId, label: d.label || `マイク ${i + 1}` }));
}
