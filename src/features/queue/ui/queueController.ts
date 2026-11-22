// 送信待ちの操作の口（React に依らない）: 命令を送り、並べ替え・印の線は応答を待たずに先回りして出す（コアと同じ applyQueueCommand で重ねる）
import type { QueueState } from "@shared/chat/chatLive";
import { applyQueueCommand, isQueueReject, type QueueCommand } from "@shared/chat/queueCommand";
import type { Outbox } from "@shared/chat/outbox";
import type { QueueSendBody } from "@shared/chat/send";
import type { QueuedMessage } from "@shared/chat/types";
import { createSignal } from "@/foundation/ui/store";

/** 画面に出す送信待ち（コアの並びに、まだ届いていない自分の並べ替えを重ねたもの） */
export interface QueueView {
  messages: QueuedMessage[];
  stops: number[];
  paused: boolean;
}

/** 応答が来なくても先回りをやめるまでの時間（失敗の知らせが届かないときの保険） */
const PREDICTION_MS = 3000;
/** 消した指示を覚えておく時間（応答より先に送信待ちの知らせが届く短い間だけ使う） */
const REMOVED_MS = 10_000;
/** 応答を待たずに出す命令（並べ替えと印の線。09-8.19） */
const PREDICTED = new Set<QueueCommand["op"]>(["move", "set_stops", "stop_after"]);
/** 先回りは挟む行を作らないので、行の ID と時刻は使わない */
const NO_ENV = { now: "", newId: () => "" };

/** 並び（ID と印の位置）の印。これが変わったらコアの並びが変わった */
export const queueKeyOf = (state: Pick<QueueState, "messages" | "stops">) => `${state.messages.map((m) => m.id).join()}|${state.stops.join()}`;

/** コアの送信待ちに、まだ届いていない命令を順に重ねる（当てられない命令は飛ばす） */
export function queueViewOf(state: QueueState, pending: readonly QueueCommand[]): QueueView {
  let box: Outbox = { now: state.now, later: state.messages, stops: state.stops, paused: state.paused };
  for (const command of pending) {
    const next = applyQueueCommand(box, command, NO_ENV);
    if (!isQueueReject(next)) box = next;
  }
  return { messages: box.later, stops: box.stops, paused: state.paused };
}

interface Pending {
  command: QueueCommand;
  /** 送った時点のコアの並びの印 */
  base: string;
  resolved: boolean;
  timer: ReturnType<typeof setTimeout>;
}

export interface QueueControllerDeps {
  /** 取り決めの POST …/queue（commands） */
  run(commands: QueueCommand[]): Promise<unknown>;
  /** 取り決めの POST …/queue/send */
  send(body: QueueSendBody): Promise<unknown>;
  /** 失敗の知らせ */
  failed(e: unknown): void;
}

export type QueueController = ReturnType<typeof createQueueController>;

/**
 * 1 つのチャットの送信待ちの操作。run・send は通ったら true（失敗は知らせて false）。
 * 先回りは、応答が届いてコアの並びが変わったら・失敗したら・しばらくたったら捨てる。消した指示は短い間覚える（送った指示と見分ける）
 */
export function createQueueController(deps: QueueControllerDeps) {
  let pending: Pending[] = [];
  let snapshot: readonly QueueCommand[] = [];
  let key = "";
  const changed = createSignal();
  const removed = new Map<string, number>();
  let clearedAt: number | null = null;

  const publish = () => {
    snapshot = pending.map((p) => p.command);
    changed.emit();
  };
  const drop = (p: Pending) => {
    if (!pending.includes(p)) return;
    clearTimeout(p.timer);
    pending = pending.filter((x) => x !== p);
    publish();
  };
  const noteRemoved = (command: QueueCommand) => {
    const now = Date.now();
    for (const [id, at] of removed) if (now - at > REMOVED_MS) removed.delete(id);
    if (command.op === "remove" || command.op === "merge") for (const id of command.ids) removed.set(id, now);
    if (command.op === "clear") clearedAt = now;
  };

  return {
    /** まだ届いていない先回りの命令（変わるたびに別の配列） */
    pending: () => snapshot,
    subscribe: changed.subscribe,
    /** いまのコアの送信待ちを知らせる（並びが変わったら、応答の届いた先回りを捨てる） */
    settle(state: Pick<QueueState, "messages" | "stops">) {
      key = queueKeyOf(state);
      for (const p of [...pending]) if (p.resolved && p.base !== key) drop(p);
    },
    /** failed を渡せば、失敗をそちらで知らせる */
    run(command: QueueCommand, failed = deps.failed): Promise<boolean> {
      noteRemoved(command);
      let p: Pending | null = null;
      if (PREDICTED.has(command.op)) {
        const item: Pending = { command, base: key, resolved: false, timer: setTimeout(() => drop(item), PREDICTION_MS) };
        p = item;
        pending = [...pending, item];
        publish();
      }
      return deps.run([command]).then(
        () => {
          if (p) {
            p.resolved = true;
            if (p.base !== key) drop(p);
          }
          return true;
        },
        (e: unknown) => {
          if (p) drop(p);
          failed(e);
          return false;
        },
      );
    },
    send(body: QueueSendBody): Promise<boolean> {
      return deps.send(body).then(
        () => true,
        (e: unknown) => {
          deps.failed(e);
          return false;
        },
      );
    },
    /** その指示をこの画面から消したか（送ったのではない） */
    removedHere(id: string): boolean {
      const at = removed.get(id) ?? clearedAt;
      return at !== null && Date.now() - at <= REMOVED_MS;
    },
  };
}
