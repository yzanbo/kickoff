# GitHub Copilot（`core/providers/copilot`）

`@github/copilot-sdk` のランタイムで動かす。寄りかかっている所は `sdk.ts`（SDK を読む唯一の所。ほかのファイルは SDK の型もここから読む）。

- SDK の本体は使うときにだけ `import()` する（`sdk.ts`。コアの起動を遅くしない）。
- 承認はすべて聞く形にして共通の決まりで答え、ツールの前のフックでも断る守りを当てる。
- ランタイムの環境から GitHub のトークンを外す（それでログインするため）。そのため Copilot のチャットの gh・git は gh で有効なアカウントで動く。
- 使用状況は `usage.ts`（gh のログインのトークンで読む。トークンは github の機能が ai の口 `provideGhToken` に登録する）。
