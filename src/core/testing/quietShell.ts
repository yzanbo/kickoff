// テストで流すログインシェル（DB の準備のコマンドなど）を、利用者のシェルの設定ファイル（~/.zshrc・~/.zlogin など）に左右されないようにする。テストからだけ使う。
// 読み込むと、このファイルのテストの間、zsh の設定ファイルの置き場（ZDOTDIR）を空の一時フォルダにする（設定ファイルが裏で動かすものの警告が出力に混ざらないように。
// AI の Bash の砂場の中では、zsh が裏の作業の優先度を下げる nice が断られて「nice(5) failed」が出ていた）。
// 変えるのは vi.stubEnv なので、テストが終われば戻る（同じプロセスで続けて流すほかのファイルに残さない）
import { beforeEach, vi } from "vitest";
import { tempDir } from "./tempDir.js";

const zdotdir = tempDir();
beforeEach(() => {
  vi.stubEnv("SHELL", "/bin/zsh");
  vi.stubEnv("ZDOTDIR", zdotdir);
});
