/**
 * サブエージェントへの追加の指示。Kickoff からサブエージェントへ直接は送れないので、メインのエージェントに
 * SendMessage で同じサブエージェントへそのまま伝えてもらう（サブエージェントは記録から続きを始める）。
 * メインのチャットには自分の発言として残り、サブエージェントのタブでは、その指示だけを自分の発言として出す
 */

const HEAD = "【サブエージェントへの追加の指示】";

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
