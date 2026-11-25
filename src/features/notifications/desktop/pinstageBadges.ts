import type { Clock, TimerHandle } from "@/foundation/core/clock";
import type { BadgeFile } from "./pinstageBadgeFile";
import { encodePinstageBadges, type PinstageBadge } from "./pinstageBadgesModel";

const RETRY_MS = 1_000;
const RETRY_LIMIT = 3;

type Job = { items: readonly PinstageBadge[]; key: string; retries: number };

/** 書けるのは一度に 1 件。進行中の書き出し以外は、新しい内容で置き換える。 */
export function createPinstageBadgePublisher({ file, clock, pid, log }: {
  file: BadgeFile;
  clock: Pick<Clock, "now" | "setTimeout" | "clearTimeout">;
  pid: number;
  log(operation: "write" | "remove", error: unknown): void;
}) {
  let latest: Job | null = null;
  let inFlight: Promise<void> | null = null;
  let retryTimer: TimerHandle | null = null;
  let closing: Promise<void> | null = null;
  let lastWrittenKey: string | null = null;
  let loggedFailure = false;

  const cancelRetry = () => {
    clock.clearTimeout(retryTimer);
    retryTimer = null;
  };

  function drainLatest() {
    if (inFlight || closing || retryTimer || !latest) return;
    // 書き出し中の値と最新値が同じになっても、置き換えが成功した後で初めて省ける。
    if (latest.key === lastWrittenKey) {
      latest = null;
      return;
    }
    inFlight = write(latest).finally(() => {
      inFlight = null;
      drainLatest();
    });
  }

  function retryLatest(job: Job) {
    if (latest !== job || closing) return;
    if (job.retries >= RETRY_LIMIT) {
      latest = null;
      return;
    }
    job.retries++;
    retryTimer = clock.setTimeout(() => {
      retryTimer = null;
      drainLatest();
    }, RETRY_MS);
  }

  async function write(job: Job) {
    try {
      await file.write(encodePinstageBadges(job.items, pid, clock.now()));
      lastWrittenKey = job.key;
      loggedFailure = false;
      if (latest === job) latest = null;
    } catch (e) {
      if (!loggedFailure) log("write", e);
      loggedFailure = true;
      retryLatest(job);
    }
  }

  return {
    publish(items: readonly PinstageBadge[]): void {
      if (closing) return;
      const key = JSON.stringify(items);
      if (latest?.key === key) return;
      cancelRetry();
      latest = { items, key, retries: 0 };
      drainLatest();
    },
    close(): Promise<void> {
      if (closing) return closing;
      cancelRetry();
      latest = null;
      closing = (async () => {
        // 削除の後で rename されないよう、この起動の最後の操作にする。
        await inFlight;
        if (lastWrittenKey === null) return;
        try {
          await file.remove();
        } catch (e) {
          log("remove", e);
        }
      })();
      return closing;
    },
  };
}
