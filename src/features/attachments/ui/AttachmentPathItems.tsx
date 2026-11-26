// 添付の札の右クリックの、ファイルのパスを使う項目（ファイルをコピー・Finder で表示・パスをコピー）。画像のメニューにも、画像以外のファイルのメニューにも並べる
import { useQuery } from "@/foundation/ui/query";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import { canOpenExternal, copyFileToClipboard, openExternal } from "@/foundation/ui/external/native";
import { uploadsApi } from "./api/uploads";

/**
 * 添付のフルパス（画面は保存先を知らないので、メニューを開いたときにコアに聞く）。届くまで・見つからないときは path が null で、tip に押せない理由。
 * 押したときに取りに行かないのは、パスをコピーの書き込みを押した直後にするため（待ってから書くと、押した操作によるコピーと見なされないことがある）
 */
export function useUploadPath(id: string): { path: string | null; tip: string | undefined } {
  const query = useQuery(["upload-path", id], () => uploadsApi.path(id));
  const path = query.data ?? null;
  return { path, tip: path !== null ? undefined : query.error ? "ファイルが見つかりません" : "パスを読み込んでいます" };
}

/** ファイルをコピー（Finder・ほかのアプリ・入力欄にファイルとして貼れる形。Mac のアプリだけ。書くのはメインなので、パスが届いてからでよい） */
export function CopyFileItem({ path, tip }: { path: string | null; tip: string | undefined }) {
  if (!canOpenExternal()) return null;
  return (
    <MenuItem disabled={path === null} title={tip} onSelect={() => path !== null && void copyFileToClipboard(path).catch(reportFailure("ファイルをコピーできませんでした"))}>
      ファイルをコピー
    </MenuItem>
  );
}

/** Finder で表示（Mac のアプリだけ）・パスをコピー（フルパス） */
export function RevealAndPathItems({ path, tip }: { path: string | null; tip: string | undefined }) {
  return (
    <>
      {canOpenExternal() && (
        <MenuItem disabled={path === null} title={tip} onSelect={() => path !== null && void openExternal({ kind: "reveal", path }).catch(reportFailure("Finder で表示できませんでした"))}>
          Finder で表示
        </MenuItem>
      )}
      <MenuItem disabled={path === null} title={tip} onSelect={() => path !== null && void navigator.clipboard.writeText(path).catch(reportFailure("パスをコピーできませんでした"))}>
        パスをコピー
      </MenuItem>
    </>
  );
}

/** 添付の画像のメニューに足す項目（画像のコピー・保存はメニューの側にあるので、Finder で表示・パスをコピーだけ） */
export function ImagePathItems({ id }: { id: string }) {
  return <RevealAndPathItems {...useUploadPath(id)} />;
}
