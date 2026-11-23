// Docker タブを見ている間の流れ: docker events（見ている画面があるときだけ。events.ts）と、ログの画面のセッション（logs.ts）
import type { DockerList, DockerLogEvent } from "@shared/docker/types";
import type { Project } from "@shared/projects/types";
import { DockerEvents } from "./events";
import type { DockerLister } from "./list";
import { DockerLogSession } from "./logs";

export class DockerWatch {
  private readonly events: DockerEvents;

  constructor(
    private readonly lister: DockerLister,
    /** docker events が変化を知らせたとき（見ているプロジェクトへ） */
    changed: (projectIds: number[]) => void,
  ) {
    this.events = new DockerEvents(lister.cli, changed);
  }

  /** 見ています（画面が 20 秒ごとに送る）。docker events を立て、今の一覧を返す */
  async watch(project: Project): Promise<DockerList> {
    const list = await this.lister.list(project);
    this.events.lease(project.id);
    return list;
  }

  /** ログの画面（compose のコンテナごとの docker logs を 1 本にまとめる） */
  logSession(project: Project, composeKey: string, send: (event: DockerLogEvent) => void): DockerLogSession {
    return new DockerLogSession(this.lister.cli, () => this.lister.logSources(project, composeKey), send);
  }

  /** コアを閉じるとき（流しているものは stopAllStreams が止める） */
  close() {
    this.events.stop();
  }
}
