// AI が描く図の機能のコアの入口（ほかの機能はここだけを読む）
import { VISUAL_FRAME_CSP, VISUAL_FRAME_SHELL } from "@shared/visuals/visualDocument";
import type { CoreFeature } from "@/foundation/core/feature";
import { framePage } from "@/foundation/core/http/framePage";
import type { ChatApi } from "@/features/chat/core/index";
import { visualToolGroup, visualTurnParts } from "./tools";

/**
 * AI が返答に描いた図（SVG・HTML）を入れる枠のページ。図だけの CSP（決めた CDN のほかへは通信しない）を見出しで付ける。
 * 画面は sandbox="allow-scripts" の iframe で開く
 */
const visualFrame = framePage(VISUAL_FRAME_CSP, VISUAL_FRAME_SHELL);

/** 図: AI が返答に図を描くツールとシステムプロンプトの節、図を入れる枠のページ（認証の外） */
export function createVisuals(deps: { chat: Pick<ChatApi, "store" | "addTurnContributor"> }): CoreFeature<null> {
  deps.chat.addTurnContributor(visualTurnParts());
  return { name: "visuals", api: null, aiTools: [visualToolGroup(deps.chat.store)], pages: { "/visual-frame": visualFrame } };
}
