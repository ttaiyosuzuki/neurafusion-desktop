# NF 右下の丸 — Mac の配布・署名・公証（DK-06）

アクセシビリティを使うため、Mac App Store ではなく自社サイト（GitHub のリリース）からの直接配布にする。
Apple の Developer ID で署名し、公証（notarization）を通す。

## いまの状態（2026-09-29）

| 項目 | 状態 |
|---|---|
| `.app` へのまとめ（`apps/nf-overlay-macos/scripts/package-app.sh`） | できる。bundle id `ai.neurafusion.overlay`・`LSUIElement`（Dock に出ない） |
| アドホック署名 | できる（`codesign --verify --strict` が通ることを確認）。**配布には使えない**（他の Mac では Gatekeeper が止める） |
| Developer ID 署名 | **登録待ち**（Apple Developer Program の登録は本人。表の #44） |
| 公証 | **登録待ち**（同上） |

## 登録が済んだら（本人の手順。証明書・パスワードの値はチャット・ファイル・コマンドの引数に書かない）

1. Xcode かキーチェーンアクセスで「Developer ID Application」証明書を作り、ログインキーチェーンに入れる（本人）。
2. 公証の資格情報を**キーチェーンのプロファイル**として保存する（本人が端末で対話入力）:
   `xcrun notarytool store-credentials nf-notary`（Apple ID・Team ID・App 用パスワードはその場で入力）
3. 署名と公証（エージェントが実行してよい。渡すのは証明書の**名前**とプロファイル**名**だけ）:
   ```
   NF_SIGN_IDENTITY="Developer ID Application: <名前> (<TEAMID>)" NF_NOTARY_PROFILE=nf-notary \
     apps/nf-overlay-macos/scripts/package-app.sh
   spctl --assess --type execute -vv apps/nf-overlay-macos/NFOverlay.app   # accepted / Notarized Developer ID を確認
   ```
4. できた `NFOverlay.app` を npm の tarball に同梱してリリースする（リリースの公開は取りまとめ役・本人の確認のあと）。

## 自動更新（DK-07）との関係

`neurafusion overlay start` は起動時に GitHub のリリース（`releases/latest`）を確かめ、新しい版があれば
**本人に聞いてから** `npm install -g <その版の tarball>` をする（了承が無ければ何もしない）。tarball の URL は
`https://github.com/ttaiyosuzuki/neurafusion-desktop/releases/download/` で始まるものだけを受け付ける。
同梱の `NFOverlay.app` も tarball ごと入れ替わる。署名・公証済みの `.app` を同梱すれば、更新後も Gatekeeper に止められない。
