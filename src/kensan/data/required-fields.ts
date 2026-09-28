// 自動生成: extension-kensan/data/required_fields.json と同一内容。
export type KensanRequiredFieldEntry = {
  id?: string;
  label: string;
  kind: string;
  ask?: string | null;
  [extra: string]: unknown;
};
export const KENSAN_REQUIRED_FIELDS: Record<string, KensanRequiredFieldEntry[]> = {
  "inheritance_tax": [
    {
      "id": "dec_death_date",
      "label": "亡くなった日",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "heirs_count",
      "label": "相続人の人数",
      "kind": "ask",
      "ask": "亡くなった方の相続人は何人いらっしゃいますか？",
      "value": null
    },
    {
      "id": "heirs_relationship",
      "label": "相続人との続柄",
      "kind": "ask",
      "ask": "相続人の続柄（配偶者・子など）を教えてください。",
      "value": null
    },
    {
      "id": "estate_split_status",
      "label": "遺産分割の状況",
      "kind": "ask",
      "ask": "財産の分け方（遺産分割）は、すでに決まっていますか？",
      "value": null
    },
    {
      "id": "cohabiting_heir",
      "label": "同居していた相続人の有無",
      "kind": "ask",
      "ask": "亡くなった方と同じ家に住んでいたご家族はいますか？",
      "value": null
    },
    {
      "id": "real_estate_docs",
      "label": "不動産の資料",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "bank_balance_docs",
      "label": "預貯金・有価証券の残高資料",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "life_insurance_payout",
      "label": "生命保険金・死亡退職金の資料",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "basic_deduction",
      "label": "基礎控除額",
      "kind": "we_determine",
      "ask": null,
      "value": null
    },
    {
      "id": "small_lot_special",
      "label": "小規模宅地等の特例の適用可否",
      "kind": "we_determine",
      "ask": null,
      "value": null
    }
  ],
  "gift_tax": [
    {
      "id": "gift_date",
      "label": "贈与を受けた日",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "donor_recipient_relationship",
      "label": "贈与者と受贈者の続柄",
      "kind": "ask",
      "ask": "贈与をくれた方とのご関係（親、祖父母など）を教えてください。",
      "value": null
    },
    {
      "id": "gift_property_type",
      "label": "贈与財産の種類",
      "kind": "ask",
      "ask": "もらったのは現金ですか？それとも不動産や株式などですか？",
      "value": null
    },
    {
      "id": "gift_amount",
      "label": "贈与財産の評価額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "multiple_donors_same_year",
      "label": "同じ年に他の方からも贈与を受けたか",
      "kind": "ask",
      "ask": "今年、他の方からも贈与を受けましたか？",
      "value": null
    },
    {
      "id": "prior_settlement_taxation_used",
      "label": "過去に相続時精算課税を選んだことがあるか",
      "kind": "ask",
      "ask": "以前、『相続時精算課税』という制度を選んだことはありますか？",
      "value": null
    },
    {
      "id": "special_exemption_applicability",
      "label": "各種特例の適用可否",
      "kind": "we_determine",
      "ask": null,
      "value": null
    }
  ],
  "gift_tax_settlement": [
    {
      "id": "donor_birthdate",
      "label": "贈与者の生年月日",
      "kind": "ask",
      "ask": "贈与をくれた方の生年月日を教えてください。",
      "value": null
    },
    {
      "id": "recipient_birthdate",
      "label": "受贈者の生年月日",
      "kind": "ask",
      "ask": "贈与を受けた方の生年月日を教えてください。",
      "value": null
    },
    {
      "id": "donor_recipient_relationship",
      "label": "贈与者との続柄",
      "kind": "ask",
      "ask": "贈与をくれた方は、親ですか祖父母ですか？",
      "value": null
    },
    {
      "id": "first_time_election",
      "label": "今回が初めての選択か",
      "kind": "ask",
      "ask": "この制度を選ぶのは今回が初めてですか？",
      "value": null
    },
    {
      "id": "cumulative_prior_gifts",
      "label": "過去の累積贈与額",
      "kind": "ask",
      "ask": "同じ方から過去にもこの制度で贈与を受けたことがありますか？金額は？",
      "value": null
    },
    {
      "id": "gift_property_details",
      "label": "贈与財産の内容・評価額",
      "kind": "document",
      "ask": null,
      "value": null
    }
  ],
  "income_tax_return_salary": [
    {
      "id": "target_year",
      "label": "対象年分",
      "kind": "ask",
      "ask": "今回、確定申告をするのは何年分の所得についてですか？",
      "value": null
    },
    {
      "id": "withholding_slip_payment",
      "label": "源泉徴収票の支払金額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "withholding_slip_tax",
      "label": "源泉徴収票の源泉徴収税額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "job_change_during_year",
      "label": "年の途中で転職したか",
      "kind": "ask",
      "ask": "今年の間に転職や退職をしましたか？",
      "value": null
    },
    {
      "id": "medical_expenses_over_100k",
      "label": "医療費を年間10万円以上払ったか",
      "kind": "ask",
      "ask": "ご自身やご家族の医療費を、今年1年で合計10万円以上払いましたか？",
      "value": null
    },
    {
      "id": "furusato_nozei_status",
      "label": "ふるさと納税・ワンストップ特例の有無",
      "kind": "ask",
      "ask": "ふるさと納税をしましたか？した場合、自治体に『ワンストップ特例』の書類を送りましたか？",
      "value": null
    },
    {
      "id": "refund_account",
      "label": "還付金の受取口座",
      "kind": "ask",
      "ask": "還付金を受け取る銀行口座を教えてください。",
      "value": null
    }
  ],
  "income_tax_business": [
    {
      "id": "fiscal_year",
      "label": "何年分の申告か",
      "kind": "ask",
      "ask": "何年分の申告ですか？",
      "value": null
    },
    {
      "id": "business_type",
      "label": "事業の内容（業種）",
      "kind": "ask",
      "ask": "どんなお仕事をされていますか？（例：デザイン業、飲食業など）",
      "value": null
    },
    {
      "id": "bookkeeping_method",
      "label": "青色申告／白色申告の別",
      "kind": "ask",
      "ask": "青色申告の届出を出していますか？",
      "value": null
    },
    {
      "id": "revenue_amount",
      "label": "年間売上の合計",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "necessary_expenses",
      "label": "経費の内訳",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "home_office_use",
      "label": "自宅を事務所として使っているか",
      "kind": "ask",
      "ask": "自宅の一部をお仕事に使っていますか？",
      "value": null
    },
    {
      "id": "family_salary_senju",
      "label": "家族に給与を払っているか",
      "kind": "ask",
      "ask": "ご家族にお給料を払っていますか？",
      "value": null
    },
    {
      "id": "blue_return_deduction",
      "label": "青色申告特別控除額の判定",
      "kind": "we_determine",
      "ask": null,
      "value": null
    }
  ],
  "corporate_tax": [
    {
      "id": "fiscal_period",
      "label": "事業年度（開始日・終了日）",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "financial_statements",
      "label": "決算書",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "capital_amount",
      "label": "資本金の額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "officer_compensation_pattern",
      "label": "役員報酬は毎月同じ金額か",
      "kind": "ask",
      "ask": "役員報酬は毎月同じ金額を払っていますか？期中で変更しましたか？",
      "value": null
    },
    {
      "id": "fixed_asset_changes",
      "label": "固定資産の取得・除却の有無",
      "kind": "ask",
      "ask": "今期、大きな設備や車などを買ったり処分したりしましたか？",
      "value": null
    },
    {
      "id": "bad_debt_existence",
      "label": "回収不能な売掛金等の有無",
      "kind": "ask",
      "ask": "今期、回収できなくなった売掛金などはありますか？",
      "value": null
    },
    {
      "id": "prior_loss_carryforward",
      "label": "前期からの繰越欠損金",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "taxable_income",
      "label": "課税所得の金額",
      "kind": "we_determine",
      "ask": null,
      "value": null
    }
  ],
  "consumption_tax": [
    {
      "id": "taxable_period",
      "label": "課税期間（開始日・終了日）",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "taxable_sales_amount",
      "label": "課税売上高の合計",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "nontaxable_sales_existence",
      "label": "非課税売上の有無",
      "kind": "ask",
      "ask": "消費税がかからない売上（例：住宅の家賃収入など）はありますか？",
      "value": null
    },
    {
      "id": "taxable_purchases_amount",
      "label": "課税仕入の合計",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "invoice_supplier_check",
      "label": "仕入先がインボイス発行事業者か確認しているか",
      "kind": "ask",
      "ask": "仕入先が『適格請求書発行事業者』かどうか、請求書で確認していますか？",
      "value": null
    },
    {
      "id": "interim_payment_made",
      "label": "中間納付の有無",
      "kind": "document",
      "ask": null,
      "value": null
    }
  ],
  "consumption_tax_simplified": [
    {
      "id": "taxable_period",
      "label": "課税期間（開始日・終了日）",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "taxable_sales_amount",
      "label": "課税売上高の合計",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "business_type",
      "label": "事業の内容",
      "kind": "ask",
      "ask": "主にどんなお仕事をされていますか？",
      "value": null
    },
    {
      "id": "multiple_business_types",
      "label": "複数の事業を行っているか",
      "kind": "ask",
      "ask": "性質の異なる複数の事業（例：物販とサービス業）をしていますか？",
      "value": null
    },
    {
      "id": "simplified_election_filed",
      "label": "簡易課税選択届出書の提出状況",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "base_period_sales",
      "label": "基準期間（2期前）の課税売上高",
      "kind": "document",
      "ask": null,
      "value": null
    }
  ],
  "income_tax_salary_yearend": [
    {
      "id": "target_year",
      "label": "対象年",
      "kind": "ask",
      "ask": "今回の年末調整は何年分ですか？",
      "value": null
    },
    {
      "id": "num_employees",
      "label": "従業員数",
      "kind": "ask",
      "ask": "年末調整の対象となる従業員は何人ですか？",
      "value": null
    },
    {
      "id": "salary_bonus_records",
      "label": "各従業員の年間給与・賞与額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "dependents_form",
      "label": "扶養控除等申告書の内容",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "mid_year_joiners",
      "label": "中途入社者の有無",
      "kind": "ask",
      "ask": "今年、他社から転職してきた社員はいますか？",
      "value": null
    },
    {
      "id": "insurance_deduction_certificates",
      "label": "保険料控除証明書の提出状況",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "housing_loan_deduction_target",
      "label": "住宅ローン控除対象者の有無",
      "kind": "ask",
      "ask": "住宅ローン控除を受けている社員はいますか？",
      "value": null
    }
  ],
  "real_estate_transfer_income": [
    {
      "id": "transfer_date",
      "label": "売却日",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "property_type",
      "label": "売却した不動産の種類（自宅・投資用等）",
      "kind": "ask",
      "ask": "売った不動産は、ご自宅ですか？それとも投資用ですか？",
      "value": null
    },
    {
      "id": "sale_price",
      "label": "売却価格",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "purchase_price_date",
      "label": "購入時の価格・購入年月",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "resided_period",
      "label": "実際に住んでいた期間",
      "kind": "ask",
      "ask": "その不動産に実際に住んでいましたか？いつからいつまでですか？",
      "value": null
    },
    {
      "id": "buyer_is_relative",
      "label": "売却相手が親族かどうか",
      "kind": "ask",
      "ask": "売却した相手は、ご家族や親族ですか？",
      "value": null
    },
    {
      "id": "repurchase_after_sale",
      "label": "買い替えで新しい不動産を購入したか",
      "kind": "ask",
      "ask": "売却の前後で、新しい不動産を買いましたか？",
      "value": null
    }
  ],
  "stock_transfer_income": [
    {
      "id": "target_year",
      "label": "対象年分",
      "kind": "ask",
      "ask": "何年分の申告ですか？",
      "value": null
    },
    {
      "id": "account_type",
      "label": "証券口座の種類（特定・一般・NISA）",
      "kind": "ask",
      "ask": "株式の口座は『特定口座』『一般口座』『NISA』のどれですか？",
      "value": null
    },
    {
      "id": "annual_trading_report",
      "label": "年間取引報告書の損益額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "multiple_brokers",
      "label": "複数の証券会社を使っているか",
      "kind": "ask",
      "ask": "株や投資信託の口座は何社にありますか？",
      "value": null
    },
    {
      "id": "carryforward_loss",
      "label": "前年以前から繰り越している損失の有無",
      "kind": "ask",
      "ask": "去年以前の株の売却で、まだ使い切っていない損（繰越損失）はありますか？",
      "value": null
    },
    {
      "id": "inherited_or_gifted_stock",
      "label": "相続や贈与で取得した株式か",
      "kind": "ask",
      "ask": "売った株は、相続や贈与でもらったものですか？",
      "value": null
    }
  ],
  "real_estate_rental_income": [
    {
      "id": "target_year",
      "label": "対象年分",
      "kind": "ask",
      "ask": "何年分の申告ですか？",
      "value": null
    },
    {
      "id": "property_type",
      "label": "物件の種類（マンション一室・一棟アパート等）",
      "kind": "ask",
      "ask": "貸している不動産はどんなタイプですか？",
      "value": null
    },
    {
      "id": "annual_rent_income",
      "label": "年間家賃収入",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "building_acquisition",
      "label": "建物の取得価額・取得年月",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "loan_interest",
      "label": "借入金の有無・年間利子額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "repair_or_renovation",
      "label": "今年、修繕や改装をしたか",
      "kind": "ask",
      "ask": "今年、建物の修理やリフォームをしましたか？",
      "value": null
    },
    {
      "id": "vacancy_period",
      "label": "空室期間の有無",
      "kind": "ask",
      "ask": "今年、空室になっていた期間はありましたか？",
      "value": null
    }
  ],
  "quasi_final_return": [
    {
      "id": "death_date",
      "label": "亡くなった年月日",
      "kind": "ask",
      "ask": "ご家族が亡くなった年月日を教えてください。",
      "value": null
    },
    {
      "id": "income_type",
      "label": "亡くなった方の主な収入の種類",
      "kind": "ask",
      "ask": "亡くなった方の主な収入は何でしたか？（お給料、年金、事業など）",
      "value": null
    },
    {
      "id": "income_documents",
      "label": "亡くなった方の源泉徴収票・収支資料",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "heirs_count_relationship",
      "label": "相続人の人数・続柄",
      "kind": "ask",
      "ask": "相続人（財産を受け継ぐ方）は何人で、続柄はどなたですか？",
      "value": null
    },
    {
      "id": "medical_expenses_before_death",
      "label": "亡くなった日までに払った医療費",
      "kind": "ask",
      "ask": "亡くなった日までに、医療費をいくら払いましたか？",
      "value": null
    }
  ],
  "business_opening_notification": [
    {
      "id": "opening_date",
      "label": "開業日",
      "kind": "ask",
      "ask": "事業を始めた（始める予定の）日を教えてください。",
      "value": null
    },
    {
      "id": "business_content",
      "label": "事業の内容",
      "kind": "ask",
      "ask": "どんな事業を始めますか？",
      "value": null
    },
    {
      "id": "trade_name",
      "label": "屋号（あれば）",
      "kind": "ask",
      "ask": "屋号（お店や事業の名前）はありますか？",
      "value": null
    },
    {
      "id": "tax_location",
      "label": "納税地（自宅か事務所か）",
      "kind": "ask",
      "ask": "税金上の住所は、ご自宅と事務所のどちらにしますか？",
      "value": null
    },
    {
      "id": "blue_return_together",
      "label": "青色申告も同時に申請するか",
      "kind": "ask",
      "ask": "青色申告も同時に申請したいですか？",
      "value": null
    }
  ],
  "company_establishment": [
    {
      "id": "establishment_date",
      "label": "設立日（登記日）",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "company_name_address",
      "label": "法人名・所在地",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "capital_amount",
      "label": "資本金の額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "fiscal_year_end",
      "label": "事業年度（決算月）",
      "kind": "ask",
      "ask": "決算月はいつにしますか？（定款で決めていれば教えてください）",
      "value": null
    },
    {
      "id": "business_content",
      "label": "事業の内容",
      "kind": "ask",
      "ask": "どんな事業を行いますか？",
      "value": null
    },
    {
      "id": "hiring_employees",
      "label": "従業員を雇う予定があるか",
      "kind": "ask",
      "ask": "従業員を雇う予定はありますか？",
      "value": null
    }
  ],
  "blue_return_application": [
    {
      "id": "target_year",
      "label": "適用を受けたい年分",
      "kind": "ask",
      "ask": "青色申告を何年分から始めたいですか？",
      "value": null
    },
    {
      "id": "opening_date",
      "label": "開業日（個人の場合）",
      "kind": "ask",
      "ask": "事業を始めた日を教えてください。",
      "value": null
    },
    {
      "id": "bookkeeping_capability",
      "label": "複式簿記で記帳できる体制があるか",
      "kind": "ask",
      "ask": "帳簿は複式簿記（貸借対照表が作れる形式）でつけられますか？会計ソフトは使いますか？",
      "value": null
    },
    {
      "id": "prior_revocation_history",
      "label": "過去に承認を取り消されたことがあるか",
      "kind": "ask",
      "ask": "過去に青色申告の承認を取り消されたことはありますか？",
      "value": null
    },
    {
      "id": "applicant_info",
      "label": "氏名・住所（法人名・所在地）",
      "kind": "document",
      "ask": null,
      "value": null
    }
  ],
  "invoice_registration": [
    {
      "id": "current_tax_status",
      "label": "現在、課税事業者か免税事業者か",
      "kind": "ask",
      "ask": "今は消費税を納める事業者ですか、それとも免除されていますか？",
      "value": null
    },
    {
      "id": "main_customer_type",
      "label": "主な取引先は事業者か一般消費者か",
      "kind": "ask",
      "ask": "お仕事の相手は主に会社・事業者ですか、それとも一般の方ですか？",
      "value": null
    },
    {
      "id": "annual_sales_scale",
      "label": "年間売上の規模",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "already_registered",
      "label": "登録済みかどうか",
      "kind": "ask",
      "ask": "すでにインボイス発行事業者として登録していますか？",
      "value": null
    },
    {
      "id": "considering_simplified",
      "label": "簡易課税を検討しているか",
      "kind": "ask",
      "ask": "簡易課税制度について検討していますか？",
      "value": null
    }
  ],
  "amended_return_refund": [
    {
      "id": "target_year_tax_type",
      "label": "対象年分・税目",
      "kind": "ask",
      "ask": "どの年分の、どの税金についてですか？",
      "value": null
    },
    {
      "id": "original_return",
      "label": "当初提出した申告書",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "reason_for_overpayment",
      "label": "税額を多く申告してしまった理由",
      "kind": "ask",
      "ask": "なぜ税金を多く申告してしまったと思いますか？（控除の入れ忘れ等）",
      "value": null
    },
    {
      "id": "filing_date",
      "label": "申告書を提出した日",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "supporting_documents",
      "label": "理由を裏付ける書類の有無",
      "kind": "ask",
      "ask": "その理由を証明できる書類（領収書等）はありますか？",
      "value": null
    },
    {
      "id": "refund_account",
      "label": "還付金の受取口座",
      "kind": "ask",
      "ask": "還付金の受取口座を教えてください。",
      "value": null
    }
  ],
  "amended_return_additional": [
    {
      "id": "target_year_tax_type",
      "label": "対象年分・税目",
      "kind": "ask",
      "ask": "どの年分の、どの税金についてですか？",
      "value": null
    },
    {
      "id": "original_return",
      "label": "当初提出した申告書",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "reason_for_underpayment",
      "label": "税額が少なくなってしまった理由",
      "kind": "ask",
      "ask": "なぜ税金が少なくなってしまったと思いますか？（収入の計上漏れ等）",
      "value": null
    },
    {
      "id": "audit_contact_received",
      "label": "税務署から調査の連絡が来ているか",
      "kind": "ask",
      "ask": "税務署から調査などの連絡は来ていますか？",
      "value": null
    },
    {
      "id": "corrected_records",
      "label": "正しい金額がわかる資料",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "payment_account",
      "label": "納税に使う口座",
      "kind": "ask",
      "ask": "追加で納める税金の支払いに使う口座を教えてください。",
      "value": null
    }
  ],
  "tax_audit_response": [
    {
      "id": "target_period_tax_type",
      "label": "調査の対象年分・税目",
      "kind": "ask",
      "ask": "税務調査の対象になっている年分・税金の種類を教えてください。",
      "value": null
    },
    {
      "id": "notice_date_and_schedule",
      "label": "連絡があった日・調査予定日",
      "kind": "ask",
      "ask": "税務署から連絡があった日と、調査の予定日を教えてください。",
      "value": null
    },
    {
      "id": "returns_and_books",
      "label": "対象年分の申告書・帳簿",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "concerning_transactions",
      "label": "気になっている取引・処理の有無",
      "kind": "ask",
      "ask": "ご自身で『これは調査で指摘されるかも』と思う取引はありますか？",
      "value": null
    },
    {
      "id": "prior_audit_history",
      "label": "過去に税務調査を受けたことがあるか",
      "kind": "ask",
      "ask": "過去に税務調査を受けたことはありますか？",
      "value": null
    }
  ],
  "bookkeeping_service": [
    {
      "id": "target_period",
      "label": "対象期間",
      "kind": "ask",
      "ask": "記帳をお願いしたい期間を教えてください。",
      "value": null
    },
    {
      "id": "bank_card_statements",
      "label": "通帳・クレジットカード明細",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "separate_business_account",
      "label": "事業用口座とプライベート口座が分かれているか",
      "kind": "ask",
      "ask": "事業用の口座とプライベートの口座は分かれていますか？",
      "value": null
    },
    {
      "id": "cash_receipts",
      "label": "現金取引の記録の有無",
      "kind": "ask",
      "ask": "現金で払った経費のレシートはありますか？",
      "value": null
    },
    {
      "id": "accounting_software",
      "label": "使用している会計ソフト",
      "kind": "ask",
      "ask": "会計ソフトは何を使っていますか？（使っていなければその旨）",
      "value": null
    }
  ],
  "financial_statements_preparation": [
    {
      "id": "fiscal_period",
      "label": "対象となる決算期間",
      "kind": "ask",
      "ask": "対象となる決算期間を教えてください。",
      "value": null
    },
    {
      "id": "trial_balance",
      "label": "試算表・総勘定元帳",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "accounting_standard_used",
      "label": "採用している会計基準",
      "kind": "ask",
      "ask": "決算書を作るときのルール（会計基準）は何を使っていますか？わからなければその旨教えてください。",
      "value": null
    },
    {
      "id": "special_transactions",
      "label": "今期、特殊な取引があったか",
      "kind": "ask",
      "ask": "今期、資産の売却や大きな借入など、特別な取引はありましたか？",
      "value": null
    },
    {
      "id": "related_party_loans",
      "label": "関連会社・役員との貸し借りの有無",
      "kind": "ask",
      "ask": "グループ会社や役員個人とのお金の貸し借りはありますか？",
      "value": null
    }
  ],
  "statutory_report_summary": [
    {
      "id": "target_year",
      "label": "対象年分",
      "kind": "ask",
      "ask": "何年分の法定調書ですか？",
      "value": null
    },
    {
      "id": "salary_payment_records",
      "label": "給与を支払った従業員数・総額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "professional_fee_payments",
      "label": "税理士や弁護士等への報酬支払いの有無",
      "kind": "ask",
      "ask": "税理士や弁護士、デザイナーなど個人への報酬の支払いはありますか？",
      "value": null
    },
    {
      "id": "real_estate_rent_to_individual",
      "label": "個人の大家に賃借料を払っているか",
      "kind": "ask",
      "ask": "事務所や駐車場などの家賃を、個人の大家さんに払っていますか？",
      "value": null
    },
    {
      "id": "payee_info",
      "label": "支払先の氏名・住所・マイナンバー",
      "kind": "document",
      "ask": null,
      "value": null
    }
  ],
  "withholding_tax_special_payment": [
    {
      "id": "employee_count",
      "label": "常時雇用している従業員数",
      "kind": "ask",
      "ask": "普段、お給料を払っている従業員は何人ですか？",
      "value": null
    },
    {
      "id": "already_approved",
      "label": "すでに承認を受けているか",
      "kind": "ask",
      "ask": "すでに『納期の特例』の承認を受けていますか？",
      "value": null
    },
    {
      "id": "company_info",
      "label": "法人名・所在地",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "salary_payment_pattern",
      "label": "給与の支払形態",
      "kind": "ask",
      "ask": "お給料は毎月決まった日に払っていますか？",
      "value": null
    },
    {
      "id": "special_scope_determination",
      "label": "特例の対象範囲の判定",
      "kind": "we_determine",
      "ask": null,
      "value": null
    }
  ],
  "business_succession": [
    {
      "id": "valuation_date",
      "label": "評価基準日",
      "kind": "ask",
      "ask": "株式の評価はいつの時点で行いますか？",
      "value": null
    },
    {
      "id": "financial_statements",
      "label": "直前期の決算書",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "shareholding_structure",
      "label": "発行済株式数・株主構成",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "employee_count",
      "label": "従業員数",
      "kind": "ask",
      "ask": "従業員は何人いますか（役員を除く常時使用人）？",
      "value": null
    },
    {
      "id": "valuation_purpose",
      "label": "評価の目的（贈与・相続・売買等）",
      "kind": "ask",
      "ask": "株式の評価は、贈与・相続・売買のどれを検討するためですか？",
      "value": null
    },
    {
      "id": "successor_relationship",
      "label": "承継予定の株主・後継者との関係",
      "kind": "ask",
      "ask": "株を渡す予定の相手は、どなたですか（続柄）？",
      "value": null
    },
    {
      "id": "unrealized_gains_assets",
      "label": "含み益のある土地・有価証券の有無",
      "kind": "ask",
      "ask": "会社が持っている土地や株で、買った時より値上がりしているものはありますか？",
      "value": null
    }
  ],
  "e_bookkeeping_law": [
    {
      "id": "entity_type",
      "label": "事業形態（法人・個人事業）",
      "kind": "ask",
      "ask": "法人ですか、個人事業主ですか？",
      "value": null
    },
    {
      "id": "main_electronic_transaction_type",
      "label": "電子取引の主な種類",
      "kind": "ask",
      "ask": "請求書や領収書は、主にどんな方法でやり取りしていますか？",
      "value": null
    },
    {
      "id": "current_storage_method",
      "label": "現在の保存方法",
      "kind": "ask",
      "ask": "今、書類はどのように保存していますか？",
      "value": null
    },
    {
      "id": "storage_system_used",
      "label": "使用している保存システムの有無",
      "kind": "ask",
      "ask": "会計ソフトや書類保存用のシステムは使っていますか？",
      "value": null
    },
    {
      "id": "accounting_staff_count",
      "label": "経理担当者の人数",
      "kind": "ask",
      "ask": "経理を担当している人数を教えてください。",
      "value": null
    },
    {
      "id": "search_requirement_met",
      "label": "検索機能の3要件を満たす保存ができているか",
      "kind": "we_determine",
      "ask": null,
      "value": null
    }
  ],
  "fixed_term_bonus_notification": [
    {
      "id": "officer_name",
      "label": "賞与を支給する役員",
      "kind": "ask",
      "ask": "賞与を支給する役員はどなたですか？",
      "value": null
    },
    {
      "id": "planned_payment_date",
      "label": "支給予定日",
      "kind": "ask",
      "ask": "賞与をいつ支給する予定ですか？",
      "value": null
    },
    {
      "id": "planned_payment_amount",
      "label": "支給予定額",
      "kind": "ask",
      "ask": "支給する金額はいくらですか？",
      "value": null
    },
    {
      "id": "resolution_date",
      "label": "株主総会等の決議日",
      "kind": "ask",
      "ask": "役員報酬・賞与を決める株主総会（決議）はいつ行いましたか（行う予定ですか）？",
      "value": null
    },
    {
      "id": "fiscal_year_start",
      "label": "事業年度の開始日",
      "kind": "document",
      "ask": null,
      "value": null
    }
  ],
  "director_compensation_regular": [
    {
      "id": "fiscal_period",
      "label": "対象となる事業年度",
      "kind": "ask",
      "ask": "対象となる事業年度を教えてください。",
      "value": null
    },
    {
      "id": "monthly_compensation_records",
      "label": "各月の役員報酬支給額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "mid_year_change",
      "label": "期中で報酬を変更したか",
      "kind": "ask",
      "ask": "期の途中で役員報酬の金額を変えましたか？",
      "value": null
    },
    {
      "id": "change_timing_reason",
      "label": "変更した時期・理由",
      "kind": "ask",
      "ask": "変更したのはいつで、どんな理由でしたか？",
      "value": null
    },
    {
      "id": "business_downturn_reason",
      "label": "業績悪化による減額か",
      "kind": "ask",
      "ask": "業績が大きく悪化したための減額ですか？",
      "value": null
    }
  ],
  "director_retirement_allowance": [
    {
      "id": "officer_name",
      "label": "退職する役員の氏名",
      "kind": "ask",
      "ask": "退職される役員のお名前を教えてください。",
      "value": null
    },
    {
      "id": "tenure_period",
      "label": "役員としての在任期間",
      "kind": "ask",
      "ask": "役員として何年何か月在任されましたか？",
      "value": null
    },
    {
      "id": "retirement_payment_amount",
      "label": "退職金の支給額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "prior_employee_status",
      "label": "役員になる前は従業員だったか",
      "kind": "ask",
      "ask": "役員になる前は、社員（従業員）として働いていましたか？",
      "value": null
    },
    {
      "id": "retirement_income_form",
      "label": "退職所得の受給に関する申告書",
      "kind": "document",
      "ask": null,
      "value": null
    }
  ],
  "entertainment_expense_judgment": [
    {
      "id": "fiscal_period",
      "label": "対象事業年度",
      "kind": "ask",
      "ask": "対象となる事業年度を教えてください。",
      "value": null
    },
    {
      "id": "entertainment_expense_list",
      "label": "交際費・会議費として計上している支出の一覧",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "participant_count_records",
      "label": "得意先との飲食費の参加人数の記録の有無",
      "kind": "ask",
      "ask": "取引先との飲食の際、参加人数を記録していますか？",
      "value": null
    },
    {
      "id": "is_small_company",
      "label": "中小法人に該当するか",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "gift_expenses",
      "label": "贈答品・お中元お歳暮の支出の有無",
      "kind": "ask",
      "ask": "取引先へのお中元・お歳暮などの贈り物はありますか？",
      "value": null
    }
  ],
  "depreciation_method_notification": [
    {
      "id": "asset_type",
      "label": "対象となる資産の種類",
      "kind": "ask",
      "ask": "償却方法を選びたい資産は何ですか？（機械、車両など）",
      "value": null
    },
    {
      "id": "new_or_change",
      "label": "新規か変更か",
      "kind": "ask",
      "ask": "今回は新しく資産を取得したのですか、それとも方法を変更したいのですか？",
      "value": null
    },
    {
      "id": "acquisition_timing",
      "label": "資産の取得予定時期",
      "kind": "ask",
      "ask": "その資産はいつ取得しましたか（する予定ですか）？",
      "value": null
    },
    {
      "id": "entity_type",
      "label": "法人か個人事業か",
      "kind": "ask",
      "ask": "法人ですか、個人事業主ですか？",
      "value": null
    },
    {
      "id": "fiscal_period",
      "label": "事業年度",
      "kind": "document",
      "ask": null,
      "value": null
    }
  ],
  "small_asset_investment_incentive": [
    {
      "id": "fiscal_period",
      "label": "対象事業年度",
      "kind": "ask",
      "ask": "対象となる事業年度を教えてください。",
      "value": null
    },
    {
      "id": "asset_details",
      "label": "取得した資産の種類・金額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "acquisition_date",
      "label": "取得日",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "is_small_company",
      "label": "中小企業に該当するか",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "want_immediate_writeoff",
      "label": "少額資産の即時償却を使いたいか",
      "kind": "ask",
      "ask": "30万円未満の資産を、その年に全部経費にしたいですか？",
      "value": null
    }
  ],
  "rd_tax_credit": [
    {
      "id": "fiscal_period",
      "label": "対象事業年度",
      "kind": "ask",
      "ask": "対象となる事業年度を教えてください。",
      "value": null
    },
    {
      "id": "research_content",
      "label": "研究開発の内容",
      "kind": "ask",
      "ask": "どんな研究・開発をしていますか？",
      "value": null
    },
    {
      "id": "research_labor_cost",
      "label": "研究にかかった人件費",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "research_material_outsourcing_cost",
      "label": "研究にかかった材料費・外部委託費",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "dedicated_researchers",
      "label": "研究に専従している従業員の有無",
      "kind": "ask",
      "ask": "研究だけを専門に行っている従業員はいますか？",
      "value": null
    }
  ],
  "compressed_entry_bookkeeping": [
    {
      "id": "fiscal_period",
      "label": "対象事業年度",
      "kind": "ask",
      "ask": "対象となる事業年度を教えてください。",
      "value": null
    },
    {
      "id": "subsidy_or_insurance_details",
      "label": "受け取った補助金・保険金等の内容",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "replacement_asset_details",
      "label": "買い替えた資産の内容・金額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "asset_exchange",
      "label": "資産の交換を行ったか",
      "kind": "ask",
      "ask": "資産を他の資産と交換したことはありますか？",
      "value": null
    },
    {
      "id": "disaster_insurance_replacement",
      "label": "保険金で滅失した資産を買い替えたか",
      "kind": "ask",
      "ask": "火災などで資産が失われ、保険金で買い替えたことはありますか？",
      "value": null
    }
  ],
  "bad_debt_provision_individual": [
    {
      "id": "fiscal_period",
      "label": "対象事業年度",
      "kind": "ask",
      "ask": "対象となる事業年度を教えてください。",
      "value": null
    },
    {
      "id": "troubled_client_and_amount",
      "label": "回収が難しくなっている取引先・債権額",
      "kind": "ask",
      "ask": "回収が難しい取引先と、その金額を教えてください。",
      "value": null
    },
    {
      "id": "client_insolvency_status",
      "label": "取引先の倒産手続き等の状況",
      "kind": "ask",
      "ask": "その取引先は、倒産手続き（民事再生・会社更生等）を始めていますか？",
      "value": null
    },
    {
      "id": "collateral_or_guarantee",
      "label": "担保や保証の有無",
      "kind": "ask",
      "ask": "その債権に、担保や保証はついていますか？",
      "value": null
    },
    {
      "id": "transaction_history",
      "label": "取引先との取引経緯",
      "kind": "document",
      "ask": null,
      "value": null
    }
  ],
  "inventory_valuation_method": [
    {
      "id": "fiscal_period",
      "label": "対象事業年度",
      "kind": "ask",
      "ask": "対象となる事業年度を教えてください。",
      "value": null
    },
    {
      "id": "valuation_method",
      "label": "現在採用している（したい）評価方法",
      "kind": "ask",
      "ask": "棚卸資産の評価方法は決まっていますか？（先入先出法など）",
      "value": null
    },
    {
      "id": "year_end_inventory",
      "label": "期末の実地棚卸数量・金額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "purchase_records",
      "label": "仕入・払出のデータ",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "devalued_inventory",
      "label": "型落ち・破損等で価値が下がった在庫の有無",
      "kind": "ask",
      "ask": "売れ残って価値が下がった商品や、壊れた在庫はありますか？",
      "value": null
    }
  ],
  "consumption_tax_taxable_election": [
    {
      "id": "currently_exempt",
      "label": "現在、消費税の免税事業者か",
      "kind": "ask",
      "ask": "今は消費税を納めなくてよい事業者ですか？",
      "value": null
    },
    {
      "id": "reason_for_election",
      "label": "課税事業者を選びたい理由",
      "kind": "ask",
      "ask": "なぜ課税事業者になりたいと思いましたか？（設備投資の還付など）",
      "value": null
    },
    {
      "id": "planned_investment",
      "label": "予定している設備投資の内容・金額",
      "kind": "ask",
      "ask": "予定している大きな買い物（設備投資）の内容と金額を教えてください。",
      "value": null
    },
    {
      "id": "target_period",
      "label": "適用を受けたい課税期間",
      "kind": "ask",
      "ask": "いつから課税事業者になりたいですか？",
      "value": null
    },
    {
      "id": "invoice_registration_together",
      "label": "インボイス発行事業者の登録も一緒にするか",
      "kind": "ask",
      "ask": "インボイス発行事業者の登録も一緒にしますか？",
      "value": null
    }
  ],
  "wage_increase_tax_credit": [
    {
      "id": "fiscal_period",
      "label": "対象事業年度",
      "kind": "ask",
      "ask": "対象となる事業年度を教えてください。",
      "value": null
    },
    {
      "id": "salary_totals",
      "label": "前期・当期の給与総額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "employee_counts",
      "label": "従業員数（前期・当期）",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "training_expenses",
      "label": "教育訓練費の支出の有無",
      "kind": "ask",
      "ask": "従業員の研修や教育にかけた費用はありますか？",
      "value": null
    },
    {
      "id": "kurumin_certification",
      "label": "くるみん認定等の有無",
      "kind": "ask",
      "ask": "『くるみん認定』などの子育て支援の認定を受けていますか？",
      "value": null
    },
    {
      "id": "is_small_company",
      "label": "中小企業に該当するか",
      "kind": "document",
      "ask": null,
      "value": null
    }
  ],
  "group_donation_tax_treatment": [
    {
      "id": "fiscal_period",
      "label": "対象事業年度",
      "kind": "ask",
      "ask": "対象となる事業年度を教えてください。",
      "value": null
    },
    {
      "id": "donation_recipient",
      "label": "寄附（資金援助）をした相手先",
      "kind": "ask",
      "ask": "資金援助や寄附をした相手の会社を教えてください。",
      "value": null
    },
    {
      "id": "capital_relationship_percentage",
      "label": "相手先との資本関係（何%の株主か）",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "donation_amount",
      "label": "寄附の金額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "donation_reason",
      "label": "寄附の理由",
      "kind": "ask",
      "ask": "なぜその資金援助・寄附を行いましたか？",
      "value": null
    }
  ],
  "deemed_dividend_calculation": [
    {
      "id": "transaction_type",
      "label": "対象となる取引の種類（自己株式の取得・資本の払戻し等）",
      "kind": "ask",
      "ask": "どんな取引ですか？（自己株式の買取り、資本の払い戻しなど）",
      "value": null
    },
    {
      "id": "transaction_date",
      "label": "対象事業年度・取引日",
      "kind": "ask",
      "ask": "その取引を行った（行う予定の）日を教えてください。",
      "value": null
    },
    {
      "id": "company_capital_and_retained_earnings",
      "label": "発行法人の資本金等の額・利益積立金額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "shareholder_info",
      "label": "対象株主の持株数・取得費",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "payment_amount",
      "label": "交付する金銭等の金額",
      "kind": "ask",
      "ask": "株主に支払う（支払われる）金額を教えてください。",
      "value": null
    }
  ],
  "corporate_reorganization_qualification": [
    {
      "id": "reorganization_type",
      "label": "再編の種類（合併・会社分割・株式交換等）",
      "kind": "ask",
      "ask": "検討している組織再編は、合併・会社分割・株式交換のどれですか？",
      "value": null
    },
    {
      "id": "capital_relationship",
      "label": "関係する会社の資本関係",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "consideration_type",
      "label": "再編の対価（株式のみか、金銭を含むか）",
      "kind": "ask",
      "ask": "再編の対価は株式だけですか？現金も含まれますか？",
      "value": null
    },
    {
      "id": "business_continuation_plan",
      "label": "再編後も同じ事業を続ける予定か",
      "kind": "ask",
      "ask": "再編後も、今の事業をそのまま続ける予定ですか？",
      "value": null
    },
    {
      "id": "employee_continuation_plan",
      "label": "再編後も従業員は引き続き働く予定か",
      "kind": "ask",
      "ask": "再編後、今の従業員はそのまま働き続けますか？",
      "value": null
    }
  ],
  "consolidated_to_group_transition": [
    {
      "id": "prior_consolidated_group",
      "label": "移行前の連結納税グループの構成法人",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "consolidated_loss_total",
      "label": "連結欠損金の総額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "capital_relationship_change",
      "label": "各法人の資本関係の変動有無",
      "kind": "ask",
      "ask": "移行にあたって、グループ会社の資本関係に変更はありましたか？",
      "value": null
    },
    {
      "id": "transition_timing",
      "label": "移行時期",
      "kind": "ask",
      "ask": "グループ通算制度への移行はいつからですか？",
      "value": null
    },
    {
      "id": "financial_statements_each",
      "label": "各社の決算書",
      "kind": "document",
      "ask": null,
      "value": null
    }
  ],
  "transfer_pricing_taxation": [
    {
      "id": "fiscal_period",
      "label": "対象事業年度",
      "kind": "ask",
      "ask": "対象となる事業年度を教えてください。",
      "value": null
    },
    {
      "id": "foreign_related_parties",
      "label": "国外関連者の一覧（会社名・所在国・資本関係）",
      "kind": "ask",
      "ask": "海外の関連会社は、どこの国にどんな資本関係でありますか？",
      "value": null
    },
    {
      "id": "transaction_types",
      "label": "国外関連者との取引の種類",
      "kind": "ask",
      "ask": "海外の関連会社とは、どんな取引（商品の売買、サービス提供、使用料など）をしていますか？",
      "value": null
    },
    {
      "id": "transaction_amount",
      "label": "取引金額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "prior_audit_issue",
      "label": "過去に税務調査で移転価格が問題になったことがあるか",
      "kind": "ask",
      "ask": "過去の税務調査で、海外取引の価格について指摘を受けたことはありますか？",
      "value": null
    }
  ],
  "overseas_asset_report": [
    {
      "id": "target_year",
      "label": "対象年分",
      "kind": "ask",
      "ask": "何年分の調書についてですか？",
      "value": null
    },
    {
      "id": "overseas_asset_types",
      "label": "海外に持っている財産の種類",
      "kind": "ask",
      "ask": "海外にお持ちの財産の種類を教えてください（不動産、預金、株式など）。",
      "value": null
    },
    {
      "id": "asset_valuations",
      "label": "各財産の評価額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "overseas_remittance",
      "label": "海外への送金・海外からの受領の有無",
      "kind": "ask",
      "ask": "今年、海外への送金や海外からの受け取りはありましたか？",
      "value": null
    },
    {
      "id": "remittance_amount",
      "label": "送金・受領の金額",
      "kind": "document",
      "ask": null,
      "value": null
    }
  ],
  "foreign_tax_credit": [
    {
      "id": "target_period",
      "label": "対象年分（事業年度）",
      "kind": "ask",
      "ask": "何年分（どの事業年度）の申告ですか？",
      "value": null
    },
    {
      "id": "overseas_income",
      "label": "海外で得た所得の種類・金額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "overseas_tax_paid",
      "label": "海外で納めた税額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "domestic_income_total",
      "label": "国内の所得の合計額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "carryforward_limit",
      "label": "前年以前からの繰越限度超過額・余裕額の有無",
      "kind": "ask",
      "ask": "去年以前から繰り越している外国税額控除の枠はありますか？",
      "value": null
    }
  ],
  "cfc_taxation": [
    {
      "id": "fiscal_period",
      "label": "対象事業年度",
      "kind": "ask",
      "ask": "対象となる事業年度を教えてください。",
      "value": null
    },
    {
      "id": "foreign_related_company",
      "label": "外国関係会社の名称・所在国",
      "kind": "ask",
      "ask": "海外の子会社の名前と、どこの国にあるか教えてください。",
      "value": null
    },
    {
      "id": "shareholding_ratio",
      "label": "持株割合（議決権割合）",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "foreign_financials",
      "label": "外国関係会社の決算書",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "has_local_office_staff",
      "label": "実際に事務所を持ち従業員が働いているか",
      "kind": "ask",
      "ask": "その海外の会社には、実際に事務所があり、従業員が働いていますか？",
      "value": null
    }
  ],
  "excessive_interest_payment_restriction": [
    {
      "id": "fiscal_period",
      "label": "対象事業年度",
      "kind": "ask",
      "ask": "対象となる事業年度を教えてください。",
      "value": null
    },
    {
      "id": "interest_paid_total",
      "label": "支払利子の総額・支払先",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "is_foreign_related_lender",
      "label": "支払先は国外関連者か",
      "kind": "ask",
      "ask": "利子を支払っている相手は、海外の関連会社ですか？",
      "value": null
    },
    {
      "id": "interest_received",
      "label": "受取利子等の額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "income_and_depreciation",
      "label": "当期の所得金額・減価償却費等",
      "kind": "document",
      "ask": null,
      "value": null
    }
  ],
  "stamp_duty_registration_tax": [
    {
      "id": "document_or_registration_type",
      "label": "契約書・登記の種類",
      "kind": "ask",
      "ask": "印紙税・登録免許税を知りたいのは、どんな契約書や登記ですか？",
      "value": null
    },
    {
      "id": "contract_amount_or_valuation",
      "label": "契約金額・不動産の評価額等",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "paper_or_electronic",
      "label": "紙の契約書か電子契約か",
      "kind": "ask",
      "ask": "紙の契約書ですか、電子契約（PDF等）ですか？",
      "value": null
    },
    {
      "id": "is_residential_property",
      "label": "住宅用の不動産か",
      "kind": "ask",
      "ask": "対象の不動産は、住宅として使うものですか？",
      "value": null
    },
    {
      "id": "document_category_determination",
      "label": "課税文書の号別判定",
      "kind": "we_determine",
      "ask": null,
      "value": null
    }
  ],
  "group_corporate_tax_system": [
    {
      "id": "fiscal_period",
      "label": "対象事業年度",
      "kind": "ask",
      "ask": "対象となる事業年度を教えてください。",
      "value": null
    },
    {
      "id": "group_capital_relationship",
      "label": "グループ会社の資本関係",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "intragroup_transfer_or_donation",
      "label": "グループ内で行った資産の譲渡・寄附の内容",
      "kind": "ask",
      "ask": "グループ会社の間で、資産の譲渡や寄附はありましたか？内容を教えてください。",
      "value": null
    },
    {
      "id": "transferred_asset_amount",
      "label": "譲渡した資産の金額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "group_exit_this_period",
      "label": "今期、グループから離脱した会社の有無",
      "kind": "ask",
      "ask": "今期、グループから外れた会社はありますか？",
      "value": null
    }
  ],
  "group_taxation_return": [
    {
      "id": "fiscal_period",
      "label": "事業年度（開始日・終了日）",
      "kind": "ask",
      "ask": "今回の決算期間を教えてください。",
      "value": null
    },
    {
      "id": "group_company_list",
      "label": "グループ内の法人数・名称",
      "kind": "ask",
      "ask": "通算グループに入っている会社は何社ありますか？",
      "value": null
    },
    {
      "id": "capital_relationship",
      "label": "各社の資本関係（持株比率）",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "financial_statements_each",
      "label": "各社の決算書",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "group_change_this_period",
      "label": "今期、グループへの加入・離脱があったか",
      "kind": "ask",
      "ask": "今期、新しくグループに入った会社や、抜けた会社はありますか？",
      "value": null
    },
    {
      "id": "parent_company",
      "label": "通算親法人はどの会社か",
      "kind": "ask",
      "ask": "グループの中心（通算親法人）はどの会社ですか？",
      "value": null
    }
  ],
  "interim_provisional_tax_return": [
    {
      "id": "fiscal_period",
      "label": "対象事業年度",
      "kind": "ask",
      "ask": "対象となる事業年度を教えてください。",
      "value": null
    },
    {
      "id": "prior_period_tax_amount",
      "label": "前期の確定税額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "provisional_settlement_or_estimate",
      "label": "仮決算を組みたいか、前期実績でよいか",
      "kind": "ask",
      "ask": "期の途中で仮決算を組みますか？それとも前期の実績を使いますか？",
      "value": null
    },
    {
      "id": "mid_year_performance_change",
      "label": "期中の業績の増減",
      "kind": "ask",
      "ask": "期の前半、業績は前期と比べて大きく変わりましたか？",
      "value": null
    },
    {
      "id": "payment_account",
      "label": "納税に使う口座",
      "kind": "ask",
      "ask": "納税に使う口座を教えてください。",
      "value": null
    }
  ],
  "consumption_tax_refund": [
    {
      "id": "target_period",
      "label": "対象課税期間",
      "kind": "ask",
      "ask": "対象となる申告期間を教えてください。",
      "value": null
    },
    {
      "id": "refund_reason",
      "label": "還付が見込まれる理由",
      "kind": "ask",
      "ask": "なぜ還付になりそうですか？（大きな設備投資、輸出取引など）",
      "value": null
    },
    {
      "id": "taxable_sales_purchases",
      "label": "課税売上高・課税仕入高",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "export_documents",
      "label": "輸出取引がある場合の証明書類",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "high_value_asset_acquired",
      "label": "高額な資産を取得したか",
      "kind": "ask",
      "ask": "とても高額な資産を買いましたか？",
      "value": null
    },
    {
      "id": "refund_account",
      "label": "還付金の受取口座",
      "kind": "ask",
      "ask": "還付金の受取口座を教えてください。",
      "value": null
    }
  ],
  "loss_carryforward_management": [
    {
      "id": "fiscal_period",
      "label": "対象事業年度",
      "kind": "ask",
      "ask": "対象となる事業年度を教えてください。",
      "value": null
    },
    {
      "id": "past_losses",
      "label": "過去の欠損金の発生年度・金額",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "current_income",
      "label": "当期の所得金額（欠損金控除前）",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "is_small_company",
      "label": "中小法人に該当するか",
      "kind": "document",
      "ask": null,
      "value": null
    },
    {
      "id": "reorganization_history",
      "label": "過去に合併・会社分割等を行ったか",
      "kind": "ask",
      "ask": "過去に他の会社と合併したり、会社を分割したりしたことはありますか？",
      "value": null
    }
  ]
};
