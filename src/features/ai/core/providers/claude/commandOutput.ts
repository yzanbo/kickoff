import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { SDKMessage } from "./wire";
import type { CommandOutput } from "@shared/chat/chatEvent";
import { outputTail } from "@/features/ai/core/providers/shared/events";
import { commandOutputRoots } from "./internals";

/*
 * 実行中のコマンドの出力を、終わる前から画面に届ける。
 * Claude Code の SDK は、コマンド（Bash）の出力を終わってから結果としてまとめて渡すだけで、途中では渡さない。
 * ただし Claude Code は、手前で待つコマンドも裏で動かしたコマンドも、出力をその場で
 * `<一時フォルダ>/claude-<uid>/<作業場所>/<セッション ID>/tasks/<作業 ID>.output` に書いている。
 * コマンドを始めると task_started（task_type: local_bash・作業 ID・呼び出し ID）が届くので、そのファイルの増えた分を読み続け、
 * 最後の行を知らせる。場所は Claude Code の内部の決まりなので、作業場所の部分は計算せずに探し、見つからなければ何もしない
 * （結果は終わってから届く）
 */

/** ファイルを読み直す間隔 */
const POLL_MS = 500;
/** ファイルが見つかるまで探し続ける時間（過ぎたらあきらめる） */
const FIND_TIMEOUT_MS = 15_000;
/** 覚えておく出力の終わりの分（文字数）。最後の行を作るのに足りる分だけ */
const KEEP_CHARS = 64 * 1024;
/** 1 回に読む上限（これより多く増えていたら、終わりの分だけ読む） */
const MAX_READ_BYTES = 256 * 1024;

/** コマンドの出力ファイルを探す（各場所の下の作業場所のフォルダごとに `<セッション ID>/tasks/<作業 ID>.output`）。なければ null */
export function findOutputFile(roots: string[], sessionId: string, taskId: string): string | null {
  const tail = path.join(sessionId, "tasks", `${taskId}.output`);
  for (const root of roots) {
    let entries: string[];
    try {
      entries = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const file = path.join(root, entry, tail);
      if (fs.existsSync(file)) return file;
    }
  }
  return null;
}

interface Watch {
  toolUseId: string;
  sessionId: string;
  file: string | null;
  offset: number;
  decoder: StringDecoder;
  /** 読んだ出力の終わりの分（KEEP_CHARS まで） */
  raw: string;
  sent: string;
  startedAt: number;
  timer: NodeJS.Timeout | null;
  reading: boolean;
}

export interface CommandOutputWatcherOptions {
  roots?: string[];
  pollMs?: number;
  findTimeoutMs?: number;
}

/**
 * 1 回の実行の間、実行中のコマンドの出力ファイルを読み続ける。SDK のメッセージを handle に渡し、実行が終わったら stopAll。
 * 始まり: task_started（local_bash）/ 終わり: task_notification・task_updated の終わりの状態（手前のコマンドも裏のコマンドも同じ）
 */
export function createCommandOutputWatcher(emit: (output: CommandOutput) => void, opts: CommandOutputWatcherOptions = {}) {
  const roots = opts.roots ?? commandOutputRoots(os.tmpdir());
  const pollMs = opts.pollMs ?? POLL_MS;
  const findTimeoutMs = opts.findTimeoutMs ?? FIND_TIMEOUT_MS;
  const watches = new Map<string, Watch>();

  const stop = (taskId: string) => {
    const w = watches.get(taskId);
    if (!w) return;
    if (w.timer) clearTimeout(w.timer);
    watches.delete(taskId);
  };

  /** 増えた分を読んで、最後の行が変わっていれば知らせる */
  const read = async (taskId: string, w: Watch) => {
    if (!w.file) {
      w.file = findOutputFile(roots, w.sessionId, taskId);
      if (!w.file) {
        if (Date.now() - w.startedAt > findTimeoutMs) stop(taskId);
        return;
      }
    }
    const size = (await fs.promises.stat(w.file)).size;
    // 短くなった（書き直された）ら初めから
    if (size < w.offset) Object.assign(w, { offset: 0, raw: "", decoder: new StringDecoder("utf8") });
    if (size === w.offset) return;
    if (size - w.offset > MAX_READ_BYTES) Object.assign(w, { offset: size - MAX_READ_BYTES, raw: "", decoder: new StringDecoder("utf8") });
    const handle = await fs.promises.open(w.file, "r");
    try {
      const buf = Buffer.alloc(size - w.offset);
      const { bytesRead } = await handle.read(buf, 0, buf.length, w.offset);
      w.offset += bytesRead;
      w.raw = (w.raw + w.decoder.write(buf.subarray(0, bytesRead))).slice(-KEEP_CHARS);
    } finally {
      await handle.close();
    }
    const text = outputTail(w.raw);
    // 止めたあとに読み終えたものは知らせない
    if (text === w.sent || watches.get(taskId) !== w) return;
    w.sent = text;
    emit({ tool_use_id: w.toolUseId, task_id: taskId, text });
  };

  const schedule = (taskId: string, w: Watch) => {
    w.timer = setTimeout(async () => {
      if (watches.get(taskId) !== w || w.reading) return;
      w.reading = true;
      try {
        await read(taskId, w);
      } catch {
        // 読めなかった回は飛ばす（消された・権限など。結果は終わってから届く）
      } finally {
        w.reading = false;
      }
      if (watches.get(taskId) === w) schedule(taskId, w);
    }, pollMs);
  };

  return {
    handle(msg: SDKMessage) {
      if (msg.type !== "system") return;
      if (msg.subtype === "task_started") {
        if (msg.task_type !== "local_bash" || !msg.tool_use_id || watches.has(msg.task_id)) return;
        const w: Watch = {
          toolUseId: msg.tool_use_id,
          sessionId: msg.session_id,
          file: null,
          offset: 0,
          decoder: new StringDecoder("utf8"),
          raw: "",
          sent: "",
          startedAt: Date.now(),
          timer: null,
          reading: false,
        };
        watches.set(msg.task_id, w);
        schedule(msg.task_id, w);
      } else if (msg.subtype === "task_notification") {
        stop(msg.task_id);
      } else if (msg.subtype === "task_updated") {
        const status = msg.patch.status;
        if (status === "completed" || status === "failed" || status === "killed") stop(msg.task_id);
      }
    },
    /** 実行が終わった（Claude Code のプロセスが終わると、裏のコマンドも止まる） */
    stopAll() {
      for (const taskId of [...watches.keys()]) stop(taskId);
    },
  };
}
