// コアの型検査（tsconfig.node.json の paths）だけが、@xterm/xterm の代わりに読む。
// @xterm/addon-serialize の型は @xterm/xterm（ブラウザ版）から名前を読み、その型は DOM の lib を読み込むので、
// そのままだとコアの型の世界に DOM が入り、コアが document などを使っても型の誤りにならない。
// コアが addon を差すのは @xterm/headless の端末なので、同じ名前を headless の型から渡す（実行には関わらない）
export type { IBufferRange, IMarker, ITerminalAddon, Terminal } from "@xterm/headless";
