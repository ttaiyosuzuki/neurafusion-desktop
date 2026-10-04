// NF 右下の丸 — 読んだ要素の出どころ（origin）を決める規則（FY-16 (4)・FX-31／FX-34 の取り先）。
// 本人が送った発話＝self_input、AI の返事＝ai_output だけを渡し、それ以外は渡さない。
// 各 OS のネイティブ側は役割・識別子などの手がかりを渡すだけで、決めるのはここ 1 か所。

export type ElementOrigin = "self_input" | "ai_output";
