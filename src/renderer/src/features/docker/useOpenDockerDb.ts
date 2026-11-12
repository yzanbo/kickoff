// Docker タブの「DB で開く」（段階 2）: DB のサービスを DB タブで開く。登録済みの同じ DB ならその接続を選び、なければ取り込みの画面をその案を選んだ形で開く。
// 動いていなければ確かめてから起動し、動き出したら開く（起動に失敗したら開かない。失敗は見出しに出る）
import { useEffect, useRef, useState } from "react";
import type { DockerCompose, DockerService } from "@shared/types";
import { api } from "@/api";
import { navigate } from "@/app/router";
import { requestDbClient } from "@/features/database/dbClientRequests";
import { confirmDialog, reportFailure } from "@/ui/dialogs";
import { showToast } from "@/ui/toast";

export function useOpenDockerDb(projectId: number, compose: DockerCompose, service: DockerService, start: () => void) {
  const [waiting, setWaiting] = useState(false);
  // 起動を送ったときの失敗の時刻（前の操作の失敗が残っていても、それでは止めない）と、起動の操作を見たか
  const failureAtStart = useRef<string | null>(null);
  const sawOperation = useRef(false);

  const open = async () => {
    try {
      const target = await api.dockerDbTarget(projectId, compose.key, service.name);
      if (target.blocked) return showToast(target.blocked);
      const place = `project-${projectId}`;
      if (target.connection_id !== null) requestDbClient(place, { kind: "focus", connectionId: target.connection_id });
      else if (target.candidate) requestDbClient(place, { kind: "import", candidate: target.candidate });
      else return;
      navigate({ name: "project", id: projectId, tab: "db" });
    } catch (e) {
      reportFailure(`${service.name} を DB で開けませんでした`)(e);
    }
  };

  const request = async () => {
    if (service.running > 0) return void open();
    const ok = await confirmDialog({ title: `${service.name} が動いていません。起動しますか`, message: "起動して、動き出したら DB タブで開きます。", confirmLabel: "起動して開く" });
    if (!ok) return;
    failureAtStart.current = compose.failure?.at ?? null;
    sawOperation.current = false;
    setWaiting(true);
    start();
  };

  useEffect(() => {
    if (!waiting) return;
    if (compose.operation) {
      sawOperation.current = true;
      return;
    }
    if (service.running > 0) {
      setWaiting(false);
      void open();
    } else if (sawOperation.current || (compose.failure && compose.failure.at !== failureAtStart.current)) {
      setWaiting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, compose.operation, compose.failure, service.running]);

  return { request: () => void request(), waiting };
}
