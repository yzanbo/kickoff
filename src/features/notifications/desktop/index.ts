import type { WebContents } from "electron";
import { systemClock } from "@/foundation/core/clock";
import { createRendererLifetimeWatcher } from "@/foundation/desktop/app/rendererLifetime";
import type { IpcHandlers } from "@/foundation/desktop/ipc/register";
import { createPinstageBadgeFile } from "./pinstageBadgeFile";
import { createPinstageBadgePublisher } from "./pinstageBadges";
import { pinstageBadgeItems } from "./pinstageBadgesModel";

/** 製品版のメインのウィンドウだけを集計元にする。開発版ではファイルの口も作らない。 */
export function createPinstageBadges({ platform, packaged, appData, mainContents, log }: {
  platform: NodeJS.Platform;
  packaged: boolean;
  appData(): string;
  mainContents(): WebContents | undefined;
  log(operation: "write" | "remove", error: unknown): void;
}): { setStateBadges: IpcHandlers["notifications"]["setStateBadges"]; close(): Promise<void> } {
  if (platform !== "darwin" || !packaged) return { setStateBadges: () => {}, close: async () => {} };

  const publisher = createPinstageBadgePublisher({ file: createPinstageBadgeFile(appData), clock: systemClock, pid: process.pid, log });
  let owner: WebContents | null = null;
  const watchOwner = createRendererLifetimeWatcher((contents) => {
    if (owner !== contents) return;
    owner = null;
    publisher.publish([]);
  });
  return {
    setStateBadges({ sender, senderFrame }, badges) {
      if (sender !== mainContents() || !senderFrame || senderFrame !== sender.mainFrame) return;
      owner = sender;
      watchOwner(sender);
      publisher.publish(pinstageBadgeItems(badges));
    },
    close: publisher.close,
  };
}
