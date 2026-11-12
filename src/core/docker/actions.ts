// Docker タブの操作を docker のコマンドの並びにする（純粋な関数。仕様書の 6 章の表）。
// compose のファイルを要るのは up だけ: サービスの行はコンテナの ID、compose の停止・片付けは -p で、ファイルのないフォルダ（/）で流す
import path from "node:path";
import type { DockerAction, DockerCompose, DockerFailure } from "@shared/types";
import { Invalid } from "../http/errors.js";

/** 流す 1 つのコマンド（docker の引数・フォルダ・つないだまま受け取るか） */
export interface DockerStep {
  args: string[];
  cwd: string;
  /** 流れ続けるコマンド（up -d）。［中止］できる */
  stream: boolean;
}

export interface DockerPlan {
  steps: DockerStep[];
  /** up を流すか（別の作業場所と同じ組になる起動の確かめが要る） */
  usesUp: boolean;
}

export interface PlanInput {
  compose: DockerCompose;
  /** up に -f で渡すファイル */
  upFiles: string[];
  action: DockerAction;
  service?: string;
  container?: string;
  /** ［相手を止めて起動］: やり直す元の操作と、ポートでぶつかった相手（最後の失敗） */
  retry?: Pick<DockerFailure, "action" | "service" | "conflicts">;
}

/** -p だけで流すフォルダ（compose のファイルがあるフォルダで流すと、そのファイルが読まれて札付きのサービスが動いたまま残る） */
const NO_FILE_DIR = "/";

const ids = (list: { id: string }[]) => list.map((c) => c.id);

/** 操作 → コマンドの並び。できない操作は Invalid（400） */
export function planDockerAction({ compose, upFiles, action, service, container, retry }: PlanInput): DockerPlan {
  const name = compose.project_name;
  const fileShared = compose.shares.some((s) => s.kind === "file");
  const allContainers = compose.services.flatMap((s) => s.containers);
  const runningOneoffs = compose.services.flatMap((s) => s.oneoffs).filter((c) => c.state === "running" || c.state === "paused" || c.state === "restarting");
  const upDir = upFiles[0] ? path.dirname(upFiles[0]) : NO_FILE_DIR;
  const fArgs = upFiles.flatMap((f) => ["-f", f]);
  const needName = () => {
    if (!name) throw new Invalid("この compose の組の名前が分かりません");
    return name;
  };
  const needUp = () => {
    if (compose.start_blocked) throw new Invalid(compose.start_blocked);
    return needName();
  };
  const up = (extra: string[]): DockerStep => ({ args: ["compose", "-p", needUp(), ...fArgs, ...extra], cwd: upDir, stream: true });
  const docker = (args: string[]): DockerStep => ({ args, cwd: NO_FILE_DIR, stream: false });
  const svc = () => {
    const found = compose.services.find((s) => s.name === service);
    if (!found) throw new Invalid(`サービス ${service ?? ""} がありません`);
    return found;
  };

  switch (action) {
    case "start_all": {
      // 札付き（profiles）は含めない。作ってあるものは start（作り直さない・増やした数のまま）、作っていないものだけ up -d --no-deps
      const regular = compose.services.filter((s) => s.profiles.length === 0);
      if (!compose.created) return { steps: [up(["up", "-d"])], usesUp: true };
      const made = regular.filter((s) => s.containers.length > 0).map((s) => s.name);
      const missing = regular.filter((s) => s.containers.length === 0).map((s) => s.name);
      const steps: DockerStep[] = [];
      if (made.length) steps.push(docker(["compose", "-p", needName(), "start", ...made]));
      if (missing.length) steps.push(up(["up", "-d", "--no-deps", ...missing]));
      if (!steps.length) throw new Invalid("起動するサービスがありません");
      return { steps, usesUp: missing.length > 0 };
    }
    case "recreate": {
      if (!service) return { steps: [up(["up", "-d"])], usesUp: true };
      // 1 つのサービスだけ作り直す（ポートの取り合いで起動に失敗したあと、ポートを出さずに動いているコンテナを直す）
      const s = svc();
      const profile = s.profiles[0];
      return { steps: [up([...(profile ? ["--profile", profile] : []), "up", "-d", "--no-deps", "--force-recreate", s.name])], usesUp: true };
    }
    case "stop_all": {
      // 同じ作業場所のほかの compose と同じ組なら、-p で止めると両方止まるので、この見出しのコンテナの ID で
      if (fileShared) {
        const targets = [...allContainers.filter((c) => c.state !== "exited" && c.state !== "created"), ...runningOneoffs];
        if (!targets.length) throw new Invalid("止めるコンテナがありません");
        return { steps: [docker(["stop", ...ids(targets)])], usesUp: false };
      }
      const steps = [docker(["compose", "-p", needName(), "stop"])];
      if (runningOneoffs.length) steps.push(docker(["stop", ...ids(runningOneoffs)]));
      return { steps, usesUp: false };
    }
    case "restart_all":
      if (fileShared) return { steps: [docker(["restart", ...ids(allContainers)])], usesUp: false };
      return { steps: [docker(["compose", "-p", needName(), "restart"])], usesUp: false };
    case "down": {
      if (compose.down_blocked) throw new Invalid(compose.down_blocked);
      // 使い捨てが残っているとネットワークも消せないので、先に消す
      const oneoffs = compose.services.flatMap((s) => s.oneoffs);
      const steps: DockerStep[] = [];
      if (oneoffs.length) steps.push(docker(["rm", "-f", ...ids(oneoffs)]));
      steps.push(docker(["compose", "-p", needName(), "down"]));
      return { steps, usesUp: false };
    }
    case "start": {
      const s = svc();
      if (s.containers.length) return { steps: [docker(["start", ...ids(s.containers)])], usesUp: false };
      // 作っていないサービス: そのサービスだけ up -d（札付きは札を付けて）
      const profile = s.profiles[0];
      return { steps: [up([...(profile ? ["--profile", profile] : []), "up", "-d", s.name])], usesUp: true };
    }
    case "stop":
    case "restart": {
      const s = svc();
      if (!s.containers.length) throw new Invalid(`${s.name} はまだ作っていません`);
      return { steps: [docker([action, ...ids(s.containers)])], usesUp: false };
    }
    case "unpause": {
      const paused = svc().containers.filter((c) => c.state === "paused");
      if (!paused.length) throw new Invalid("一時停止しているコンテナがありません");
      return { steps: [docker(["unpause", ...ids(paused)])], usesUp: false };
    }
    case "stop_container": {
      const target = compose.services.flatMap((s) => [...s.containers, ...s.oneoffs]).find((c) => c.id === container);
      if (!target) throw new Invalid("この compose のコンテナではありません");
      return { steps: [docker(["stop", target.id])], usesUp: false };
    }
    case "stop_others_and_start": {
      if (!retry?.conflicts.length) throw new Invalid("止める相手がありません。もう一度起動してください");
      // 相手を止め（データは残る）、ぶつかって起動できなかったサービスは作り直す（ポートで起動に失敗したコンテナは、あとで起動しても Mac にポートを出さない。
      // 止め直しても戻らず、作り直すまで直らないことを 2026-11-13 に OrbStack で確かめた）。すべて起動なら、残りも同じ起動で
      const ports = new Set(retry.conflicts.map((c) => c.port));
      const blocked = compose.services.filter((s) => (retry.service ? s.name === retry.service : true) && s.published.some((p) => ports.has(p)));
      const profiles = [...new Set(blocked.flatMap((s) => s.profiles.slice(0, 1)))];
      const steps = [docker(["stop", ...new Set(retry.conflicts.map((c) => c.container_id))])];
      if (blocked.length) steps.push(up([...profiles.flatMap((p) => ["--profile", p]), "up", "-d", "--no-deps", "--force-recreate", ...blocked.map((s) => s.name)]));
      if (!retry.service || !blocked.length) steps.push(...planDockerAction({ compose, upFiles, action: retry.action, service: retry.service ?? undefined }).steps);
      return { steps, usesUp: true };
    }
  }
}
