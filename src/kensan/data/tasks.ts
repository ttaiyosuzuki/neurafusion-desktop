// 自動生成: extension-kensan/data/tasks.json と同一内容（53業務辞書）。
// 変更するときは拡張側と同時に。手編集ではなく元 JSON からの再生成を推奨。
export const KENSAN_TASKS = {
  "version": "0.3.0",
  "note": "キーワード一致数だけで判定する。LLM は呼ばない。min_hits 未満は unknown（Fail Closed）。",
  "tasks": [
    {
      "id": "inheritance_tax",
      "name": "相続税申告",
      "keywords": [
        "相続",
        "亡くなった",
        "遺産",
        "被相続人",
        "小規模宅地",
        "未分割",
        "遺産分割",
        "配偶者の税額軽減",
        "相続人"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "亡くなった方と同居していた相続人が、申告期限までに自宅を売却して転居した。この場合でも、その宅地について小規模宅地等の特例（居住用宅地の評価減）を適用してよいか、というのは匿名の演習設定である。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "gift_tax",
      "name": "贈与税申告（暦年課税）",
      "keywords": [
        "贈与",
        "暦年課税",
        "110万円",
        "あげた",
        "もらった",
        "贈与者",
        "受贈者"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "同じ年に父と祖父の両方から現金の贈与を受けた場合、基礎控除は贈与者ごとに separately 使えるので、それぞれの贈与額から基礎控除を引いて計算してよいか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "gift_tax_settlement",
      "name": "贈与税申告（相続時精算課税）",
      "keywords": [
        "相続時精算課税",
        "精算課税選択届出",
        "2500万円の特別控除",
        "贈与者ごとの選択",
        "累積贈与額"
      ],
      "min_hits": 1,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "父からの贈与について相続時精算課税を選択した年の翌年、今度は母から贈与を受けた。母からの贈与についても、自動的に相続時精算課税が適用されると考えてよいか（届出は父の分しか出していない）、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "income_tax_return_salary",
      "name": "所得税確定申告（給与所得のみ）",
      "keywords": [
        "医療費控除",
        "ふるさと納税",
        "ワンストップ特例",
        "住宅ローン控除",
        "還付申告",
        "扶養控除"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "給与所得者がふるさと納税のワンストップ特例の書類を各自治体に送った後、医療費控除を受けるために別途確定申告をした。この場合、ワンストップ特例の適用はそのまま有効で、確定申告書には寄附金控除を書かなくてよいか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "income_tax_business",
      "name": "所得税確定申告（事業所得）",
      "keywords": [
        "個人事業主",
        "フリーランス",
        "青色申告",
        "白色申告",
        "経費",
        "家事按分",
        "収支内訳書"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "自宅の一部を事務所として使っている個人事業主が、家賃・水道光熱費の全額を必要経費に計上した（家事按分をしていない）。これは適正な処理といえるか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "corporate_tax",
      "name": "法人税申告（単体）",
      "keywords": [
        "法人税申告",
        "決算書",
        "別表四",
        "別表一",
        "資本金の額",
        "同族会社",
        "法人税の確定申告"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "中小法人が期中に役員報酬を業績悪化を理由に減額改定した。定期同額給与としての損金算入が認められるかどうかは、改定の理由や時期を問わず一律に認められると考えてよいか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "consumption_tax",
      "name": "消費税申告（原則課税）",
      "keywords": [
        "消費税",
        "本則課税",
        "課税売上割合",
        "仕入税額控除",
        "個別対応方式",
        "一括比例配分方式"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "課税売上割合が95%未満の事業者が、個別対応方式と一括比例配分方式のどちらを選ぶかによって仕入税額控除の金額が変わることを確認せず、前期と同じ方式をそのまま踏襲した。これは検算上、確認を省略してよい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "consumption_tax_simplified",
      "name": "消費税申告（簡易課税）",
      "keywords": [
        "簡易課税",
        "みなし仕入率",
        "事業区分（第一種）",
        "簡易課税選択届出書",
        "2期前の課税売上高"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "卸売業と小売業の両方を営む事業者が、簡易課税の計算にあたり、事業区分ごとに売上を按分せず、売上高の大きい方の事業区分のみなし仕入率を全売上に適用した。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "income_tax_salary_yearend",
      "name": "年末調整",
      "keywords": [
        "年末調整",
        "扶養控除等申告書",
        "保険料控除証明書",
        "中途入社",
        "前職の源泉徴収票",
        "年調年税額"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "年の途中で他社から転職してきた従業員について、前職分の源泉徴収票の提出を受けられなかったため、自社で支払った給与分だけで年末調整を完了させた。これは適正な処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "real_estate_transfer_income",
      "name": "所得税確定申告（譲渡所得・不動産）",
      "keywords": [
        "家を売った",
        "土地を売った",
        "居住用財産",
        "3000万円特別控除",
        "買い替え特例",
        "長期譲渡",
        "短期譲渡",
        "取得費が不明"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "居住用マンションを親族（子）に売却した場合でも、実際に住んでいた自宅であれば、居住用財産の特別控除を通常どおり適用してよいか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "stock_transfer_income",
      "name": "所得税確定申告（譲渡所得・株式）",
      "keywords": [
        "株を売った",
        "譲渡益",
        "特定口座",
        "NISA",
        "損益通算",
        "譲渡損失の繰越"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "前年に株式の売却で損失が出たが、前年は確定申告をしていなかった。今年の株式譲渡益から、前年の損失を繰越控除として差し引いてよいか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "real_estate_rental_income",
      "name": "所得税確定申告（不動産所得）",
      "keywords": [
        "家賃収入",
        "大家",
        "賃貸",
        "アパート経営",
        "減価償却",
        "不動産所得"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "アパートを1棟所有するオーナーが、土地の購入とあわせて組んだ借入金の利子を、建物の借入金利子と区別せずに全額必要経費に算入し、その年の不動産所得が赤字となったため、給与所得と損益通算した。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "quasi_final_return",
      "name": "準確定申告",
      "keywords": [
        "準確定申告",
        "亡くなった方の確定申告",
        "相続人全員の連署",
        "4か月以内",
        "故人の源泉徴収票"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "家族が亡くなった後、その方が亡くなった日の翌月に支払われた医療費を、準確定申告の医療費控除に含めた。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "business_opening_notification",
      "name": "開業届",
      "keywords": [
        "開業届",
        "個人事業の開業",
        "開業日",
        "屋号",
        "納税地の選択"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "個人で事業を始めた人が、開業届は提出したが青色申告承認申請書は提出していない。この場合でも、確定申告のときに自分で「青色申告で申告する」と選べば青色申告の特典を受けられるか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "company_establishment",
      "name": "法人設立届出",
      "keywords": [
        "会社設立",
        "法人設立届出書",
        "設立登記",
        "給与支払事務所等の開設届出",
        "設立日"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "株式会社を設立した際、税務署への法人設立届出書は提出したが、都道府県・市区町村への届出は「国税の届出をすれば地方税も自動的に処理される」と考え提出しなかった。これは正しい理解か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "blue_return_application",
      "name": "青色申告承認申請",
      "keywords": [
        "青色申告承認申請書",
        "青色申告にしたい",
        "65万円控除",
        "複式簿記の記帳体制",
        "提出期限（2か月）"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "個人事業主が事業を始めてから半年ほど経ってから青色申告承認申請書を提出した。この場合でも、申請した年の年初にさかのぼって青色申告が適用されると考えてよいか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "invoice_registration",
      "name": "インボイス（適格請求書発行事業者登録）",
      "keywords": [
        "インボイス登録",
        "適格請求書発行事業者",
        "登録番号",
        "2割特例",
        "免税事業者からの移行"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "取引先がほとんど一般消費者である免税事業者が、周囲に勧められてインボイス発行事業者に登録した。登録後は消費税の申告義務が新たに生じるが、取引先が一般消費者中心であることの検討は特に不要だったといえるか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "amended_return_refund",
      "name": "更正の請求",
      "keywords": [
        "更正の請求",
        "払いすぎた税金",
        "還付してほしい",
        "請求期限（5年）",
        "更正すべき事由"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "確定申告書を提出してから数年経ってから、控除の入れ忘れに気づいた。提出から何年経っていても、気づいた時点でいつでも更正の請求ができると考えてよいか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "amended_return_additional",
      "name": "修正申告",
      "keywords": [
        "修正申告",
        "申告漏れ",
        "追加で納める税金",
        "延滞税",
        "自主的な修正"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "税務署から調査の事前通知を受ける前に、自ら収入の計上漏れに気づいて修正申告を行った。この場合と、調査の通知を受けた後に修正申告した場合とで、課される可能性のある加算税の扱いは同じと考えてよいか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "tax_audit_response",
      "name": "税務調査対応（実地調査の立会い）",
      "keywords": [
        "税務調査",
        "事前通知",
        "調査官",
        "実地調査",
        "立会い",
        "反面調査"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "税務調査の事前通知を受けた事業者が、調査当日までに過去の帳簿・領収書を整理し直すことは、証拠の隠滅にあたるため避けるべきといえるか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "bookkeeping_service",
      "name": "記帳代行（税理士業務の付随業務としての整理）",
      "keywords": [
        "記帳代行",
        "仕訳",
        "帳簿つけ",
        "会計ソフト入力",
        "通帳・クレジットカード明細"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "事業用の口座とプライベート用の口座を分けていない個人事業主について、通帳の入出金をすべてそのまま事業の帳簿に転記した（按分をしていない）。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "financial_statements_preparation",
      "name": "決算書作成（会計基準の選択）",
      "keywords": [
        "決算書作成",
        "貸借対照表",
        "損益計算書",
        "試算表",
        "会計基準の選択"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "決算書の貸借対照表で、資産の部の合計額と負債・純資産の部の合計額が一致していない状態のまま、損益計算書の当期純利益だけを確定させて決算を終えた。これは問題のない処理といえるか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "statutory_report_summary",
      "name": "法定調書合計表",
      "keywords": [
        "法定調書合計表",
        "支払調書",
        "報酬・料金の支払い",
        "不動産の使用料の支払調書",
        "税理士や弁護士への報酬"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "個人の大家に事務所の家賃を払っている法人が、給与所得の源泉徴収票だけをまとめて法定調書合計表を作成し、不動産の使用料の支払調書は作成しなかった。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "withholding_tax_special_payment",
      "name": "源泉所得税納期の特例",
      "keywords": [
        "源泉所得税の納期の特例",
        "納期特例の承認に関する申請書",
        "年2回の納付",
        "常時10人未満",
        "従業員数が少ない"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "源泉所得税の納期の特例の承認を受けている会社が、賞与を支給した月の源泉徴収税額についても、通常の給与と同様に年2回の納期特例の対象に含めてよいか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "business_succession",
      "name": "事業承継（非上場株式評価）",
      "keywords": [
        "事業承継",
        "自社株評価",
        "類似業種比準",
        "純資産価額",
        "事業承継税制",
        "納税猶予",
        "後継者"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "非上場の同族会社の株式評価にあたり、会社規模区分（大会社・中会社・小会社）を判定せずに、前回評価時に使った評価方式をそのまま今回も使った。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "e_bookkeeping_law",
      "name": "電子帳簿保存法対応",
      "keywords": [
        "電帳法",
        "電子帳簿保存",
        "電子取引",
        "タイムスタンプ",
        "スキャナ保存"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "取引先からメールで受け取った請求書のPDFを、これまでどおり紙に印刷してファイリングし、メールのデータ自体は削除する運用を続けている。これは電子取引データの保存義務を満たしているといえるか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "fixed_term_bonus_notification",
      "name": "事前確定届出給与",
      "keywords": [
        "事前確定届出給与",
        "役員賞与",
        "届出賞与",
        "株主総会の決議日",
        "支給額と届出額の一致"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "事前確定届出給与の届出を行った役員賞与について、資金繰りの都合で届け出た金額より1万円少ない金額を支給した。差額部分だけが損金不算入になり、それ以外の部分は届出どおり損金算入できると考えてよいか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "director_compensation_regular",
      "name": "役員報酬（定期同額給与）の判定",
      "keywords": [
        "定期同額給与",
        "役員報酬の期中改定",
        "業績悪化改定事由",
        "通常改定の時期（3か月以内）",
        "損金不算入額の計算"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "事業年度が始まって5か月目に、業績悪化とは関係のない理由で役員報酬を増額改定した。この改定後の報酬も、定期同額給与として増額分を含め全額損金算入できると考えてよいか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "director_retirement_allowance",
      "name": "特定役員退職手当等の計算",
      "keywords": [
        "役員退職金",
        "退職所得控除額",
        "勤続年数",
        "2分の1課税の制限",
        "特定役員"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "役員としての在任期間が3年程度で退職する人の退職金について、他の一般的な退職金と同様に、退職所得の計算で2分の1課税を適用してよいか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "entertainment_expense_judgment",
      "name": "交際費等の損金不算入の判定",
      "keywords": [
        "交際費",
        "接待",
        "1人あたり飲食費",
        "会議費との区分",
        "定額控除限度額"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "取引先と少人数で行った打合せ後の簡単な食事代について、参加人数の記録を残していないが、1人あたり金額が少額だったという記憶だけを根拠に、交際費から除外できる少額飲食費として処理した。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "depreciation_method_notification",
      "name": "減価償却資産の償却方法の届出",
      "keywords": [
        "減価償却資産の償却方法",
        "定額法",
        "定率法",
        "償却方法の届出書",
        "法定償却方法"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "法人が新しく取得した建物附属設備について、会社の資金繰りを踏まえて定率法を選択する届出書を提出しようとしている。建物附属設備について定率法を自由に選択できると考えてよいか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "small_asset_investment_incentive",
      "name": "中小企業投資促進税制（少額資産の即時償却を含む）",
      "keywords": [
        "中小企業投資促進税制",
        "少額減価償却資産の特例",
        "30万円未満",
        "即時償却",
        "年間合計300万円"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "中小企業が少額減価償却資産の特例を使い、年間の取得金額の合計が限度額を超えているにもかかわらず、対象となる資産すべてを全額その年の経費として即時償却した。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "rd_tax_credit",
      "name": "研究開発税制の適用",
      "keywords": [
        "研究開発税制",
        "試験研究費",
        "増減試験研究費割合",
        "外部委託研究費",
        "研究専従割合"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "新製品の開発とあわせて実施した市場調査の費用を、試験研究費に含めて税額控除の計算対象とした。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "compressed_entry_bookkeeping",
      "name": "圧縮記帳",
      "keywords": [
        "圧縮記帳",
        "国庫補助金",
        "保険金での買い替え",
        "圧縮限度額",
        "課税の繰延べ"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "国庫補助金を受け取り圧縮記帳を適用した資産について、圧縮記帳は非課税の特典なので、その資産の減価償却費はその後の税務上の計算に一切影響しないと説明した。これは正しい説明か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "bad_debt_provision_individual",
      "name": "個別評価金銭債権に係る貸倒引当金",
      "keywords": [
        "貸倒引当金",
        "個別評価金銭債権",
        "回収不能",
        "取引先の倒産手続き",
        "債務超過が相当期間継続"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "取引先が民事再生手続きを開始した売掛金について、その取引先から受けている担保・保証による回収見込額を控除せずに、債権全額を貸倒引当金の繰入限度額の計算に含めた。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "inventory_valuation_method",
      "name": "棚卸資産の評価方法の選定・届出",
      "keywords": [
        "棚卸資産の評価方法",
        "先入先出法",
        "総平均法",
        "期末棚卸",
        "最終仕入原価法"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "棚卸資産の評価方法について税務署に届出を行っていない事業者が、その年だけ都合のよい評価方法（先入先出法）を選んで期末棚卸高を計算した。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "consumption_tax_taxable_election",
      "name": "消費税課税事業者選択届",
      "keywords": [
        "消費税課税事業者選択届出書",
        "あえて課税事業者になる",
        "設備投資の還付",
        "2年間の継続適用",
        "免税事業者から課税事業者へ"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "設備投資による消費税の還付を受けるために課税事業者選択届出書を提出した事業者が、還付を受けた翌年に業績が振るわなかったため、すぐに免税事業者に戻る届出を提出した。これは自由にできる処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "wage_increase_tax_credit",
      "name": "賃上げ促進税制の適用",
      "keywords": [
        "賃上げ促進税制",
        "給与等支給額の増加率",
        "継続雇用者",
        "教育訓練費の増加",
        "くるみん認定"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "賃上げ促進税制の適用にあたり、前期は在籍していなかった当期入社の従業員の給与も「継続雇用者」の給与等支給額の比較に含めて増加率を計算した。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "group_donation_tax_treatment",
      "name": "グループ内寄附金の税務処理",
      "keywords": [
        "グループ内寄附金",
        "子会社への資金援助",
        "寄附金認定",
        "受贈益の益金不算入",
        "100%資本関係の寄附"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "100%の資本関係にある子会社へ資金援助を行った親会社が、その支出を通常の寄附金と同様に損金算入限度額の計算にあてはめて損金算入額を求めた。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "deemed_dividend_calculation",
      "name": "みなし配当の判定・計算",
      "keywords": [
        "みなし配当",
        "自己株式の取得",
        "資本の払戻し",
        "資本金等の額",
        "利益積立金額"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "証券市場を通じて自社の株式を時価で買い戻した（市場取引による自己株式の取得を行った）法人が、この取引についてもみなし配当課税の対象になるものとして株主への源泉徴収を行った。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "corporate_reorganization_qualification",
      "name": "組織再編税制（適格判定）",
      "keywords": [
        "組織再編",
        "合併",
        "会社分割",
        "株式交換",
        "適格判定",
        "非適格再編"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "完全支配関係（100%グループ内）にある会社同士の合併で、対価として株式に加えて一部現金も交付した。金銭等の交付があっても、資本関係が100%であれば無条件に適格合併になると考えてよいか、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "consolidated_to_group_transition",
      "name": "連結納税から通算制度への移行対応",
      "keywords": [
        "連結納税",
        "グループ通算制度への移行",
        "連結欠損金の個別帰属額",
        "移行時の時価評価課税",
        "旧連結納税制度"
      ],
      "min_hits": 1,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "連結納税を行っていたグループがグループ通算制度へ移行するにあたり、旧連結納税時代の連結欠損金は移行後そのままグループ全体の欠損金として自動的に使えると考えてよいか（各法人への配分計算を行わずに）、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "transfer_pricing_taxation",
      "name": "移転価格税制",
      "keywords": [
        "移転価格",
        "国外関連者",
        "独立企業間価格",
        "ローカルファイル",
        "比較対象取引（コンパラブル）"
      ],
      "min_hits": 1,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "海外の関連会社との間で、商品の売買だけでなく技術の使用料（ロイヤルティ）のやり取りもある法人が、移転価格の文書化にあたり商品売買取引のみを対象とし、ロイヤルティ取引は対象に含めなかった。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "overseas_asset_report",
      "name": "国外財産調書・国外送金等調書",
      "keywords": [
        "国外財産調書",
        "国外送金等調書",
        "海外資産",
        "海外送金",
        "海外の預金・不動産"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "海外に不動産・預金に加えて海外の生命保険契約も保有している人が、国外財産調書の作成にあたり不動産と預金だけを記載し、海外の保険契約は財産の種類に含めなかった。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "foreign_tax_credit",
      "name": "外国税額控除",
      "keywords": [
        "外国税額控除",
        "二重課税の調整",
        "海外で納めた税金",
        "控除限度額の繰越",
        "国外源泉所得"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "海外で得た所得について現地で課された税金のうち、附帯税（延滞税に相当するもの）も含めて、すべてを外国税額控除の対象として計算した。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "cfc_taxation",
      "name": "CFC税制（タックスヘイブン対策税制）",
      "keywords": [
        "タックスヘイブン対策税制",
        "外国子会社合算税制",
        "軽課税国",
        "租税負担割合",
        "経済活動基準"
      ],
      "min_hits": 1,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "軽課税国にある外国子会社について、租税負担割合が低いことだけを理由に、経済活動基準（事務所の有無・実際の事業活動等）を確認せずに合算課税の対象と判定した。これは正しい判定手順か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "excessive_interest_payment_restriction",
      "name": "過大支払利子税制",
      "keywords": [
        "過大支払利子税制",
        "対象純支払利子等",
        "海外の関連会社からの借入利子",
        "少額免除基準",
        "調整所得金額"
      ],
      "min_hits": 1,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "海外の関連会社からの借入利子について、対象純支払利子等の額が少額免除基準に該当する可能性があるにもかかわらず、その確認を行わずに損金不算入額の計算をそのまま進めた。これは正しい処理手順か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "stamp_duty_registration_tax",
      "name": "印紙税・登録免許税の算定支援",
      "keywords": [
        "印紙税",
        "収入印紙",
        "登録免許税",
        "契約書の印紙",
        "電子契約は印紙税がかからない"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "紙で作成していた不動産売買契約書を電子契約（PDFに電子署名する方式）に切り替えたが、これまでどおり収入印紙を貼る前提で印紙税額を計算した。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "group_corporate_tax_system",
      "name": "グループ法人税制（100%グループ内取引）",
      "keywords": [
        "グループ法人税制",
        "100%グループ内取引",
        "譲渡損益調整資産",
        "譲渡損益の繰延べ",
        "完全支配関係"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "100%の資本関係にあるグループ会社間で少額の備品を譲渡した際、譲渡損益調整資産の金額基準を確認せず、一律にグループ法人税制の譲渡損益繰延べの対象として処理した。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "group_taxation_return",
      "name": "法人税申告（グループ通算）",
      "keywords": [
        "グループ通算制度",
        "通算グループ",
        "通算親法人",
        "100%子会社の申告",
        "損益通算（グループ）"
      ],
      "min_hits": 1,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "グループ通算制度を適用しているグループで、期中に100%子会社が1社増えたが、通算グループへの加入時期の確認をせずに、既存グループと同じ計算方法でそのまま所得金額を合算した。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "interim_provisional_tax_return",
      "name": "中間申告・予定申告（法人税・消費税）",
      "keywords": [
        "中間申告",
        "予定申告",
        "仮決算",
        "前期実績による予定申告",
        "前期の確定税額の6か月相当額"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "前期は黒字だったが今期前半に業績が大きく悪化した法人が、前期実績による予定申告方式と仮決算による中間申告方式のどちらが有利かを比較検討せずに、前期と同じ前期実績方式でそのまま申告した。これは検算上問題のない処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "consumption_tax_refund",
      "name": "消費税還付申告",
      "keywords": [
        "消費税還付申告",
        "輸出免税取引",
        "設備投資による還付",
        "輸出許可通知書",
        "高額特定資産"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "輸出取引を行っている事業者が、消費税の還付申告をするにあたり、輸出許可通知書等の証明書類を保存せずに、帳簿上の輸出売上高の集計だけをもとに申告した。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    },
    {
      "id": "loss_carryforward_management",
      "name": "繰越欠損金の期限管理",
      "keywords": [
        "繰越欠損金",
        "欠損金の繰越期限",
        "青色欠損金",
        "欠損金の控除順序",
        "組織再編と欠損金の引継ぎ制限"
      ],
      "min_hits": 2,
      "contract_url": "about:blank",
      "checklist_url": "about:blank",
      "sample_check_task": "複数年度にわたって欠損金を繰り越している法人が、当期の所得と欠損金を相殺する際に、繰越期限が近い古い年度の欠損金からではなく、直近の年度の欠損金から先に使った。これは正しい処理か、という匿名の演習問題。⭕正しい／✕誤り／判断できない"
    }
  ]
} as const;
