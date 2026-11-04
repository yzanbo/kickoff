// AI へ送る定型文（送るとチャットに自分の発言として残る）。コアの再開の段取りと、画面の操作（再試行・サブエージェントへの指示）で共有する。Node 依存なし

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

/** 使用枠が戻って、続けると答えたときに送る指示 */
export const USAGE_RESUME_PROMPT = "（使用枠が戻ったので再開します）使用枠の上限で止まったところから、作業を続けてください。";

// ---- 失敗した作業の再試行（画面の FailedTurnActions） ----

/** 続きから再試行するときに送る指示 */
export const RETRY_PROMPT = "（再試行）さきほどの作業は途中で失敗しました。止まったところから、作業を続けてください。";

// ---- サブエージェント（画面のサブエージェントの一覧・タブ） ----
// Kickoff からサブエージェントへ直接は送れないので、メインのエージェントに SendMessage で同じサブエージェントへそのまま伝えてもらう
// （サブエージェントは記録から続きを始める）。メインのチャットには自分の発言として残り、サブエージェントのタブでは、その指示だけを自分の発言として出す

const RELAY_HEAD = "【サブエージェントへの追加の指示】";

/** やり直すときに依頼文をそのまま添える長さの上限（超えたら、前の依頼と同じものを使うよう頼む） */
const MAX_PROMPT_IN_RETRY = 6000;

/** サブエージェントへの追加の指示として、メインのエージェントに送る文（1 行目に宛先、本文は区切りの後ろにそのまま） */
export function relayMessage(agentId: string, name: string, text: string): string {
  return [
    `${RELAY_HEAD}「${name}」（ID: ${agentId}）`,
    "SendMessage でこのサブエージェントに、下の指示をそのまま伝えてください。あなた自身では作業せず、サブエージェントの報告が届いたら要点を伝えてください。",
    "---",
    text,
  ].join("\n");
}

/** メインのチャットの自分の発言が、このサブエージェントへの追加の指示なら、その本文（違えば undefined） */
export function relayedText(message: string, agentId: string): string | undefined {
  if (!message.startsWith(RELAY_HEAD) || !message.split("\n")[0].includes(`（ID: ${agentId}）`)) return undefined;
  const at = message.indexOf("\n---\n");
  return at < 0 ? undefined : message.slice(at + 5);
}

/**
 * 止まったサブエージェントの再開を頼む文。メインのエージェントに、SendMessage で止まったところから続けさせる
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
