// テストで流すログインシェル（DB の準備のコマンドなど）を、利用者のシェルの設定ファイル（~/.zshrc・~/.zlogin など）に左右されないようにする。テストからだけ使う。
// テストのファイルの頭で quietShell() を呼ぶと、そのファイルのテストの間、zsh の設定ファイルの置き場（ZDOTDIR）を空の一時フォルダにする
// （設定ファイルが裏で動かすものの警告が出力に混ざらないように。AI の Bash の砂場の中では、zsh が裏の作業の優先度を下げる nice が断られて
// 「nice(5) failed」が出ていた）。変えるのは vi.stubEnv なので、テストが終われば戻る（同じプロセスで続けて流すほかのファイルに残さない）。
// 読み込んだときに登録する形にしない（プロセスを使い回すと、モジュールは最初に読んだファイルでしか評価されず、あとのファイルに効かなかった）
import { beforeEach, vi } from "vitest";
import { tempDir } from "./tempDir";

/** このファイルのテストの間、ログインシェルが利用者の設定ファイルを読まないようにする（ファイルの頭で 1 回呼ぶ） */
export function quietShell(): void {
  const zdotdir = tempDir();
  beforeEach(() => {
    vi.stubEnv("SHELL", "/bin/zsh");
    vi.stubEnv("ZDOTDIR", zdotdir);
  });
}
