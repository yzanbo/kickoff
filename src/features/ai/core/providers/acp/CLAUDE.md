# ACP の変換係（`core/providers/acp`）と Cursor・Gemini

Agent Client Protocol の CLI をつなぐ。寄りかかっている所は `protocol.ts`（使う分だけの形）。Cursor（`cursor/`）・Gemini（`gemini/`。確かめた版は `gemini/provider.ts` の `TESTED_VERSION`）はこの上に作る。

- CLI ごとの違いは `AcpProviderSpec` だけで、ほかは初期化の答え（`agentCapabilities`）で分ける。
- エージェントのモードは「毎回聞く」か `plan` にし、権限の頼みで守りを当てる（`modeFor`）。ACP には砂場の口がなく、Bash の砂場は写せない。
- MCP は初期化の答えが `mcpCapabilities.http` を出したときだけ渡す（stdio にすると、鍵を引数か環境変数に載せることになる）。
- 作業中に足す発言・断った理由は、いまの指示が終わってから同じ実行の中で次の指示として送る（ACP に口がない）。
- Gemini は API キーでだけ動かす（Google のアカウントでほかのアプリから使うのは、利用規約が禁じる）。
