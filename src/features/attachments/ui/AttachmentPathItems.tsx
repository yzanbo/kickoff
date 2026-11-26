// 添付の札の右クリックの、ファイルのパスを使う項目（ファイルをコピー・Finder で表示・パスをコピー）。画像のメニューにも、画像以外のファイルのメニューにも並べる
import type { ReactNode } from "react";
import { useQuery } from "@/foundation/ui/query";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import { canOpenExternal, copyFileToClipboard, openExternal } from "@/foundation/ui/external/native";
import { uploadsApi } from "./api/uploads";

/** 添付のフルパス（path: 届くまで・見つからないときは null。tip: 押せない理由） */
interface UploadPath {
  path: string | null;
  tip: string | undefined;
}

/**
 * 添付のフルパス（画面は保存先を知らないので、メニューを開いたときにコアに聞く）。
 * 押したときに取りに行かないのは、パスをコピーの書き込みを押した直後にするため（待ってから書くと、押した操作によるコピーと見なされないことがある）
 */
export function useUploadPath(id: string): UploadPath {
  const query = useQuery(["upload-path", id], () => uploadsApi.path(id));
  const path = query.data ?? null;
  return { path, tip: path !== null ? undefined : query.error ? "ファイルが見つかりません" : "パスを読み込んでいます" };
}

/** パスを使う項目 1 つ（パスが届くまで・見つからないときは押せない。失敗は failure の文で知らせる） */
function PathItem({ path, tip, run, failure, children }: UploadPath & { run: (path: string) => Promise<unknown>; failure: string; children: ReactNode }) {
  return (
    <MenuItem disabled={path === null} title={tip} onSelect={() => path !== null && void run(path).catch(reportFailure(failure))}>
      {children}
    </MenuItem>
  );
}

/** ファイルをコピー（Finder・ほかのアプリ・入力欄にファイルとして貼れる形。Mac のアプリだけ。書くのはメインなので、パスが届いてからでよい） */
export function CopyFileItem(path: UploadPath) {
  if (!canOpenExternal()) return null;
  return (
    <PathItem {...path} run={copyFileToClipboard} failure="ファイルをコピーできませんでした">
      ファイルをコピー
    </PathItem>
  );
}

/** Finder で表示（Mac のアプリだけ）・パスをコピー（フルパス） */
export function RevealAndPathItems(path: UploadPath) {
  return (
    <>
      {canOpenExternal() && (
        <PathItem {...path} run={(p) => openExternal({ kind: "reveal", path: p })} failure="Finder で表示できませんでした">
          Finder で表示
        </PathItem>
      )}
      <PathItem {...path} run={(p) => navigator.clipboard.writeText(p)} failure="パスをコピーできませんでした">
        パスをコピー
      </PathItem>
    </>
  );
}

/** 添付の画像のメニューに足す項目（画像のコピー・保存はメニューの側にあるので、Finder で表示・パスをコピーだけ） */
export function ImagePathItems({ id }: { id: string }) {
  return <RevealAndPathItems {...useUploadPath(id)} />;
}
