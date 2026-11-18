// 埋め込みブラウザの開発者ツール（右・下に並べるときの置き場所）。メインプロセスと画面で同じ形

/** 右・下に並べた開発者ツールを置く範囲（画面の CSS の px。ウィンドウの中身の左上から） */
export interface DevtoolsBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
