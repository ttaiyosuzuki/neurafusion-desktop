NeuraFusion Desktop — Linux

────────────────────────────────────────────────
入れかた
────────────────────────────────────────────────

    tar xzf NeuraFusion-Desktop-*-linux.tar.gz
    cd NeuraFusion-Desktop-*-linux
    chmod +x install.sh
    ./install.sh


────────────────────────────────────────────────
必要なもの
────────────────────────────────────────────────

Node.js 24 以上

    node -v        で確認

入っていないとき:

  Debian / Ubuntu
    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
    sudo apt-get install -y nodejs

  Fedora
    sudo dnf install nodejs

  Arch
    sudo pacman -S nodejs npm


────────────────────────────────────────────────
sudo を使いたくないとき
────────────────────────────────────────────────

    npm config set prefix ~/.local
    export PATH="$HOME/.local/bin:$PATH"

を先にやってから install.sh を実行してください。
PATH の行は ~/.bashrc か ~/.zshrc に書いておくと次から要りません。


────────────────────────────────────────────────
入れたあと
────────────────────────────────────────────────

    neurafusion onboard      最初の設定
    neurafusion --help       できることの一覧

鍵は、この端末の Secret Service
（GNOME Keyring / KWallet）に入ります。
当社のサーバーには送られません。

Secret Service が無いヘッドレス環境では、権限を
600 に絞ったファイルに置きます。


────────────────────────────────────────────────
消しかた
────────────────────────────────────────────────

    npm uninstall -g openclaw
    rm -rf ~/.openclaw


────────────────────────────────────────────────

このソフトウェアは OpenClaw（MIT License）を基に
作られています。詳しくは同梱の NOTICE をご覧ください。

読み取りの範囲と、外に出さないものについては
THREAT_MODEL.md に書いてあります。

https://neurafusion.jp/fork
