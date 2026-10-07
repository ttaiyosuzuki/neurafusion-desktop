# RESUME（neurafusion-desktop の作業木 ~/nf-wt/v15all-o1-desktop）

## v15all o1（デスクトップの右下の丸・Opus 5.5・2026-10-07 17:4x〜）
- やっていること: apps/nf-overlay-macos を 15 時の指示どおりに直す（大きな窓を消す・丸はオン／オフだけ・メニューバーから設定・絡まる形）。指示は ~/.openclaw/workspace/tools/agent-tasks/v15all/o1.task.txt。
- どこまで: 読む物を読んだ。repo 側（~/nf-wt/v15all-o1・opus/v15all-o1）に forInline の書きかけを取り込み済み（a6057562f）。
- 次に: (1) 丸の見た目（30px・紫→ピンク→オレンジ→黄・オンは回る色と息の輪とまばたき・オフは灰色）(2) メニューバーと設定の窓（項目の表は NFOverlayCore に）(3) JavaScriptCore で forInline（JS は Swift の文字列として埋め込み・scripts/sync-prompt.sh）(4) 送る時に足す（CGEventTap・貼り付け）と ⌘⇧Enter (5) --selftest と swift test (6) .app と .dmg。
- 未保存の考え: 単独で起動（Finder から）できるように、標準入力が pipe でない時は Node なしで動く形にする。
