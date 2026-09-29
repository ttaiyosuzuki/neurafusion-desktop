# 最初に配る人への案内（2026-09-30）

オーナーがそのまま送れる形（下の枠の中）。Windows の署名用の証明書は今は買わない（オーナー決定 2026-09-30。一般公開の前にもう一度判断する）。
Mac も Apple の Developer ID が無いので、アドホック署名（`build-macos-dmg.sh` 15 行目 `SIGN="${NF_SIGN_IDENTITY:--}"`）で公証なし。

確かめた出典:

- Mac: Apple「Macでアプリを安全に開く」<https://support.apple.com/ja-jp/102445>（2026-09-30 取得）: 「アプリを開くことを試みた後で…
  『プライバシーとセキュリティ』をクリックし、下にスクロールして『このまま開く』ボタンをクリック…警告メッセージが再び表示されるので…『開く』を
  クリック…その後は…ダブルクリックして開けるようになります。」。同梱の `はじめにお読みください.txt` の「右クリック →『開く』」はこの手順に無い
  （macOS 15 以降は効かない）→ 下の案内は設定からの手順だけにした。対応は macOS 14 以降（`Info.plist` の `LSMinimumSystemVersion` 14.0）。
- Windows: Microsoft「Smart App Control FAQ」<https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions>
  （2026-09-30 取得）: "If the security service can't make a confident prediction about the app, and the app doesn't have a valid signature, it's considered untrusted." /
  "There is currently no way to bypass Smart App Control protection for individual apps."。
  → **スマート アプリ コントロールが「オン」の Windows 11 では、今の Setup.exe は入れられない**（「実行」のボタンが出ない）。
  対応は Windows 10 2004（19041）以降の 64 ビット（`NfOverlay.Win.csproj` の `net8.0-windows10.0.19041.0`）。
- インストーラは利用者の権限で入る（`neurafusion.nsi` の `RequestExecutionLevel user`）。入れる途中で初回の準備（`nf-launch.mjs --install-only`）が走り、
  インターネットを使う。

---

```text
件名: NeuraFusion Desktop（試用版）の入れ方

NeuraFusion Desktop の試用版をお送りします。
今の版にはまだ Apple と Microsoft の「署名」が付いていないため、入れるときに警告が出ます。
下の手順で進めてください。途中で分からなくなったら、無理に進めずにご連絡ください。

■ Windows（Windows 10 バージョン 2004 以降・64 ビット）
1. NeuraFusion-Desktop-2026.9.6-windows-x64-Setup.exe をダウンロードします。
   ブラウザが「一般的にダウンロードされていません」などと止めたときは、
   ダウンロードの一覧のその行のメニュー（…）から「保存」または「保持する」を選びます。
2. ファイルを開くと、青い画面「Windows によって PC が保護されました」が出ます。
   「詳細情報」を押し、「発行元: 不明な発行元」と出たら「実行」を押します。
3. あとは画面の指示に従います。管理者の権限は要りません。
   途中で必要な部品をインターネットから取るため、数分かかることがあります。

※「スマート アプリ コントロール」の画面が出て「実行」のボタンが無いとき:
  Windows 11 のこの機能がオンになっていると、署名の無いアプリは個別に許可できません。
  そのまま閉じて、ご連絡ください。

■ Mac（macOS 14 以降）
1. お使いの Mac に合う方の .dmg を開きます。
   Apple のメニュー →「この Mac について」の「チップ」が「Apple M…」なら arm64、
   「プロセッサ」が「Intel」なら x64 です。
2. NeuraFusion を「アプリケーション」フォルダへドラッグします。
3. 「アプリケーション」の NeuraFusion をダブルクリックします。
   「Apple は…を検証できませんでした」という警告が出たら「完了」を押します
   （「ゴミ箱に入れる」は押さないでください）。
4. システム設定 →「プライバシーとセキュリティ」を開き、下の方の「セキュリティ」の所にある
   NeuraFusion の「このまま開く」を押します。パスワード（または Touch ID）を求められたら入れます。
5. もう一度出る確認で「開く」を押します。次からは普通にダブルクリックで開けます。
   同じ警告がもう一度出たときは（丸の部品など）、同じ 3〜5 の手順で進めます。
6. 「アクセシビリティ」の許可を求められたら、システム設定で NeuraFusion をオンにします。
   初回だけ、本体の準備に数分かかり、インターネットを使います。

■ ファイルが届いたままか確かめるとき（任意）
  Mac: ターミナルで  shasum -a 256 ファイル名
  Windows: PowerShell で  Get-FileHash ファイル名
  次の値と同じなら、こちらで作った物のままです。
  Windows  501f843ad033d70916ee2a9cbbee8df1a31c9897468788b17c8f74ed0d47d5e5
  Mac arm64 488aca26eb15a409894e9d3ced78cbfdff5298f6ef17cea30d4ac29ede50d5af
  Mac x64   49318c57fcaf02b89c7397ca8fee2db36d115596ac9e7f9c3c45694f527d0c77

ライセンスの表示は、Mac はディスクイメージの「ライセンス.txt」、Windows は入れた先のフォルダの
LICENSE・NOTICE・licenses フォルダにあります。
```

---

## 送る前にオーナーが確かめること

- 値（SHA-256）は 2026-09-29 に作り直した物（`.artifacts/installers/SHA256SUMS.txt`）。作り直したら差し替える。
- arm64 の .dmg はこの Mac（Intel）では動かしていない（cloud-build の担当）。arm64 を配るなら、その実行の確認のあとに。
- 同梱の `packaging/installer/はじめにお読みください.txt` の「署名について」の 2 か所は今の決定と食い違う（配布の担当へ。この文書では変えていない）:
  「Windows のコード署名の証明書は…購入の手続き中」（→ 今は買わない）、「Mac: NeuraFusion を右クリック →『開く』」（→ macOS 15 以降は設定の「このまま開く」）。
