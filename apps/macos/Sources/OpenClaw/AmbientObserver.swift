import AppKit
import Foundation
import Observation

// =============================================================================
// AmbientObserver — 常時観測（FABLE5 F2-12 / OC-15）
//
// ★プライバシー原則（このコメントブロックは削除・緩和禁止。nf-policy.js と同じ線）★
//  1. 既定OFF。ユーザーがメニューから入れるまで、購読もキャプチャも一切走らない。
//  2. 生テキストは端末外に出さない。QuickChatFocusedTextCaptureService が読んだ
//     フォーカス中テキストはこのプロセスのメモリ内でだけ照合し、ログにも
//     UserDefaults にも通知本文にも書かない。外に出てよいのは patternId・分野・○×のみ。
//  3. patternId 化のみ。照合は端末内の正規表現で行い、結果は patternId という
//     記号に落ちる。テキスト断片を patternId に含めない。
//  4. 1時間3件まで。3回続けて流された分野は自分で止まる（再開は本人の手のみ）。
//  5. 権限を裏で要求しない。アクセシビリティ権限が未付与なら黙って何もしない
//     （interactive なプロンプトは Quick Chat 側のユーザー操作だけが出す）。
// =============================================================================

/// nf-policy.js の decide() の reason と同じ語彙（ログ・デバッグで揃える）。
enum AmbientDecisionReason: String, Sendable {
    case none
    case off
    case quiet
    case categoryOff = "category-off"
    case autoDisabled = "auto-disabled"
    case rateLimited = "rate-limited"
    case underPrice = "under-price"
    case ok
}

/// 端末内照合の結果。生テキストは持たない（patternId と分野だけ）。
struct AmbientDetection: Sendable {
    let patternId: String
    let category: String
    /// 値段が取れた場合のみ（買いもの見立て）。native では当面 nil。
    let price: Int?
}

/// nf-policy.js の state と同形。UserDefaults(AppDefaults.standard) に JSON で保存。
struct AmbientPolicy: Codable, Sendable {
    static let categories = ["academic", "beverage", "highvalue", "daily"]

    var enabled: Bool
    var categories: [String: Bool]
    var priceThreshold: Int
    var quietUntil: TimeInterval // epoch 秒。0 = なし
    var shownAt: [TimeInterval] // 直近1時間に出した時刻
    var ignoreStreak: [String: Int]
    var autoDisabled: [String: Bool]

    /// 既定値: nf-policy.js defaults() と同じ。全体 enabled が false なので何も出ない。
    static func defaults() -> AmbientPolicy {
        AmbientPolicy(
            enabled: false,
            categories: ["academic": false, "beverage": false, "highvalue": true, "daily": true],
            priceThreshold: 3000,
            quietUntil: 0,
            shownAt: [],
            ignoreStreak: Self.categories.reduce(into: [:]) { $0[$1] = 0 },
            autoDisabled: Self.categories.reduce(into: [:]) { $0[$1] = false })
    }

    /// 保存から読んだものの欠けを既定で埋める（nf-policy.js normalizeState と同義）。
    static func normalized(_ raw: AmbientPolicy?) -> AmbientPolicy {
        guard var s = raw else { return Self.defaults() }
        let d = Self.defaults()
        for c in Self.categories {
            if s.categories[c] == nil { s.categories[c] = d.categories[c] }
            if s.ignoreStreak[c] == nil { s.ignoreStreak[c] = 0 }
            if s.autoDisabled[c] == nil { s.autoDisabled[c] = false }
        }
        if s.priceThreshold < 0 { s.priceThreshold = d.priceThreshold }
        return s
    }
}

@MainActor
@Observable
final class AmbientObserver {
    static let shared = AmbientObserver()

    static let hourSeconds: TimeInterval = 60 * 60
    static let maxPerHour = 3 // 1時間に出す上限
    static let ignoreLimit = 3 // 続けてこの回数流されたら、その分野は自分で止まる
    static let debounceSeconds: Double = 2.0 // アプリ切替のデバウンス
    static let acceptGraceSeconds: Double = 600 // この秒数内に反応が無ければ「流した」扱い
    private static let defaultsKey = "nf.ambientObserver.policy.v1"

    /// メニューと目アイコンのバッジが観測する唯一の真実源（第6条）。
    private(set) var isEnabled = false

    private var policy: AmbientPolicy = .defaults()
    private var activationObserver: NSObjectProtocol?
    private var debounceTask: Task<Void, Never>?
    /// patternId → 「流した」判定までの猶予タスク
    private var pendingIgnores: [String: Task<Void, Never>] = [:]
    private let notifications = NotificationManager()

    // 端末内照合パターン（見本）。実テーブルは Webリポ _docs/nf_ambient_patterns.json を
    // 次段で変換して差し替える。ここに生テキストのサンプルは書かない。
    private static let patterns: [(patternId: String, category: String, regex: String)] = [
        ("sample_academic_doi", "academic", #"doi\.org/|arxiv\.org/"#),
        ("sample_highvalue_estimate", "highvalue", #"(お見積|御見積|見積書|契約書ドラフト)"#),
        ("sample_daily_errand", "daily", #"(買い物リスト|やることリスト)"#),
    ]

    private init() {}

    // MARK: - ライフサイクル

    /// 起動時に MenuBar.swift から一度だけ呼ぶ。既定OFFなので、保存済みポリシーが
    /// enabled=true のときだけ購読を張る。
    func start() {
        self.policy = Self.loadPolicy()
        self.isEnabled = self.policy.enabled
        if self.policy.enabled {
            self.subscribe()
        }
    }

    func toggle() {
        self.setEnabled(!self.isEnabled)
    }

    func setEnabled(_ enabled: Bool) {
        guard enabled != self.policy.enabled else { return }
        self.policy.enabled = enabled
        self.isEnabled = enabled
        self.savePolicy()
        if enabled {
            self.subscribe()
        } else {
            self.unsubscribe()
        }
    }

    /// 「今日は静かに」（次の0時まで）。将来のメニュー項目用。nf-policy startQuiet と同義。
    func startQuiet(now: Date = Date()) {
        var midnight = Calendar.current.startOfDay(for: now)
        midnight.addTimeInterval(24 * 60 * 60)
        self.policy.quietUntil = midnight.timeIntervalSince1970
        self.savePolicy()
    }

    /// 自分で止まった分野を本人の手で戻す（nf-policy reenable と同義）。
    func reenable(category: String) {
        guard AmbientPolicy.categories.contains(category) else { return }
        self.policy.autoDisabled[category] = false
        self.policy.ignoreStreak[category] = 0
        self.policy.categories[category] = true
        self.savePolicy()
    }

    /// 通知クリック配線（次段）から呼ぶ受け口。猶予内に呼ばれたら accept。
    func markAccepted(patternId: String, category: String) {
        self.pendingIgnores.removeValue(forKey: patternId)?.cancel()
        self.recordOutcome(category: category, accepted: true)
    }

    // MARK: - 購読とデバウンス

    private func subscribe() {
        guard self.activationObserver == nil else { return }
        self.activationObserver = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main)
        { [weak self] note in
            // queue: .main 指定なのでメインスレッドで届く。Swift 6 の @Sendable 検査は
            // assumeIsolated で通す（コンパイルエラーになる場合の代替は 1-1 末尾の注記）。
            let bundleID = (note.userInfo?[NSWorkspace.applicationUserInfoKey]
                as? NSRunningApplication)?.bundleIdentifier
            MainActor.assumeIsolated {
                self?.scheduleEvaluation(activatedBundleID: bundleID)
            }
        }
    }

    private func unsubscribe() {
        if let token = self.activationObserver {
            NSWorkspace.shared.notificationCenter.removeObserver(token)
            self.activationObserver = nil
        }
        self.debounceTask?.cancel()
        self.debounceTask = nil
    }

    private func scheduleEvaluation(activatedBundleID: String?) {
        // 自分自身（OpenClaw）への切替は観測しない。
        if let activatedBundleID, activatedBundleID == Bundle.main.bundleIdentifier { return }
        self.debounceTask?.cancel()
        self.debounceTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(Self.debounceSeconds))
            guard !Task.isCancelled else { return }
            await self?.evaluateFrontmost()
        }
    }

    // MARK: - キャプチャと判定

    private func evaluateFrontmost() async {
        guard self.policy.enabled else { return }

        // 権限が無ければ黙って帰る。capture() は未付与時に自前アラートを出すため、
        // 常時観測からは grantedStatus 確認済みのときしか呼ばない（原則5）。
        let granted = await PermissionManager.grantedStatus([.accessibility])[.accessibility] == true
        guard granted else { return }

        let outcome = await QuickChatFocusedTextCaptureService.capture()
        guard case let .captured(context) = outcome else { return } // 失敗は静かに捨てる（第5条: 出さない側に倒す）

        // 端末内照合。context.text はこの関数のスコープを出ない（原則2・3）。
        guard let detection = Self.detect(in: context.text) else { return }

        let now = Date().timeIntervalSince1970
        let decision = self.decide(detection: detection, now: now)
        guard decision == .ok else { return }

        self.policy.shownAt.append(now)
        self.pruneShown(now: now)
        self.savePolicy()
        await self.notify(detection: detection)
        self.armIgnoreTimer(detection: detection)
    }

    private static func detect(in text: String) -> AmbientDetection? {
        for p in Self.patterns {
            if text.range(of: p.regex, options: .regularExpression) != nil {
                return AmbientDetection(patternId: p.patternId, category: p.category, price: nil)
            }
        }
        return nil
    }

    /// nf-policy.js decide() の Swift 版。順序も同じ。
    private func decide(detection: AmbientDetection, now: TimeInterval) -> AmbientDecisionReason {
        guard self.policy.enabled else { return .off }
        if self.policy.quietUntil > 0, now < self.policy.quietUntil { return .quiet }
        guard self.policy.categories[detection.category] == true else { return .categoryOff }
        if self.policy.autoDisabled[detection.category] == true { return .autoDisabled }
        self.pruneShown(now: now)
        if self.policy.shownAt.count >= Self.maxPerHour { return .rateLimited }
        if let price = detection.price, price < self.policy.priceThreshold { return .underPrice }
        return .ok
    }

    private func pruneShown(now: TimeInterval) {
        self.policy.shownAt = self.policy.shownAt.filter { now - $0 < Self.hourSeconds }
    }

    // MARK: - 通知と○×

    private func notify(detection: AmbientDetection) async {
        // 通知本文に生テキストを入れない（原則2）。patternId と分野だけ。
        _ = await self.notifications.send(
            title: String(localized: "NeuraFusion"),
            body: String(
                format: String(localized: "Noticed a pattern (%@ / %@). Open the menu bar eye to act or mute."),
                detection.patternId,
                detection.category),
            sound: nil,
            priority: .passive,
            identifier: "nf-ambient-\(detection.patternId)",
            requestPermission: false) // 裏で権限を要求しない（原則5）
    }

    private func armIgnoreTimer(detection: AmbientDetection) {
        self.pendingIgnores[detection.patternId]?.cancel()
        self.pendingIgnores[detection.patternId] = Task { [weak self] in
            try? await Task.sleep(for: .seconds(Self.acceptGraceSeconds))
            guard !Task.isCancelled else { return }
            guard let self else { return }
            self.pendingIgnores.removeValue(forKey: detection.patternId)
            self.recordOutcome(category: detection.category, accepted: false)
        }
    }

    /// nf-policy.js recordOutcome と同義。accept で streak リセット、
    /// 流し（dismiss/ignore）3連続でその分野は autoDisabled。
    private func recordOutcome(category: String, accepted: Bool) {
        guard AmbientPolicy.categories.contains(category) else { return }
        if accepted {
            self.policy.ignoreStreak[category] = 0
        } else {
            let streak = (self.policy.ignoreStreak[category] ?? 0) + 1
            self.policy.ignoreStreak[category] = streak
            if streak >= Self.ignoreLimit {
                self.policy.autoDisabled[category] = true
            }
        }
        self.savePolicy()
    }

    // MARK: - 保存

    private static func loadPolicy() -> AmbientPolicy {
        guard let data = AppDefaults.standard.data(forKey: Self.defaultsKey),
              let decoded = try? JSONDecoder().decode(AmbientPolicy.self, from: data)
        else { return .defaults() }
        return AmbientPolicy.normalized(decoded)
    }

    private func savePolicy() {
        guard let data = try? JSONEncoder().encode(self.policy) else { return }
        AppDefaults.standard.set(data, forKey: Self.defaultsKey)
    }
}
