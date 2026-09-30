// FF 先読み（Mac）— 全体キー。Carbon の RegisterEventHotKey（アクセシビリティの許可が要らない・キーの中身を読まない）。
// 登録したキーの組み合わせが押されたときだけ呼ばれる。ほかのキー入力は見ない（キーロガーにしない）。

import Carbon.HIToolbox
import Foundation
import NFOverlayCore

private let signature: OSType = 0x4E46_4646 // 'NFFF'

private func actionID(_ a: FfAction) -> UInt32 {
    switch a {
    case .trigger: 1
    case .adopt: 2
    case .close: 3
    }
}

private func actionOf(_ id: UInt32) -> FfAction? {
    switch id {
    case 1: .trigger
    case 2: .adopt
    case 3: .close
    default: nil
    }
}

@MainActor
final class FfHotKeys {
    /// キーを受けた（単調時計の秒: ProcessInfo.systemUptime）
    var onKey: ((FfAction, TimeInterval) -> Void)?
    private var refs: [FfAction: EventHotKeyRef] = [:]
    private var handler: EventHandlerRef?

    init() {
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let me = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(GetApplicationEventTarget(), { _, event, user in
            let at = ProcessInfo.processInfo.systemUptime
            guard let event, let user else { return OSStatus(eventNotHandledErr) }
            var hk = EventHotKeyID()
            let st = GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                                       nil, MemoryLayout<EventHotKeyID>.size, nil, &hk)
            guard st == noErr, hk.signature == signature, let action = actionOf(hk.id) else { return OSStatus(eventNotHandledErr) }
            let me = Unmanaged<FfHotKeys>.fromOpaque(user).takeUnretainedValue()
            MainActor.assumeIsolated { me.onKey?(action, at) }
            return noErr
        }, 1, &spec, me, &handler)
    }

    /// 今登録しておくべきキーだけにそろえる。登録できなかったもの（他のアプリが先に取っている・Mac に無いキー）を返す。
    func sync(actions: [FfAction], config: FfConfig) -> [FfAction] {
        var failed: [FfAction] = []
        for (a, ref) in refs where !actions.contains(a) {
            UnregisterEventHotKey(ref)
            refs[a] = nil
        }
        for a in actions where refs[a] == nil {
            guard let chord = config.keys[a.rawValue], let hk = carbonHotKey(chord) else {
                failed.append(a)
                continue
            }
            var ref: EventHotKeyRef?
            let st = RegisterEventHotKey(hk.keyCode, hk.modifiers, EventHotKeyID(signature: signature, id: actionID(a)),
                                         GetApplicationEventTarget(), 0, &ref)
            if st == noErr, let ref { refs[a] = ref } else { failed.append(a) }
        }
        return failed
    }

    /// キーの組み合わせが変わったとき（ff-config の送り直し）は一度すべて外す
    func unregisterAll() {
        for (_, ref) in refs { UnregisterEventHotKey(ref) }
        refs.removeAll()
    }
}
