// AI へ送る定型文（送るとチャットに自分の発言として残る）。コアの再開の段取りと、画面の操作（再試行・サブエージェントへの指示）で共有する。Node 依存なし
import type { AppSettings } from "@shared/types";

// ---- 止まったあとの再開（コアの chat/recovery/rules.ts が送る） ----

/** 通信が戻って自動で再開するときに送る指示 */
export const RESUME_PROMPT = "（通信が戻ったので自動で再開します）通信が切れて止まったところから、作業を続けてください。";

/**
 * 自動で再開するときの指示。通信の切断で止まったサブエージェントがあれば、SendMessage で続きから再開するよう頼む
 * （Claude Code はサブエージェントの記録から続きを始める。記録が見つからないときだけ、同じ依頼で立ち上げ直す）
 */
export function resumePrompt(agents: readonly { agentId: string; description: string }[]): string {
  if (agents.length === 0) return RESUME_PROMPT;
  return [
    RESUME_PROMPT,
    "",
    "通信の切断で、次のサブエージェントも止まっています。それぞれ SendMessage（宛先は ID）で、止まったところから続けるよう伝えて再開させてください。再開できないもの（記録が見つからないなど）だけ、同じ依頼で立ち上げ直してください。",
    ...agents.map((a) => `- 「${a.description}」（ID: ${a.agentId}）`),
  ].join("\n");
}

/** アプリを起動し直したときの確かめで「中断した作業を続けてから送る」を選んだときに送る指示（送信待ちは、この作業が終わってから送る） */
export const RESTART_RESUME_PROMPT =
  "（アプリを起動し直したので再開します）アプリの終了で止まったところから、作業を続けてください。途中だったサブエージェントがあれば、SendMessage で続きから再開させてください（再開できなければ、同じ依頼で立ち上げ直してください）。";

/** 使用枠が戻って、続けると答えたときに送る指示 */
export const USAGE_RESUME_PROMPT = "（使用枠が戻ったので再開します）使用枠の上限で止まったところから、作業を続けてください。";

// ---- 失敗した作業の再試行（画面の FailedTurnActions） ----

/** 続きから再試行するときに送る指示 */
export const RETRY_PROMPT = "（再試行）さきほどの作業は途中で失敗しました。止まったところから、作業を続けてください。";

// ---- サブエージェント（画面のサブエージェントの一覧・タブ） ----
// Kickoff からサブエージェントへ直接は送れないので、メインエージェントに SendMessage で同じサブエージェントへそのまま伝えてもらう
// （サブエージェントは記録から続きを始める）。メインのチャットには自分の発言として残り、サブエージェントのタブでは、その指示だけを自分の発言として出す

const RELAY_HEAD = "【サブエージェントへの追加の指示】";

/** やり直すときに依頼文をそのまま添える長さの上限（超えたら、前の依頼と同じものを使うよう頼む） */
const MAX_PROMPT_IN_RETRY = 6000;

/** サブエージェントへの追加の指示として、メインエージェントに送る文（1 行目に宛先、本文は区切りの後ろにそのまま） */
export function relayMessage(agentId: string, name: string, text: string): string {
  return [
    `${RELAY_HEAD}「${name}」（ID: ${agentId}）`,
    "SendMessage でこのサブエージェントに、下の指示をそのまま伝えてください。あなた自身では作業せず、サブエージェントの報告が届いたら要点を伝えてください。",
    "---",
    text,
  ].join("\n");
}

const SUBAGENT_ASK_HEAD = "【サブエージェントについて聞く】";
/** 見分けるときの頭（言葉を整理する前の「【サブエージェントに直接聞く】」で始めた子チャットも見分ける） */
const SUBAGENT_ASK_HEADS = [SUBAGENT_ASK_HEAD, "【サブエージェントに直接聞く】"];

/**
 * サブエージェントについて子チャットで聞くときの最初の指示（1 行目に宛先、本文は区切りの後ろにそのまま）。
 * 子チャットの AI は、添付したサブエージェントの会話の記録を読んで、そのサブエージェントの続きとして答える（メインエージェントの会話には混ざらない）
 */
export function subagentAskMessage(agentId: string, name: string, fileName: string, text: string): string {
  return [
    `${SUBAGENT_ASK_HEAD}「${name}」（ID: ${agentId}）`,
    `添付の「${fileName}」は、親のチャットのサブエージェント「${name}」の会話の記録（依頼・発言・使ったツールと結果・報告）です。あなたはこのサブエージェントの続きとして、まず記録を読んでから、下の質問に答えてください。続きの作業を頼まれたら、この子チャットで行ってください（サブエージェント本人とメインエージェントには伝わりません）。`,
    "---",
    text,
  ].join("\n");
}

/** 子チャットの最初の発言が、サブエージェントについて聞いたものなら、宛先の名前と本文（違えば undefined） */
export function subagentAskOf(message: string): { name: string; text: string } | undefined {
  if (!SUBAGENT_ASK_HEADS.some((head) => message.startsWith(head))) return undefined;
  const at = message.indexOf("\n---\n");
  const name = /「(.*)」（ID: /.exec(message.split("\n")[0])?.[1];
  return at < 0 || name === undefined ? undefined : { name, text: message.slice(at + 5) };
}

/** 文がサブエージェントへの追加の指示なら、宛先の名前と本文（違えば undefined。送信待ちの行で、AI への前置きを隠して見せる） */
export function relayOf(message: string): { name: string; text: string } | undefined {
  if (!message.startsWith(RELAY_HEAD)) return undefined;
  const at = message.indexOf("\n---\n");
  const name = /「(.*)」（ID: /.exec(message.split("\n")[0])?.[1];
  return at < 0 || name === undefined ? undefined : { name, text: message.slice(at + 5) };
}

/** チャットの自分の発言が、このサブエージェントへの追加の指示なら、その本文（違えば undefined） */
export function relayedText(message: string, agentId: string): string | undefined {
  if (!message.startsWith(RELAY_HEAD) || !message.split("\n")[0].includes(`（ID: ${agentId}）`)) return undefined;
  const at = message.indexOf("\n---\n");
  return at < 0 ? undefined : message.slice(at + 5);
}

/**
 * 止まったサブエージェントの再開を頼む文。メインエージェントに、SendMessage で止まったところから続けさせる
 * （記録が見つからないなど再開できないときだけ、同じ依頼で立ち上げ直してもらう）
 */
export function resumeRequest(agentId: string, name: string, { outputLimit = false }: { outputLimit?: boolean } = {}): string {
  return [
    `【サブエージェントの再開】「${name}」（ID: ${agentId}）`,
    "このサブエージェントは途中で止まっています。SendMessage でこのサブエージェントに、止まったところから続けるよう伝えて再開させてください。再開できないとき（記録が見つからないなど）だけ、同じ依頼で立ち上げ直してください。あなた自身では作業せず、報告が届いたら要点を伝えてください。",
    ...(outputLimit ? [OUTPUT_LIMIT_HINT] : []),
  ].join("\n");
}

/** 出力の上限で止まったものは、同じやり方では同じところで止まるので、短く分けるよう添える（再開・やり直すで共通） */
const OUTPUT_LIMIT_HINT =
  "1 回の返答で書ける量の上限で止まったので、「報告は短くまとめる」「大きなファイルは何回かに分けて書く」と添えて伝えてください。";

/**
 * サブエージェントのやり直しを頼む文。同じ依頼で新しく立ち上げ直してもらう（前の回の続きはしない）。
 * 依頼文は長すぎなければそのまま添える（会話を要約したあとでも、同じ依頼を渡せるように）
 */
export function retryRequest(entry: { description: string; subagentType?: string; prompt?: string; outputLimit?: boolean }): string {
  const type = entry.subagentType ? `（subagent_type: ${entry.subagentType}）` : "";
  const head = [
    `【サブエージェントのやり直し】「${entry.description}」`,
    `このサブエージェントを、同じ依頼で新しく立ち上げ直してください${type}。前の回の続きではなく、最初から進めます（前の回が途中まで変えたものがあれば、確かめてから進めるよう依頼に添えてください）。あなた自身では作業せず、報告が届いたら要点を伝えてください。`,
    ...(entry.outputLimit ? [OUTPUT_LIMIT_HINT] : []),
  ];
  if (!entry.prompt || entry.prompt.length > MAX_PROMPT_IN_RETRY) return [...head, "依頼の文は、前にこのサブエージェントを起動したときと同じものを使ってください。"].join("\n");
  return [...head, "依頼の文は次のとおりです。", "---", entry.prompt].join("\n");
}

/**
 * 親に届かなかった報告を、次の指示を待たずにいま渡す（報告の本文はコアが送るときに添える。chat/reportHandover.ts）
 */
export const HAND_OVER_NOW = "届いていなかったサブエージェントの報告を渡します。読んで、必要なら作業を続けてください。";

// ---- 圧縮前指示・圧縮後指示（会話を圧縮する前・後に AI に送る指示。どちらも設定の共通の指示と、プロジェクトの指示） ----
// 圧縮前指示: 要約するといまの会話の細かい内容が失われるので、その前にメモを残すなどを頼む。
// 圧縮後指示: 要約したあとの会話で、残したメモを読み直すなどを頼む（圧縮が終わったら、預かっていた指示より先に送る）。
// 送ったものはチャットに「圧縮前指示」「圧縮後指示」の札付きの自分の発言として残る

/** 圧縮前指示・圧縮後指示の長さの上限（文字。共通・プロジェクトのそれぞれ） */
export const COMPACT_PROMPT_MAX = 4000;

/** 圧縮の前・後のどちらの指示か（圧縮前指示 / 圧縮後指示） */
export type CompactPromptKind = "pre" | "post";

/** 種類ごとの保存する項目（設定・プロジェクトで同じ名前。文と、送るか（オン / オフ。オフでも文は残す）） */
export const COMPACT_PROMPT_FIELDS = {
  pre: { text: "pre_compact_prompt", enabled: "pre_compact_enabled" },
  post: { text: "post_compact_prompt", enabled: "post_compact_enabled" },
} as const;

type CompactPromptSource = Pick<AppSettings, "pre_compact_prompt" | "post_compact_prompt" | "pre_compact_enabled" | "post_compact_enabled">;

/** 設定またはプロジェクトの、送る指示（オフ・空なら null） */
export function activeCompactPrompt(kind: CompactPromptKind, source: CompactPromptSource | undefined): string | null {
  const { text, enabled } = COMPACT_PROMPT_FIELDS[kind];
  return source?.[enabled] ? (source[text]?.trim() ?? null) || null : null;
}

/** そのプロジェクトで送る圧縮前指示・圧縮後指示（オンの分を共通 → プロジェクトの順に空行でつなぐ。どちらもなければ null） */
export function compactPromptFor(kind: CompactPromptKind, settings: CompactPromptSource | undefined, project: CompactPromptSource | undefined): string | null {
  const parts = [activeCompactPrompt(kind, settings), activeCompactPrompt(kind, project)].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

const PRE_COMPACT_HEAD = "【圧縮前指示】";
const PRE_COMPACT_LOSS = "（要約すると、いまの会話の細かい内容は失われます）";

/** 自動の圧縮の前の指示が済んだ合図（AI がこの一文を書いたら、止めていた圧縮を通す） */
export const PRE_COMPACT_DONE = "圧縮前指示を済ませました";

/** 手で圧縮する前に送る文（この指示の作業が終わってから圧縮する） */
export function manualPreCompactMessage(text: string): string {
  return [`${PRE_COMPACT_HEAD}このあと会話を圧縮します${PRE_COMPACT_LOSS}。圧縮の前に、次のことをしてください。`, "---", text].join("\n");
}

/** 作業中に手で圧縮を頼んだときに、いまの作業へそのまま足す文（いまの作業が終わったら圧縮する。済んだら元の作業に戻ってもらう） */
export function busyPreCompactMessage(text: string): string {
  return [
    `${PRE_COMPACT_HEAD}いまの作業が終わったら、会話を圧縮します${PRE_COMPACT_LOSS}。圧縮の前に、次のことをしてください。済んだら、途中の作業があればそのまま続けてください。`,
    "---",
    text,
  ].join("\n");
}

/** 上限に近づいて自動で圧縮する前に、作業の途中で足す文（済んだら合図の一文を書いてから、元の作業に戻ってもらう） */
export function autoPreCompactMessage(text: string): string {
  return [
    `${PRE_COMPACT_HEAD}コンテキストが上限に近づいたので、まもなく会話を自動で圧縮します${PRE_COMPACT_LOSS}。圧縮の前に、次のことをしてください。` +
      `済んだら「${PRE_COMPACT_DONE}」とだけ書いてから、元の作業に戻ってください（その一文を合図に圧縮します）。` +
      "作業が残っていれば、合図の一文だけで返答を終えず、同じ返答の中で続けてツールを呼んでください（圧縮は次にツールを呼んだときに始まります）。",
    "---",
    text,
  ].join("\n");
}

/**
 * 圧縮前指示の合図のあと、AI がツールを呼ばずに裏の作業（開発サーバー・監視など）の終わりだけを待って止まったときに、コアが足す文。
 * 圧縮は Claude Code が次に送るときに始まるので、この文を送って圧縮を走らせる（裏の作業が自分では終わらないと、いつまでも始まらないため）
 */
export const PRE_COMPACT_NUDGE =
  "【Kickoff】圧縮前指示の合図を受け取ったので、ここで会話を圧縮します（裏の作業の終わりを待っていると圧縮が始まらないため、Kickoff が送った発言です）。" +
  "圧縮が終わったら、届く指示に従って、途中の作業（裏で動いている作業の確かめや後片付けも）を続けてください。";

/** 圧縮が終わったら、預かっていた指示より先に送る文（自動の圧縮のときは作業の途中に足すので、済んだら元の作業に戻ってもらう） */
export function postCompactMessage(text: string): string {
  return [
    "【圧縮後指示】会話を圧縮しました（それより前の会話は要約になっています）。続ける前に、次のことをしてください。済んだら、途中の作業があればそのまま続けてください。",
    "---",
    text,
  ].join("\n");
}

/** AI の返答が、自動の圧縮の前の指示が済んだ合図か */
export function isPreCompactDone(text: string): boolean {
  return text.includes(PRE_COMPACT_DONE);
}
