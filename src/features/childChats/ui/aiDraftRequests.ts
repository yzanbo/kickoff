// AI の頼み（kickoff_chat の add_draft。コアの SSE chat_draft）を受けて、家系のチャットの入力欄に下書きを入れる。
// 「子チャットから渡した」の印（composerHandoff）は子チャットの持ち物なので、受け手もここ
import type { ChatDraftRequest } from "@shared/chat/openView";
import { useServerEvent } from "@/foundation/ui/api/events";
import { writeSetting } from "@/foundation/ui/storage";
import { composerHandoff } from "@/foundation/ui/storage/storageKeys";
import { showToast } from "@/foundation/ui/kit/toast";
import { canOpenExternal } from "@/foundation/ui/external/native";
import { addChats, chatTargetName, knownChat, openChat } from "@/features/chat/ui";
import { appendToDraft } from "@/features/composer/ui";

/**
 * 入れる先のチャットの下書きの後ろに空行を挟んで足し（入力欄にピントは移さない）、親チャットに入れるなら「子チャットから渡した」の札も付ける
 * （「親チャットに渡す」と同じ）。画面は移さず「〇〇に下書きを入れました［開く］」と知らせる
 */
function putDraft(request: ChatDraftRequest) {
  // 系譜のうち、まだ読み込んでいないチャットを一覧に入れる
  const unknown = request.lineage.filter((c) => !knownChat(c.id));
  if (unknown.length > 0) addChats(unknown);
  const target = request.lineage.at(-1);
  if (!target) return;
  if (request.from) writeSetting(composerHandoff(target.id), request.from);
  appendToDraft(target.id, request.text, [], { focus: false, notify: false });
  const chat = knownChat(target.id) ?? target;
  showToast(`${chatTargetName(chat)}に下書きを入れました`, { label: "開く", run: () => openChat(chat) });
}

/** AI の下書きの頼みを受ける（Mac のアプリのメインのウィンドウだけ。開いているウィンドウの数だけ入れないように） */
export function useAiDraftRequests() {
  useServerEvent("chat_draft", (e) => {
    // Mac のアプリか（外で開ける = window.kickoff がある）
    if (canOpenExternal()) putDraft(e.request);
  });
}
