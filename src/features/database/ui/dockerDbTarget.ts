// Docker タブの「DB で開く」の受け手（open({ kind: "dockerDb" })。行き先の型は docker の useOpenDockerDb.ts が足す）:
// 登録済みの同じ DB ならその接続を選び、なければ取り込みの画面をその案を選んだ形で開く（DB タブで）
import type { DockerDbTarget } from "@shared/database/types";
import { request, withQuery } from "@/foundation/ui/api/http";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { showToast } from "@/foundation/ui/kit/toast";
import type { OpenTargetHandler } from "@/foundation/ui/navigation/open";
import { navigate } from "@/foundation/ui/navigation/router";
import { requestDbClient } from "./dbClientRequests";

/** 行き先（登録済みの同じ DB の接続・取り込みの案・押せない理由。受け口は database のコアの routes/dockerDb.ts） */
const fetchDockerDbTarget = (projectId: number, compose: string, service: string) =>
  request<DockerDbTarget>("GET", withQuery(`/api/projects/${projectId}/docker/db`, { compose, service }));

async function openDockerDb(projectId: number, compose: string, service: string) {
  try {
    const target = await fetchDockerDbTarget(projectId, compose, service);
    if (target.blocked) return showToast(target.blocked);
    const place = `project-${projectId}`;
    if (target.connection_id !== null) requestDbClient(place, { kind: "focus", connectionId: target.connection_id });
    else if (target.candidate) requestDbClient(place, { kind: "import", candidate: target.candidate });
    else return;
    navigate({ name: "project", id: projectId, tab: "db" });
  } catch (e) {
    reportFailure(`${service} を DB で開けませんでした`)(e);
  }
}

export const dockerDbTarget: OpenTargetHandler<"dockerDb"> = {
  kind: "dockerDb",
  open({ projectId, compose, service }) {
    void openDockerDb(projectId, compose, service);
    return true;
  },
};
