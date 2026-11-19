import type { MouseEvent } from "react";
import { Image as ImageIcon, Link2, Lock } from "lucide-react";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { CopyButton } from "@/foundation/ui/kit/CopyButton";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { Popover, usePopover } from "@/foundation/ui/kit/Popover";
import { allowImageHost, revokeImageHost } from "./imageHosts";
import { urlsTip, type ImageHostGroup } from "./imageGroups";

/** 画像の中（リンクの中にもある）のボタンを押したとき、リンクを開かせない */
const keepInside = (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

/** 失敗の文（段落の中に置くので <p> の ErrorText ではなく span） */
function InlineError({ message }: { message: string | undefined }) {
  return message ? <span className="error small chat-image-gate-error">{message}</span> : null;
}

/**
 * まだ表示を許可していないホストの画像の代わりに出すボタン「host から画像を n 件表示（最初：名前）」（押すまで外へ通信しない）。
 * 押すとそのホストをこのチャットで許可し、そのホストの画像を元の位置にすべて出す。乗せると URL を並べ、横の「URL を見る」で全部の一覧を開く
 */
export function ImageHostButton({ chatId, group, firstName }: { chatId: number; group: ImageHostGroup; firstName: string }) {
  const { run, busy, error } = useAction();
  const count = group.urls.length;
  return (
    <span className="chat-image-gate">
      <button
        type="button"
        className="chat-image-show"
        disabled={busy !== null}
        data-tip={urlsTip(group.urls)}
        data-tip-title={`${group.host} の画像`}
        onClick={(e) => {
          keepInside(e);
          void run("allow", () => allowImageHost(chatId, group.host));
        }}
      >
        <ImageIcon size={14} aria-hidden />
        <span className="chat-image-show-host">{group.host}</span>
        <span>から画像を {count} 件表示</span>
        <span className="chat-image-show-first">（{count > 1 ? "最初：" : ""}{firstName}）</span>
        {group.insecure && (
          <span className="chat-image-insecure">
            <Lock size={11} aria-hidden />
            暗号化なし
          </span>
        )}
      </button>
      <ImageUrlsButton chatId={chatId} group={group} allowed={false} />
      <InlineError message={error} />
    </span>
  );
}

/** 「URL を見る」: そのホストの画像の URL をすべて並べる（コピーできる。許可しているホストなら、ここで許可を外せる） */
export function ImageUrlsButton({ chatId, group, allowed }: { chatId: number; group: ImageHostGroup; allowed: boolean }) {
  // 中の ref は分けて受ける（オブジェクトのまま pop.anchor を ref に渡すと React Compiler が外す）
  const { anchor, ...pop } = usePopover();
  const { run, busy, error } = useAction();
  return (
    <>
      <button
        type="button"
        ref={anchor}
        className="chat-image-urls"
        aria-expanded={pop.open}
        onClick={(e) => {
          keepInside(e);
          pop.toggle();
        }}
      >
        <Link2 size={12} aria-hidden />
        URL を見る
      </button>
      {pop.open && (
        // 段落の中には一覧（ul）を置けないので body に出す。中の操作は、画像を包むリンクに届かせない（React の上ではリンクの中）
        <Popover
          anchor={anchor}
          portal
          label={`${group.host} の画像の URL`}
          title={`${group.host} の画像の URL（${group.urls.length} 件）`}
          onClose={pop.close}
          onClick={(e) => e.stopPropagation()}
          className="chat-image-url-list"
        >
          <ul>
            {group.urls.map((url) => (
              <li key={url}>
                <span className="chat-image-url">
                  {url.startsWith("http:") && (
                    <span className="chat-image-insecure" data-tip="https でない（暗号化していない）画像です">
                      <Lock size={11} aria-hidden />
                    </span>
                  )}
                  {url}
                </span>
                <CopyButton text={url} label="URL をコピー" />
              </li>
            ))}
          </ul>
          <div className="chat-image-url-actions">
            {group.urls.length > 1 && <CopyButton text={group.urls.join("\n")} label="すべての URL をコピー" className="chat-image-copy-all" />}
            {allowed && (
              <button
                type="button"
                className="chat-image-revoke"
                disabled={busy !== null}
                onClick={() =>
                  void run("revoke", async () => {
                    await revokeImageHost(chatId, group.host);
                    pop.close();
                  })
                }
              >
                このサイトの許可を外す
              </button>
            )}
          </div>
          <ErrorText message={error} />
        </Popover>
      )}
    </>
  );
}
