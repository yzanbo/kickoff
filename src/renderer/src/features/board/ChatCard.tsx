import { busyWithUnread } from "@shared/chat/state";
import type { AgentState, Chat } from "@shared/types";
import { chatTitle } from "@/features/chat/chatTitle";
import type { ChatTitleEditor } from "@/features/chat/useChatRename";
import { modelDisplayName } from "@/features/chat/options/models";
import { formatFullDateTime, relativeTime } from "@/lib/time";
import { useModels } from "@/stores/providers";
import { ChatTitleInput } from "@/features/chat/ChatTitleInput";
import { GroupChip } from "@/features/group/GroupChip";
import { ProjectChip } from "@/features/project/ProjectChip";
import { WorktreeChip } from "@/features/worktree/WorktreeChip";
import { GitHubLinkChip } from "@/features/github/GitHubLinkChip";
import { StatusSlot } from "@/features/chat/StatusSlot";
import { cardStatText } from "./cardFields";
import type { ShowCardField } from "./CardFieldsMenu";

interface Props {
  chat: Chat;
  state: AgentState;
  /** 全プロジェクトのボードでは、プロジェクトのバッジを出す */
  projectName?: string;
  /** 回答待ちの数 */
  pending?: number;
  /** 名前をその場で変えている途中のとき */
  rename?: ChatTitleEditor;
  /** 出す項目（ツールバーの「表示項目」） */
  show: ShowCardField;
}

/** カード・リストの行・フィードのカードの札（プロジェクト・グループ・作業場所は表示項目で出すものだけ。結び付いた GitHub の issue・PR とアーカイブ済みの札はいつも） */
export function CardBadges({ chat, projectName, show }: Pick<Props, "chat" | "projectName" | "show">) {
  return (
    <>
      {projectName !== undefined && show("project") && <ProjectChip id={chat.project_id} name={projectName} />}
      {show("group") && <GroupChip chat={chat} />}
      {show("worktree") && <WorktreeChip chat={chat} />}
      <GitHubLinkChip chat={chat} />
      {chat.archived_at && <span className="archived-chip">アーカイブ済み</span>}
    </>
  );
}

/** モデルの名前（"Opus 5.5"。モデルが分からないチャットでは出さない） */
function ModelStat({ model }: { model: string | null }) {
  const models = useModels("claude");
  if (!model) return null;
  return <span className="card-stat">{modelDisplayName(models, model)}</span>;
}

/** 詳細の数（モデル・回答待ち・ターン数・API 換算・コンテキスト。表示項目で出すもので、値のあるものだけ） */
export function CardStats({ chat, pending = 0, show }: Pick<Props, "chat" | "pending" | "show">) {
  return (
    <>
      {show("pending") && pending > 0 && <span className="card-pending">回答 {pending}件</span>}
      {show("model") && <ModelStat model={chat.model} />}
      {(["turns", "cost", "context"] as const).map((field) => {
        const text = show(field) ? cardStatText(chat, field) : undefined;
        return text && (
          <span key={field} className="card-stat" title={field === "cost" ? "API 換算（サブスクリプション利用時も API 料金に換算した参考値）" : field === "context" ? "コンテキストの使用率" : undefined}>
            {text}
          </span>
        );
      })}
    </>
  );
}

/** 日時（作成日・最終更新。active は最終更新に出す日時で、フィードは返答の時刻） */
export function CardTimes({ chat, show, active = chat.active_at }: Pick<Props, "chat" | "show"> & { active?: string }) {
  return (
    <>
      {show("created") && (
        <span className="card-stat" title={`作成 ${formatFullDateTime(chat.created_at)}`}>
          作成 {relativeTime(chat.created_at)}
        </span>
      )}
      {show("active") && (
        <span className="card-time" title={formatFullDateTime(active)}>
          {relativeTime(active)}
        </span>
      )}
    </>
  );
}

/**
 * ボードのカードの中身（状態の印と名前・札・詳細・日時。出すものはツールバーの「表示項目」で選ぶ）。状態は名前の左に、サイドバーの行と同じ印（StatusSlot。作業中は回るリング・
 * 回答待ちは！・未読は緑の点、作業中のまま未読なら緑の点を重ねる）で出す（利用者の依頼。前は下の行に点と「既読」などの文）。何も出さない行は描かない
 */
export function ChatCardContent({ chat, state, projectName, pending = 0, rename, show }: Props) {
  const badges = (projectName !== undefined && show("project")) || (show("group") && chat.group_id !== null) || show("worktree") || Boolean(chat.archived_at);
  // 下の行（詳細・日時）に出すものがあるか（なければ行ごと描かず、カードの下に余白を残さない）
  const foot =
    show("active") ||
    show("created") ||
    (show("pending") && pending > 0) ||
    (show("model") && chat.model !== null) ||
    (["turns", "cost", "context"] as const).some((f) => show(f) && cardStatText(chat, f) !== undefined);
  return (
    <>
      <div className="card-title-row">
        {show("state") && <StatusSlot state={state} unread={busyWithUnread(chat, state)} />}
        {rename ? <ChatTitleInput chat={chat} editor={rename} /> : <span className="card-title">{chatTitle(chat.title)}</span>}
      </div>
      {badges && (
        <div className="card-labels">
          <CardBadges chat={chat} projectName={projectName} show={show} />
        </div>
      )}
      {foot && (
        <div className="card-foot">
          <CardStats chat={chat} pending={pending} show={show} />
          <CardTimes chat={chat} show={show} />
        </div>
      )}
    </>
  );
}

/** リスト表示の行の中身（状態の印は名前の左にカードと同じ StatusSlot で。名前の後ろに札・詳細、右に日時。出すものはツールバーの「表示項目」で選ぶ） */
export function ChatRowContent({ chat, state, projectName, pending = 0, rename, show }: Props) {
  return (
    <>
      <div className="list-main">
        {show("state") && <StatusSlot state={state} unread={busyWithUnread(chat, state)} />}
        {rename ? <ChatTitleInput chat={chat} editor={rename} /> : <span className="card-title one-line">{chatTitle(chat.title)}</span>}
        <span className="list-meta">
          <CardBadges chat={chat} projectName={projectName} show={show} />
          <CardStats chat={chat} pending={pending} show={show} />
        </span>
      </div>
      <span className="list-times">
        <CardTimes chat={chat} show={show} />
      </span>
    </>
  );
}
