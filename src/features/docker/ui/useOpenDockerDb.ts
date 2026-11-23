// Docker タブの「DB で開く」: DB のサービスを DB タブで開く（open({ kind: "dockerDb" })。受け手は database: 登録済みの同じ DB ならその接続、なければ取り込みの画面）。
// 動いていなければ確かめてから起動し、動き出したら開く（起動に失敗したら開かない。失敗は見出しに出る）
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { DockerCompose, DockerServiceInfo } from "@shared/docker/types";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { confirm } from "@/foundation/ui/kit/ask";

declare module "@/foundation/ui/navigation/open" {
  interface OpenTargetMap {
    /** compose の DB のサービスを DB タブで開く（受け手は database） */
    dockerDb: { projectId: number; compose: string; service: string };
  }
}

export function useOpenDockerDb(projectId: number, compose: DockerCompose, service: DockerServiceInfo, start: () => void) {
  const [waiting, setWaiting] = useState(false);
  // 起動を送ったときの失敗の時刻（前の操作の失敗が残っていても、それでは止めない）と、起動の操作を見たか
  const failureAtStart = useRef<string | null>(null);
  const sawOperation = useRef(false);

  const open = () => openTarget({ kind: "dockerDb", projectId, compose: compose.key, service: service.name });

  const request = async () => {
    if (service.running > 0) return void open();
    const ok = await confirm({ title: `${service.name} が動いていません。起動しますか`, message: "起動して、動き出したら DB タブで開きます。", confirmLabel: "起動して開く" });
    if (!ok) return;
    failureAtStart.current = compose.failure?.at ?? null;
    sawOperation.current = false;
    setWaiting(true);
    start();
  };

  // 起動を待っている間、動き出したら開く（開くのはそのときの作業場所・サービスで）
  const openStarted = useEffectEvent(() => void open());
  useEffect(() => {
    if (!waiting) return;
    if (compose.operation) {
      sawOperation.current = true;
      return;
    }
    if (service.running > 0) {
      setWaiting(false);
      openStarted();
    } else if (sawOperation.current || (compose.failure && compose.failure.at !== failureAtStart.current)) {
      setWaiting(false);
    }
  }, [waiting, compose.operation, compose.failure, service.running]);

  return { request: () => void request(), waiting };
}
