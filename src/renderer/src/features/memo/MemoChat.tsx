import { MessageSquare, Minimize2, PanelBottom, PanelRight } from "lucide-react";
import { useRef, useState, type MutableRefObject } from "react";
import type { Attachment, ChatOptions } from "@shared/types";
import { api } from "@/api";
import { useMemoChatOf } from "@/stores/chats";
import { CloseButton, IconButton } from "@/ui/IconButton";
import { Segmented } from "@/ui/Segmented";
import { Composer } from "@/features/chat/composer/Composer";
import type { ComposerHandle } from "@/features/chat/composer/composerHandle";
import { useChatOptions } from "@/features/chat/options/ChatOptionsBar";
import { ContextMeter } from "@/features/chat/composer/ContextMeter";
import { useWideText } from "@/features/chat/pane/TextWidthToggle";
import { cx } from "@/lib/cx";
import { ChatView } from "@/features/chat/pane/ChatPane";
import { useChatDetail } from "@/features/chat/pane/useChatDetail";
import { chatPaneOf } from "@/features/chat/pane/windowMessages";
import { PanelHostContext } from "@/features/panel/panelHost";
import { ChipsPortalContext, type ChipsPortal } from "@/features/chat/pane/chipsPortal";
import { SnippetBar, SnippetBarToggleItem } from "@/features/snippet/SnippetBar";

/** 外からメモのチャットの欄を動かす口（本文の右クリックの「メモのチャット」の組） */
export interface MemoChatHandle {
  /** 入力欄の文の後ろに足す（attachments は添付。まだチャットがなければ、最初の指示の入力欄に） */
  add: (text: string, attachments?: Attachment[]) => void;
}

/** 欄の置き場所（本文の右 / 下。lib/storageKeys.ts の MEMO_CHAT_PLACE） */
export type MemoChatPlace = "right" | "bottom";

/**
 * メモのチャットの欄（本文の右か下を見出しで選ぶ。幅で勝手に入れ替えない）: メモごとに 1 つの、ふつうのチャット（Claude Code。モデルの選択・音声入力・返事を書きながら見せる・
 * 送信待ち・添付などはメインのチャットと同じ）。AI はメモのファイルを直接読み書きし、書き換えると開いているメモが読み直す（コアがメモの変更を知らせる）。
 * まだチャットがなければ、最初の指示の入力欄だけを出し、送るとチャットを作る。送る前に、書きかけのメモを保存する（beforeSend）
 */
export function MemoChat({
  projectId,
  path,
  visible,
  beforeSend,
  handleRef,
  place,
  onPlaceChange,
  onClose,
  onQuickOnly,
  chipsPortal,
}: {
  projectId: number;
  path: string;
  visible: boolean;
  /** 送る前にすること（書きかけのメモを保存する。保存できなければ SendCancelled を投げて送らない） */
  beforeSend: () => Promise<void>;
  handleRef: MutableRefObject<MemoChatHandle | null>;
  place: MemoChatPlace;
  onPlaceChange: (place: MemoChatPlace) => void;
  onClose: () => void;
  /** 欄を閉じて、メモの下の入力欄だけを出す（隠していても入力欄を出す） */
  onQuickOnly: () => void;
  /** 欄を閉じている間に、上のピルの列を描く先（メモの下の入力欄の上。開いている間は null） */
  chipsPortal: ChipsPortal | null;
}) {
  const stored = useMemoChatOf(projectId, path);
  // 作ったばかりのチャット（一覧の知らせが届くまでの間も、そのチャットを出す）
  const [created, setCreated] = useState<{ path: string; id: number } | null>(null);
  const chatId = stored?.id ?? (created?.path === path ? created.id : undefined);
  const composer = useRef<ComposerHandle | null>(null);
  handleRef.current = {
    add: (text, attachments) => {
      if (chatId === undefined) composer.current?.fill(text, { append: true, attachments });
      else chatPaneOf(chatId)?.fillComposer(text, { append: true, attachments });
    },
  };
  return (
    <aside className="memo-chat" aria-label="メモのチャット">
      <header className="memo-chat-head">
        <MessageSquare size={14} aria-hidden />
        <span className="memo-chat-title">メモのチャット</span>
        <span className="spacer" />
        <Segmented<MemoChatPlace>
          className="view-toggle"
          label="メモのチャットの置き場所"
          value={place}
          onChange={onPlaceChange}
          options={[
            { value: "bottom", label: "下に表示（本文の下に置く）", icon: PanelBottom, iconOnly: true },
            { value: "right", label: "右に表示（本文の右に置く）", icon: PanelRight, iconOnly: true },
          ]}
        />
        {/* 会話を畳んで、メモの下の入力欄だけにする（× は選んでいる閉じ方 = 入力欄だけ / 隠す に戻る） */}
        <IconButton icon={Minimize2} size={14} label="入力欄だけにする" title="会話の欄を閉じて、メモの下に入力欄だけを出す（続けて頼める）" onClick={onQuickOnly} />
        <CloseButton size={15} label="チャットの欄を閉じる" onClick={onClose} />
      </header>
      <div className="memo-chat-body">
        {chatId === undefined ? (
          <MemoChatStart
            key={path}
            projectId={projectId}
            composerRef={composer}
            onStart={async (text, attachments, options) => {
              await beforeSend();
              const chat = await api.startMemoChat(projectId, { path, text, options, attachments });
              setCreated({ path, id: chat.id });
            }}
          />
        ) : (
          <ChipsPortalContext.Provider value={chipsPortal}>
            <MemoChatView key={chatId} chatId={chatId} visible={visible} beforeSend={beforeSend} />
          </ChipsPortalContext.Provider>
        )}
      </div>
    </aside>
  );
}

/** メモのチャットの会話（ふつうのチャットの画面。右の欄は重ねない） */
function MemoChatView({ chatId, visible, beforeSend }: { chatId: number; visible: boolean; beforeSend: () => Promise<void> }) {
  const { chat, project, events, approvals, live, streaming, error } = useChatDetail(chatId);
  if (error) return <div className="page error">{error}</div>;
  if (!chat) return <div className="page muted">読み込み中…</div>;
  return (
    <PanelHostContext.Provider value={null}>
      <ChatView chat={chat} project={project} events={events} approvals={approvals} live={live} streaming={streaming} visible={visible} beforeSend={beforeSend} />
    </PanelHostContext.Provider>
  );
}

/** まだチャットがないときの、最初の指示の入力欄（メインの新しいチャットと同じ入力欄。送るとメモのチャットを作る） */
function MemoChatStart({
  projectId,
  composerRef,
  onStart,
}: {
  projectId: number;
  composerRef: MutableRefObject<ComposerHandle | null>;
  onStart: (text: string, attachments: Attachment[], options: ChatOptions) => Promise<void>;
}) {
  const options = useChatOptions(undefined, projectId);
  // 会話の横幅はチャットの画面と同じ（標準なら上限で真ん中、広げるなら幅いっぱい。メモの下の入力欄とも同じ）
  const [wide] = useWideText();
  return (
    <div className={cx("chat-page chat-panel memo-chat-start", wide && "wide")}>
      <div className="timeline">
        <div className="memo-chat-hero">
          <MessageSquare size={22} aria-hidden />
          <p>このメモについて AI と話しながら、中身を一緒に作ります。AI はメモを読み、頼むと直接書き換えます（書き換えると本文もすぐ変わります）。</p>
          <p className="muted small">本文で文を選んで右クリックの「メモのチャット」の「選択部分を追加」で、その部分を引用して入力欄に足せます。</p>
        </div>
      </div>
      <div className="chat-composer">
        <Composer
          chatContext={{ projectId }}
          options={options}
          handleRef={composerRef}
          suggestTarget={projectId}
          placeholder="メモについて話す（例: 機能案を一緒に考えて / 優先度順に並べて反映して）。Enter で送る、Shift+Enter で改行"
          onSend={(text, attachments) => onStart(text, attachments, options.options)}
          // 会話が始まったあとのチャット欄と同じく、定型文の帯（右クリックで出す・隠す）とコンテキストのメーター（まだ 0%）
          header={<SnippetBar projectId={projectId} composer={composerRef} onSend={(text) => onStart(text, [], options.options)} />}
          menuItems={<SnippetBarToggleItem />}
          trailing={<ContextMeter chat={null} projectId={projectId} compacting={null} reserved={null} afterTurn={false} />}
        />
      </div>
    </div>
  );
}
