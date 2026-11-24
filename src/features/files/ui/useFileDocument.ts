import { useState } from "react";
import type { FileContent } from "@shared/foundation/fileTypes";
import { workdirInput } from "@/foundation/ui/api/workdir";
import { useDocument } from "@/foundation/ui/document/useDocument";
import { baseName } from "@/foundation/ui/lib/format";
import { errorText } from "@/foundation/ui/query";
import type { WorkplaceRef } from "@/foundation/ui/workplace/workplace";
import { workplaceKey } from "@/foundation/ui/workplace/workplace";
import type { FilesGitStatus } from "./filesGit";
import { filesApi } from "./api";

interface Options {
  target: WorkplaceRef;
  path: string;
  line?: number;
  git: FilesGitStatus;
  onSaved?: () => void;
  /** 置いたタブ（未保存の登録簿の tab） */
  tab?: string;
}

/**
 * 作業場所のファイル 1 つを文書の土台（useDocument）で開く。Git の状態を取り直した回（version）ごとに、ほかで変わっていないか読み直す。
 * バイナリ・途中までのファイルは編集しない（base が null）。見出しの様子の文（保存しました・失敗の理由・● 未保存・行と変更の有無）もここで決める
 */
export function useFileDocument({ target, path, line, git, onSaved, tab }: Options) {
  const root = workplaceKey(target);
  const key = `${root}:${path}`;
  // 保存しました（次に書くまで出す）
  const [savedNote, setSavedNote] = useState(false);
  // 編集の部品を作り直す番号（書きかけを捨てて読み直したとき）
  const [revision, setRevision] = useState(0);
  const doc = useDocument<FileContent>({
    key,
    source: {
      read: (signal) => filesApi("GET /api/projects/:projectId/file", workdirInput(target, { path }), { signal }),
      write: (content, hash) => filesApi("PUT /api/projects/:projectId/file", { ...workdirInput(target), body: { path, content, base_hash: hash } }),
    },
    deps: [git.version],
    refetchOnFocus: false,
    onSaved: () => {
      setSavedNote(true);
      onSaved?.();
    },
    title: baseName(path),
    surface: "files",
    tab,
    file: { root, path },
  });
  const file = doc.file;
  const base = file && !file.binary && !file.truncated ? doc.base : null;
  const saveFailed = base && doc.status === "error" ? errorText(doc.error) : null;
  const change = git.changeOf(path);
  const text = savedNote ? "保存しました" : (saveFailed || (doc.dirty ? "● 未保存" : [line !== undefined && `${line} 行目`, git.repo && (change ? "変更あり" : "変更なし")].filter(Boolean).join("・")));
  return {
    key,
    doc,
    file,
    /** 編集の始まり（開いたとき・保存したときの中身と指紋。編集しないファイル・まだ読み込んでいなければ null） */
    base,
    /** 読むだけの表（大きすぎて途中まで） */
    readOnly: Boolean(file && !file.binary && file.truncated),
    loadError: file === undefined && doc.error ? errorText(doc.error) : null,
    state: { text, error: Boolean(saveFailed) && !savedNote, unsaved: doc.dirty && !savedNote && !saveFailed },
    revision,
    /** 編集の部品の中身が変わった（書いた・ほかで変わって読み直した。書いたときだけ「保存しました」を消す） */
    change: (value: string) => {
      doc.setText(value);
      if (value !== doc.base?.content) setSavedNote(false);
    },
    /** ほかで変わった中身を読み直す（書きかけを捨て、編集の部品を作り直す） */
    reload: () => void doc.reload().then(() => setRevision((n) => n + 1)),
  };
}
