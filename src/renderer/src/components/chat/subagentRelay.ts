/**
 * サブエージェントへの追加の指示。Kickoff からサブエージェントへ直接は送れないので、メインのエージェントに
 * SendMessage で同じサブエージェントへそのまま伝えてもらう（サブエージェントは記録から続きを始める）。
 * メインのチャットには自分の発言として残り、サブエージェントのタブでは、その指示だけを自分の発言として出す
 */

const HEAD = "【サブエージェントへの追加の指示】";

/** やり直すときに依頼文をそのまま添える長さの上限（超えたら、前の依頼と同じものを使うよう頼む） */
const MAX_PROMPT_IN_RETRY = 6000;

/** メインのエージェントに送る文（1 行目に宛先、本文は区切りの後ろにそのまま） */
export function relayMessage(agentId: string, name: string, text: string): string {
  return [
    `${HEAD}「${name}」（ID: ${agentId}）`,
    "SendMessage でこのサブエージェントに、下の指示をそのまま伝えてください。あなた自身では作業せず、サブエージェントの報告が届いたら要点を伝えてください。",
    "---",
    text,
  ].join("\n");
}

/** メインのチャットの自分の発言が、このサブエージェントへの追加の指示なら、その本文（違えば undefined） */
export function relayedText(message: string, agentId: string): string | undefined {
  if (!message.startsWith(HEAD) || !message.split("\n")[0].includes(`（ID: ${agentId}）`)) return undefined;
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
    // 出力の上限で止まったものは、同じやり方では同じところで止まる
    ...(outputLimit
      ? ["1 回の返答で書ける量の上限で止まったので、「報告は短くまとめる」「大きなファイルは何回かに分けて書く」と添えて伝えてください。"]
      : []),
  ].join("\n");
}

/**
 * サブエージェントのやり直しを頼む文。同じ依頼で新しく立ち上げ直してもらう（前の回の続きはしない）。
 * 依頼文は長すぎなければそのまま添える（会話を要約したあとでも、同じ依頼を渡せるように）
 */
export function retryRequest(entry: { description: string; subagentType?: string; prompt?: string }): string {
  const type = entry.subagentType ? `（subagent_type: ${entry.subagentType}）` : "";
  const head = [
    `【サブエージェントのやり直し】「${entry.description}」`,
    `このサブエージェントを、同じ依頼で新しく立ち上げ直してください${type}。前の回の続きではなく、最初から進めます（前の回が途中まで変えたものがあれば、確かめてから進めるよう依頼に添えてください）。あなた自身では作業せず、報告が届いたら要点を伝えてください。`,
  ];
  if (!entry.prompt || entry.prompt.length > MAX_PROMPT_IN_RETRY) return [...head, "依頼の文は、前にこのサブエージェントを起動したときと同じものを使ってください。"].join("\n");
  return [...head, "依頼の文は次のとおりです。", "---", entry.prompt].join("\n");
}

/**
 * 親に届かなかった報告を、次の指示を待たずにいま渡す（報告の本文はコアが送るときに添える。reportHandover.ts）
 */
export const HAND_OVER_NOW = "届いていなかったサブエージェントの報告を渡します。読んで、必要なら作業を続けてください。";
