// AI の Docker の守り: 別の作業場所（共有になった組を含む）・ほかのプロジェクトのコンテナとボリュームを止める・消す・作り直すコマンドと、
// まとめて止める・消すコマンドを見分け、流す前に承認カードで聞く文を返す（聞くのはプロバイダーのフック。権限モードに関係なく、Auto mode でも聞く）
import path from "node:path";
import type { RawContainer } from "../../docker/parse.js";
import { deepestWorkplace } from "../../docker/parse.js";
import type { Workplace } from "../../docker/listing.js";
import { workplaceText } from "@shared/docker/workplace";
import { isInside } from "../../system/paths.js";
import { dockerIntents, type ComposeSub, type ContainerVerb, type DockerIntent } from "./dockerCommand.js";

/** 承認カードに出す文（title = 何をしようとしているか・description = 補い） */
export interface DockerAsk {
  title: string;
  description: string;
}

/** チャットの実行ごとの守り（プロバイダーが Bash の前に呼ぶ。聞かないなら null） */
export interface DockerGuard {
  check(command: string): Promise<DockerAsk | null>;
}

/** 判定に使う Docker の様子（どれも 3 秒で打ち切り、答えなければ null = 見分けられないので通す） */
export interface DockerGuardFacts {
  /** チャットの作業場所（realpath） */
  workdir: string;
  /** プロジェクトの本体とワークツリー（realpath） */
  workplaces(): Promise<Workplace[]>;
  /** docker ps -a（working_dir は realpath） */
  containers(): Promise<RawContainer[] | null>;
  /** そのコマンドと同じ場所・同じ引数で compose に聞いた組の名前 */
  composeProject(intent: Extract<DockerIntent, { kind: "compose" }>): Promise<string | null>;
  /** ボリュームと、その compose の組の名前（ラベルがなければ null） */
  volumes(): Promise<{ name: string; project: string | null }[] | null>;
  /** 作業場所ごとの compose が答える組の名前（Docker タブと同じ読み方） */
  composeNames(): Promise<{ path: string; name: string }[]>;
}

/** 拒否されたとき AI に返す文 */
export const DOCKER_GUARD_DENIED = "利用者が拒否しました。自分の作業場所のものなら docker compose stop / down で止められます";

const BULK_ASK: DockerAsk = {
  title: "まとめて止める・消すコマンドです。どれが止まる・消えるかは流すまで分かりません",
  description: "ほかのプロジェクト・作業場所のコンテナにも及ぶことがあります。",
};
const NOTE = "Kickoff の AI の守りが、ほかの作業場所・プロジェクトの Docker に手を出すコマンドを流す前に確かめています。";

const VERB_TEXT: Record<ContainerVerb | ComposeSub, string> = {
  stop: "止めようとしています",
  kill: "止めようとしています",
  restart: "再起動しようとしています",
  rm: "消そうとしています",
  remove: "消そうとしています",
  pause: "一時停止しようとしています",
  down: "消そうとしています",
  up: "起動しようとしています",
  create: "作ろうとしています",
};

/** 作業場所の呼び名（「本体 | main」「WT | feat-x」）と短い呼び名（「本体（main）」） */
function placeOf(w: Workplace): { long: string; short: string } {
  const long = workplaceText(w.worktree_path === null ? null : w.path, w.branch);
  return { long, short: long.replace(/ \| (.+)$/, "（$1）") };
}

/** ほかのプロジェクトの呼び名 */
const otherPlace = (dir: string | null) => {
  const name = dir ? path.basename(dir) : "持ち主の分からない";
  return { long: `ほかのプロジェクト（${name}）`, short: `ほかのプロジェクト（${name}）` };
};

/** 名前・ID（頭だけでもよい）で指したコンテナ */
function findContainer(containers: readonly RawContainer[], ref: string): RawContainer | undefined {
  const bare = ref.replace(/^\//, "");
  return containers.find((c) => c.name === bare) ?? (/^[0-9a-f]{3,}$/.test(bare) ? containers.find((c) => c.id.startsWith(bare) || bare.startsWith(c.id)) : undefined);
}

/**
 * Bash のコマンドを判定し、聞くなら承認カードの文を返す（聞かないなら null）。相手の作業場所はコンテナのラベル working_dir で決める（Docker タブと同じ）。
 * ただし共有の組（その組の名前を、自分のほかの作業場所の compose も使う）のコンテナは、ラベルが自分の作業場所でも止める・消すときに聞く
 * （共有の組のコンテナは最後に起動した作業場所のラベルになるので、ワークツリーで起動し直したあとの down が本体の DB まで止めるため）。
 * compose のラベルがないコンテナ・ボリュームは通す（AI が自分で立てたものを自分で片付けられるように）。まとめて止める・消すものはいつも聞く
 */
export async function judgeDockerCommand(command: string, facts: DockerGuardFacts): Promise<DockerAsk | null> {
  const intents = dockerIntents(command, facts.workdir);
  if (intents.length === 0) return null;
  if (intents.some((i) => i.kind === "bulk")) return BULK_ASK;

  const workplaces = await facts.workplaces();
  const mine = deepestWorkplace(facts.workdir, workplaces);
  const ownerOf = (dir: string | null) => (dir ? deepestWorkplace(dir, workplaces) : undefined);
  const isMine = (dir: string | null) => (mine ? ownerOf(dir)?.path === mine.path : dir !== null && isInside(facts.workdir, dir));
  const placeOfDir = (dir: string | null) => {
    const owner = ownerOf(dir);
    return owner ? placeOf(owner) : otherPlace(dir);
  };
  let containers: RawContainer[] | null | undefined;
  const loadContainers = async () => (containers === undefined ? (containers = await facts.containers()) : containers);

  /** 組の名前 P を使う作業場所（compose が答える名前と、その組のコンテナの持ち主） */
  const usersOf = async (project: string, all: readonly RawContainer[]) => {
    const names = await facts.composeNames();
    const paths = new Set(names.filter((n) => n.name === project).map((n) => n.path));
    for (const c of all) if (c.project === project && c.dir) paths.add(ownerOf(c.dir)?.path ?? c.dir);
    return [...paths];
  };
  /** 組の名前 P を使う作業場所のうち、このチャットの作業場所でないもの */
  const otherUsersOf = async (project: string, all: readonly RawContainer[]) => (await usersOf(project, all)).filter((p) => p !== (mine?.path ?? facts.workdir));
  /** 作業場所のパスの短い呼び名（「本体（main）」・ほかのプロジェクト） */
  const shortPlaceOfPath = (p: string) => {
    const w = workplaces.find((x) => x.path === p);
    return w ? placeOf(w).short : otherPlace(p).short;
  };
  /** ボリュームを消すときの聞く文（その組の名前を使う作業場所がこのチャットの作業場所だけなら null） */
  const volumeAsk = async (volume: string, project: string, all: readonly RawContainer[]): Promise<string | null> => {
    const users = await usersOf(project, all);
    const others = await otherUsersOf(project, all);
    if (users.length > 0 && others.length === 0) return null;
    if (others.length > 0) {
      const place = shortPlaceOfPath(others[0]);
      return `${place}と共有の組（${project}）のボリューム ${volume} を消そうとしています。消すと${place}のデータも消え、戻せません`;
    }
    return `ボリューム ${volume} はこのチャットの作業場所の組のものではありません（組 ${project}）。消すと戻せません`;
  };
  /** ラベルが自分の作業場所のコンテナを止める・消すときの聞く文（その組の名前をほかの作業場所も使う = 共有の組なら。そうでなければ null） */
  const sharedAsk = async (project: string, all: readonly RawContainer[], what: string, verb: ContainerVerb | ComposeSub): Promise<string | null> => {
    const others = await otherUsersOf(project, all);
    if (others.length === 0) return null;
    const place = shortPlaceOfPath(others[0]);
    return `${place}と共有の組（${project}）${what}を${VERB_TEXT[verb]}。${place}も同じコンテナを使っています`;
  };

  const asks: string[] = [];
  for (const intent of intents) {
    if (intent.kind === "containers") {
      const all = await loadContainers();
      if (!all) continue;
      for (const ref of intent.names) {
        const c = findContainer(all, ref);
        if (!c || !c.project) continue;
        if (isMine(c.dir)) {
          const ask = await sharedAsk(c.project, all, `のコンテナ ${c.name} `, intent.verb);
          if (ask) asks.push(ask);
          continue;
        }
        asks.push(`${c.name} は${c.dir && ownerOf(c.dir) ? `別の作業場所（${placeOfDir(c.dir).long}）` : placeOfDir(c.dir).long}のコンテナです。${VERB_TEXT[intent.verb]}`);
      }
    } else if (intent.kind === "compose") {
      const project = intent.project ?? (await facts.composeProject(intent));
      if (!project) continue;
      const all = await loadContainers();
      if (!all) continue;
      const others = all.filter((c) => c.project === project && !isMine(c.dir));
      if (others.length > 0) {
        const place = placeOfDir(others[0].dir);
        asks.push(
          intent.sub === "up" || intent.sub === "create"
            ? `${place.short}と同じ組（${project}）です。起動すると${place.short}のコンテナが作り直されます`
            : `組（${project}）には${ownerOf(others[0].dir) ? `別の作業場所（${place.long}）` : place.long}のコンテナがあります。${VERB_TEXT[intent.sub]}`,
        );
      } else if (intent.sub !== "up" && intent.sub !== "create" && all.some((c) => c.project === project)) {
        // コンテナのラベルがどれも自分の作業場所でも、共有の組なら止める・消す前に聞く（本体の側の AI でも同じ）
        const ask = await sharedAsk(project, all, "", intent.sub);
        if (ask) asks.push(ask);
      }
      if (intent.removeVolumes) {
        const volumes = (await facts.volumes())?.filter((v) => v.project === project) ?? [];
        if (volumes.length > 0) {
          const ask = await volumeAsk(volumes.length === 1 ? volumes[0].name : `${volumes[0].name} など ${volumes.length} 個`, project, all);
          if (ask) asks.push(ask);
        }
      }
    } else if (intent.kind === "volumes") {
      const volumes = await facts.volumes();
      if (!volumes) continue;
      const all = (await loadContainers()) ?? [];
      for (const name of intent.names) {
        const project = volumes.find((v) => v.name === name)?.project;
        if (!project) continue;
        const ask = await volumeAsk(name, project, all);
        if (ask) asks.push(ask);
      }
    }
  }
  if (asks.length === 0) return null;
  const [title, ...rest] = [...new Set(asks)];
  return { title, description: [...rest, NOTE].join("\n") };
}
