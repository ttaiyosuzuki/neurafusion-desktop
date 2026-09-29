# 右下の丸 — Windows 版のコード署名の手順（DK-06 の Windows 分）

**状態（2026-09-29）: 証明書は無い（指示書 §5 表 45「未定・本人が購入・契約」）。署名はしていない。**
署名が無いと、ダウンロード・インストール時に Windows（SmartScreen）の警告が出る。

この手順書は、本人が証明書を用意したあとにエージェントが署名するためのもの。
**証明書・秘密鍵・PIN・パスワードの値はどこにも書かない**（このファイル・コマンドの引数・ログ・チャットのどれにも）。

## 1. 本人がすること（エージェントは代わりにしない）

- 証明書の種類を選んで購入・契約する。候補:
  - 認証局の **コード署名証明書（OV または EV）**。今の発行ルールでは秘密鍵はハードウェア（USB トークン・HSM・クラウド HSM）に入って届く
  - **Microsoft Azure のマネージド署名サービス**（旧 Trusted Signing）。本人の確認（組織・個人）が要る
- 費用は購入先のページの表示額で報告する（この手順書には金額を書かない。確かめていない額を書かない）
- 秘密鍵の入った場所（トークン・HSM・Azure のアカウント）への本人の認証は、本人が行う

## 2. 署名するもの

`dotnet publish` の出力のうち、自前のもの:

- `nf-overlay.exe`（apphost）と `nf-overlay.dll`・`NfOverlay.Core.dll`
- インストーラーを作ったら、そのインストーラー（MSI / MSIX / setup.exe）

Microsoft の署名が付いている `Microsoft.Web.WebView2.*.dll`・`Microsoft.Windows.SDK.NET.dll` 等は署名し直さない。

## 3. 署名（Windows で行う）

`signtool` は Windows SDK に入っている。証明書は **ストア・トークン・HSM から参照する形** で指定し、
`.pfx` とパスワードをコマンドに書かない。

### A. 証明書がトークン・証明書ストアにある場合

```powershell
# 拇印（thumbprint）は公開情報だが、環境変数から読む形にして手順書に値を残さない
signtool sign /sha1 $env:NF_SIGN_THUMBPRINT /fd SHA256 /tr http://timestamp.<認証局のタイムスタンプ URL> /td SHA256 `
  /d "NeuraFusion Overlay" .\publish\nf-overlay.exe .\publish\nf-overlay.dll .\publish\NfOverlay.Core.dll
```

- `/tr` のタイムスタンプ URL は、証明書を買った認証局の案内のものを使う（タイムスタンプがあれば、証明書の期限が切れても署名は有効のまま）
- トークンの PIN はトークンのドライバーの画面で本人が入れる

### B. Azure のマネージド署名サービスの場合

- Microsoft の案内どおり、`signtool` に「dlib」（署名サービスのクライアント）と、アカウント名・証明書プロファイル名を書いた JSON を渡す
- Azure への認証は本人のログイン（`az login` 等）で行い、秘密の値をファイルに置かない

## 4. 確かめる

```powershell
signtool verify /pa /v .\publish\nf-overlay.exe   # 「Successfully verified」を確かめる
Get-AuthenticodeSignature .\publish\nf-overlay.exe | Format-List Status, SignerCertificate
```

- ダウンロードしたファイルで SmartScreen の表示を確かめる。**新しい証明書は、ダウンロード数がたまるまで警告が出続けることがある**（EV でも出ることがある）。出たかどうかを実測で報告する

## 5. CI に載せる場合（将来）

- 秘密の値は GitHub の Secrets にだけ置き、ワークフローのログに出さない。値の登録は本人が行う
- リリースの公開は本人の了承を得てから（エージェントはリリースを作らない・タグを打たない）
