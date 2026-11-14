// AI の Docker の守りの 1 段目（純粋な関数）: Bash の文から、止める・消す・作り直す docker のコマンドを取り出す
import path from "node:path";
import { expandHome } from "../../system/paths.js";
import { ASSIGNMENT, commandWords, splitCommands, type Word } from "./shellWords.js";

/** コンテナを名前・ID で止める・消すもの */
const CONTAINER_VERBS = ["stop", "kill", "restart", "rm", "remove", "pause"] as const;
export type ContainerVerb = (typeof CONTAINER_VERBS)[number];
/** compose の聞くサブコマンド（止める・消す・作り直す） */
const COMPOSE_SUBS = ["stop", "down", "restart", "kill", "rm", "up", "create"] as const;
export type ComposeSub = (typeof COMPOSE_SUBS)[number];

/**
 * 守りが見るコマンド 1 つ。bulk = まとめて止める・消す（相手を見ずにいつも聞く）・containers = 名前で書いた相手（A）・
 * volumes = ボリュームの削除・compose = compose のサブコマンド（組の名前は -p か、同じ場所・同じ引数で compose に聞く B）
 */
export type DockerIntent =
  | { kind: "bulk"; command: string }
  | { kind: "containers"; verb: ContainerVerb; names: string[] }
  | { kind: "volumes"; names: string[] }
  | {
      kind: "compose";
      sub: ComposeSub;
      /** down -v / --volumes */
      removeVolumes: boolean;
      /** サブコマンドより前の -p・-f・--project-directory・--env-file・--profile（compose に名前を聞くとき同じものを渡す） */
      options: string[];
      /** -p で書いた組の名前（なければ null） */
      project: string | null;
      /** 流す場所（cd を追ったもの。読み取れなければ null） */
      cwd: string | null;
      /** 行頭の VAR=値・export で決めた環境変数 */
      env: Record<string, string>;
    };

const isDockerName = (w: string) => {
  const base = path.basename(w);
  return base === "docker" || base === "docker-compose";
};

/** docker 自身の、値を取るオプション */
const DOCKER_GLOBAL_WITH_VALUE = new Set(["--context", "-c", "--host", "-H", "--config", "--log-level", "-l", "--tlscacert", "--tlscert", "--tlskey"]);
/** docker stop / kill / rm などの、値を取るオプション */
const CONTAINER_WITH_VALUE = new Set(["-t", "--time", "--timeout", "-s", "--signal"]);
/** docker compose の、サブコマンドより前の値を取るオプション（KEEP は compose に名前を聞くときにも渡すもの） */
const COMPOSE_WITH_VALUE = new Set(["-p", "--project-name", "-f", "--file", "--project-directory", "--env-file", "--profile", "--ansi", "--progress", "--parallel"]);
const COMPOSE_KEEP = new Set(["-p", "--project-name", "-f", "--file", "--project-directory", "--env-file", "--profile"]);

/** オプションでない引数（値を取るオプションの値は飛ばす） */
function positionals(args: Word[], withValue: ReadonlySet<string>): Word[] {
  const out: Word[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i].text;
    if (a.startsWith("-")) {
      if (withValue.has(a)) i++;
      continue;
    }
    out.push(args[i]);
  }
  return out;
}

function parseCompose(args: Word[], cwd: string | null, env: Record<string, string>): DockerIntent | null {
  const options: string[] = [];
  let project: string | null = null;
  let i = 0;
  for (; i < args.length && args[i].text.startsWith("-"); i++) {
    const raw = args[i].text;
    const eq = raw.indexOf("=");
    const name = eq > 0 ? raw.slice(0, eq) : raw;
    if (!COMPOSE_WITH_VALUE.has(name)) continue;
    const value = eq > 0 ? { text: raw.slice(eq + 1), dynamic: args[i].dynamic } : args[++i];
    // 値が読み取れない（変数・$(…)）なら、どの組に効くか分からないので見ない
    if (!value || value.dynamic) return null;
    if (COMPOSE_KEEP.has(name)) options.push(name, value.text);
    if (name === "-p" || name === "--project-name") project = value.text;
  }
  const sub = args[i]?.text as ComposeSub | undefined;
  if (!sub || !(COMPOSE_SUBS as readonly string[]).includes(sub)) return null;
  const rest = args.slice(i + 1).map((w) => w.text);
  const removeVolumes = sub === "down" && rest.some((a) => a === "-v" || a === "--volumes" || /^-[a-z]*v[a-z]*$/.test(a));
  return { kind: "compose", sub, removeVolumes, options, project, cwd, env };
}

function parseDocker(args: Word[], raw: string, cwd: string | null, env: Record<string, string>, composeBinary: boolean): DockerIntent | null {
  if (composeBinary) return parseCompose(args, cwd, env);
  let i = 0;
  while (i < args.length && args[i].text.startsWith("-")) i += DOCKER_GLOBAL_WITH_VALUE.has(args[i].text) ? 2 : 1;
  let sub = args[i]?.text;
  let rest = args.slice(i + 1);
  if (sub === "compose") return parseCompose(rest, cwd, env);
  if (["system", "volume", "network", "image", "builder", "container"].includes(sub ?? "") && rest[0]?.text === "prune") return { kind: "bulk", command: raw };
  if (sub === "volume" && (rest[0]?.text === "rm" || rest[0]?.text === "remove")) {
    const names = positionals(rest.slice(1), new Set());
    if (names.some((w) => w.dynamic)) return { kind: "bulk", command: raw };
    return names.length ? { kind: "volumes", names: names.map((w) => w.text) } : null;
  }
  if (sub === "container") {
    sub = rest[0]?.text;
    rest = rest.slice(1);
  }
  if (!sub || !(CONTAINER_VERBS as readonly string[]).includes(sub)) return null;
  const names = positionals(rest, CONTAINER_WITH_VALUE);
  // $(docker ps -q) などで相手を流すまで決めないものは、まとめて止める・消すもの
  if (names.some((w) => w.dynamic)) return { kind: "bulk", command: raw };
  return names.length ? { kind: "containers", verb: sub as ContainerVerb, names: names.map((w) => w.text) } : null;
}

/** cd の行き先（読み取れなければ null） */
function cdTarget(arg: Word | undefined, cwd: string | null): string | null {
  if (!arg) return expandHome("~");
  if (arg.dynamic || arg.text === "-") return null;
  const target = expandHome(arg.text);
  if (path.isAbsolute(target)) return path.normalize(target);
  return cwd === null ? null : path.resolve(cwd, target);
}

/**
 * Bash の文から、守りが見る docker のコマンドを取り出す。cd で場所を追い、行頭の VAR=値（そのコマンドだけ）と export（その後ずっと）を環境変数として受ける。
 * xargs で docker を流すもの・相手を $(…) で決めるもの・prune はまとめて止める・消すもの。読み取れない書き方（変数の展開・eval）は、まとめてでなければ見ない
 */
export function dockerIntents(command: string, cwd: string | null): DockerIntent[] {
  if (!/docker/.test(command)) return [];
  const intents: DockerIntent[] = [];
  const exported: Record<string, string> = {};
  let here = cwd;
  for (const segment of splitCommands(command)) {
    // 行頭の VAR=値・前に付けるもの（sudo・env など）を外す
    const stripped = commandWords(segment);
    const words = stripped.words;
    const env: Record<string, string> = { ...exported, ...stripped.env };
    const head = words[0];
    if (!head) continue;
    if (head.text === "export") {
      for (const w of words.slice(1)) if (ASSIGNMENT.test(w.text) && !w.dynamic) exported[w.text.slice(0, w.text.indexOf("="))] = w.text.slice(w.text.indexOf("=") + 1);
      continue;
    }
    if (head.text === "cd" || head.text === "pushd") {
      here = cdTarget(words[1], here);
      continue;
    }
    if (head.text === "xargs" && words.some((w) => isDockerName(w.text))) {
      intents.push({ kind: "bulk", command: segment.map((w) => w.text).join(" ") });
      continue;
    }
    if (!isDockerName(head.text)) continue;
    const raw = words.map((w) => w.text).join(" ");
    const intent = parseDocker(words.slice(1), raw, here, env, path.basename(head.text) === "docker-compose");
    if (intent) intents.push(intent);
  }
  return intents;
}
