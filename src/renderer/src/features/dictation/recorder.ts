import { readSetting } from "@/lib/storage";
import { VOICE_MIC_DEVICE } from "@/lib/storageKeys";

/** 録音中の音声（止めると録った音声、やめると捨てる。release なら、どちらでもマイクを放す） */
export interface Recording {
  stop(): Promise<Blob>;
  cancel(): void;
}

/** 録る形式（Chromium は webm の Opus。使えなければ既定に任せる） */
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

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

/** 開いたマイクで録り始める（release なら止める・やめるときにマイクも放す。音声モードは開いたまま何回も録る） */
export function recordStream(stream: MediaStream, { release }: { release: boolean }): Recording {
  const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const done = () => {
    if (release) stream.getTracks().forEach((t) => t.stop());
  };
  recorder.start();
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          done();
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        };
        recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = done;
      if (recorder.state !== "inactive") recorder.stop();
      else done();
    },
  };
}

/** マイクで録音を始める（止める・やめるとマイクを放す） */
export async function startRecording(): Promise<{ recording: Recording; stream: MediaStream }> {
  const stream = await openMic();
  return { recording: recordStream(stream, { release: true }), stream };
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
