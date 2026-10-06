// v7 [OP-09c] 道筋の欄の鍵を macOS のキーチェーンに置く（SecItem・汎用パスワード）。
// サービス jp.neurafusion.trace・アカウント＝会社の名前（Node 側 src/trace/keychain.ts の security と同じ項目）。
// 鍵の値はログ・画面・ファイルに出さない。エラーは OSStatus の番号だけ。

import Foundation
import NFOverlayCore
import Security

final class KeychainTraceStore: TraceSecretStore {
    private func query(_ provider: TraceProvider) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: traceKeychainService,
            kSecAttrAccount as String: provider.rawValue,
        ]
    }

    func get(_ provider: TraceProvider) -> String? {
        var q = query(provider)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func set(_ provider: TraceProvider, _ secret: String) throws {
        guard isValidTraceSecret(secret) else { throw TraceKeyError.badSecret }
        let data = Data(secret.utf8)
        let status = SecItemUpdate(query(provider) as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var add = query(provider)
            add[kSecValueData as String] = data
            add[kSecAttrLabel as String] = "NeuraFusion 道筋"
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            let s = SecItemAdd(add as CFDictionary, nil)
            if s != errSecSuccess { throw TraceKeyError.keychain(s) }
        } else if status != errSecSuccess {
            throw TraceKeyError.keychain(status)
        }
    }

    func delete(_ provider: TraceProvider) {
        SecItemDelete(query(provider) as CFDictionary)
    }
}
