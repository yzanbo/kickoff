import "./NoteChat.css";
import { MessageSquare, Minimize2, PanelBottom, PanelRight } from "lucide-react";
import { useImperativeHandle, useState, type MutableRefObject } from "react";
import type { Attachment, ChatOptions } from "@shared/chat/types";
import { notesApi } from "@/features/notes/ui/api";
import { CloseButton, IconButton } from "@/foundation/ui/kit/IconButton";
import { Segmented } from "@/foundation/ui/kit/Segmented";
import { appendDraft, appendToDraft, Composer, focusDraft, memoryDraft, type ComposerDraft } from "@/features/composer/ui";
import { useChatOptions } from "@/features/ai/ui";
import { cx } from "@/foundation/ui/lib/cx";
import { ChatScreen, useWideText } from "@/features/conversation/ui";
import { screenOfChat, useNoteChatOf, type ChipsPortal } from "@/features/chat/ui";

/** 外からノートのチャットの欄を動かす口（本文の右クリックの「ノートのチャット」の組） */
export interface NoteChatHandle {
  /** 入力欄の文の後ろに足す（attachments は添付。まだチャットがなければ、最初の指示の入力欄に） */
  add: (text: string, attachments?: Attachment[]) => void;
}

/** 欄の置き場所（本文の右 / 下。storage.ts の chatPlace） */
export type NoteChatPlace = "right" | "bottom";

/**
 * ノートのチャットの欄（本文の右か下を見出しで選ぶ。幅で勝手に入れ替えない）: ノートごとに 1 つの、ふつうのチャット（Claude Code。モデルの選択・音声入力・返事を書きながら見せる・
 * 送信待ち・添付などはメインのチャットと同じ）。AI はノートのファイルを直接読み書きし、書き換えると開いているノートが読み直す（コアがノートの変更を知らせる）。
 * まだチャットがなければ、最初の指示の入力欄だけを出し、送るとチャットを作る。送る前に、書きかけのノートを保存する（beforeSend）
 */
export function NoteChat({
  projectId,
  path,
  visible,
  beforeSend,
  handleRef,
  place,
  onPlaceChange,
  onHide,
  onQuickOnly,
  chipsPortal,
}: {
  projectId: number;
  path: string;
  visible: boolean;
  /** 送る前にすること（書きかけのノートを保存する。保存できなければ SendCancelled を投げて送らない） */
  beforeSend: () => Promise<void>;
  handleRef: MutableRefObject<NoteChatHandle | null>;
  place: NoteChatPlace;
  onPlaceChange: (place: NoteChatPlace) => void;
  /** 非表示にする（欄を閉じ、ノートの下の入力欄も出さない） */
  onHide: () => void;
  /** 欄を閉じて、ノートの下の入力欄だけを出す（チャット表示のみ） */
  onQuickOnly: () => void;
  /** 欄を閉じている間に、上のピルの列を描く先（ノートの下の入力欄の上。開いている間は null） */
  chipsPortal: ChipsPortal | null;
}) {
  const stored = useNoteChatOf(projectId, path);
  // 作ったばかりのチャット（一覧の知らせが届くまでの間も、そのチャットを出す）
  const [created, setCreated] = useState<{ path: string; id: number } | null>(null);
  const chatId = stored?.id ?? (created?.path === path ? created.id : undefined);
  // まだチャットがないときの最初の指示の書きかけ（残さない。ノートを替えたら空から）
  const [startDraft, setStartDraft] = useState(() => memoryDraft());
  const [startPath, setStartPath] = useState(path);
  if (startPath !== path) {
    setStartPath(path);
    setStartDraft(memoryDraft());
  }
  // 外から読む口（描く中で ref に書かない）
  useImperativeHandle(handleRef, () => ({
    add: (text, attachments) => {
      if (chatId === undefined) {
        appendDraft(startDraft, text, attachments);
        focusDraft(startDraft, { end: true });
      } else if (screenOfChat(chatId)) appendToDraft(chatId, text, attachments);
    },
  }));
  return (
    <aside className="note-chat slide-pane-inner" aria-label="ノートのチャット">
      <header className="note-chat-head bar">
        <MessageSquare size={14} aria-hidden />
        <span className="note-chat-title">ノートのチャット</span>
        <span className="spacer" />
        <Segmented<NoteChatPlace>
          look="toggle"
          label="ノートのチャットの置き場所"
          value={place}
          onChange={onPlaceChange}
          options={[
            { value: "bottom", label: "下に表示（本文の下に置く）", icon: PanelBottom, iconOnly: true },
            { value: "right", label: "右に表示（本文の右に置く）", icon: PanelRight, iconOnly: true },
          ]}
        />
        {/* チャット表示のみ（会話を畳んで、ノートの下の入力欄だけにする）・非表示にする（欄も入力欄も出さない） */}
        <IconButton icon={Minimize2} iconSize={14} label="チャット表示のみ" title="会話の欄を閉じて、ノートの下にチャットの入力欄だけを出す（続けて頼める）" onClick={onQuickOnly} />
        <CloseButton iconSize={15} label="非表示にする" title="ノートのチャットを非表示にし、ノートだけを広く見る（見出しの吹き出しのボタンで開く・▾ で戻せる）" onClick={onHide} />
      </header>
      <div className="note-chat-body">
        {chatId === undefined ? (
          <NoteChatStart
            key={path}
            projectId={projectId}
            draft={startDraft}
            onStart={async (text, attachments, options) => {
              await beforeSend();
              const chat = await notesApi("POST /api/projects/:projectId/note/chat", { params: { projectId }, body: { path, text, options, attachments } });
              setCreated({ path, id: chat.id });
            }}
          />
        ) : (
          <NoteChatView key={chatId} chatId={chatId} visible={visible} beforeSend={beforeSend} chipsPortal={chipsPortal} />
        )}
      </div>
    </aside>
  );
}

/** ノートのチャットの会話（ふつうのチャットの画面。右の欄は重ねない。ピルの列と送信待ちは、欄を閉じている間ノートの下の入力欄の上に出す） */
function NoteChatView({ chatId, visible, beforeSend, chipsPortal }: { chatId: number; visible: boolean; beforeSend: () => Promise<void>; chipsPortal: ChipsPortal | null }) {
  return (
    <ChatScreen chatId={chatId} visible={visible} host={{ surface: "note", pausable: false, side: null, beforeSend, chipsPortal, mainChatId: null }} />
  );
}

/** まだチャットがないときの、最初の指示の入力欄（メインの新しいチャットと同じ入力欄。送るとノートのチャットを作る） */
function NoteChatStart({
  projectId,
  draft,
  onStart,
}: {
  projectId: number;
  draft: ComposerDraft;
  onStart: (text: string, attachments: Attachment[], options: ChatOptions) => Promise<void>;
}) {
  const options = useChatOptions({ projectId });
  // 会話の横幅はチャットの画面と同じ（標準なら上限で真ん中、広げるなら幅いっぱい。ノートの下の入力欄とも同じ）
  const [wide] = useWideText();
  return (
    <div className={cx("chat-page chat-panel note-chat-start", wide && "wide")}>
      <div className="timeline">
        <div className="note-chat-hero">
          <MessageSquare size={22} aria-hidden />
          <p>このノートについて AI と話しながら、中身を一緒に作ります。AI はノートを読み、頼むと直接書き換えます（書き換えると本文もすぐ変わります）。</p>
          <p className="muted small">本文で文を選んで右クリックの「ノートのチャット」の「選択部分を追加」で、その部分を引用して入力欄に足せます。</p>
        </div>
      </div>
      <div className="chat-composer">
        <Composer
          // 会話が始まったあとのチャット欄と同じく、定型文の帯（右クリックで出す・隠す）とコンテキストのメーター（まだ 0%）
          place={{ projectId, worktree: null, chatId: null }}
          options={options}
          draft={draft}
          placeholder="ノートについて話す（例: 機能案を一緒に考えて / 優先度順に並べて反映して）。Enter で送る、Shift+Enter で改行"
          send={{ submit: ({ text, attachments }) => onStart(text, attachments, options.options), sendOther: (text) => onStart(text, [], options.options) }}
        />
      </div>
    </div>
  );
}
