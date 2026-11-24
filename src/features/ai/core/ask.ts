// プロバイダーにツールなしで 1 回だけ聞く頼みのうち、決まった形のもの（チャットの名前・ノートの要約）。どの AI も ask で聞く
import { cleanTitle, summarizePrompt, titlePrompt } from "@/features/ai/core/providers/askPrompts";
import type { AgentProvider } from "@/features/ai/core/providers/types";

type AskingProvider = AgentProvider & Required<Pick<AgentProvider, "ask">>;

/** ask を持つか（持たないのは対応予定の AI だけ。名前・要約に対応しているかもこれで決める） */
export const canAsk = (provider: AgentProvider | undefined): provider is AskingProvider => typeof provider?.ask === "function";

/** 最初の依頼から短いチャットの名前を作る */
export async function askTitle(provider: AskingProvider, text: string): Promise<string> {
  return cleanTitle(await provider.ask(titlePrompt(text)));
}

/** あとで読み返すノートにするため、文を短くまとめる */
export async function askSummary(provider: AskingProvider, text: string): Promise<string> {
  return (await provider.ask(summarizePrompt(text))).trim();
}
