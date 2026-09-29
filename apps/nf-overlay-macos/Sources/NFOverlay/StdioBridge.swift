// 標準入出力の JSON 1行ずつ（docs/overlay-protocol.md）。入力は裏のスレッドで読み、主スレッドへ渡す。

import Foundation
import NFOverlayCore

final class StdioBridge {
    private let onMessage: (InboundMessage) -> Void
    private let onEOF: () -> Void
    private let outLock = NSLock()

    init(onMessage: @escaping (InboundMessage) -> Void, onEOF: @escaping () -> Void) {
        self.onMessage = onMessage
        self.onEOF = onEOF
    }

    func start() {
        let thread = Thread { [onMessage, onEOF] in
            while let line = readLine(strippingNewline: true) {
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                if trimmed.isEmpty { continue }
                let msg = decodeInbound(trimmed)
                DispatchQueue.main.async { onMessage(msg) }
            }
            // Node が居なくなったら終わる（孤児の丸を残さない）
            DispatchQueue.main.async { onEOF() }
        }
        thread.name = "nf-overlay-stdin"
        thread.start()
    }

    func send(_ msg: OutboundMessage) {
        let line = encodeOutbound(msg) + "\n"
        outLock.lock()
        FileHandle.standardOutput.write(Data(line.utf8))
        outLock.unlock()
    }

    /// 人が読む診断（本文は出さない）
    func diag(_ s: String) {
        FileHandle.standardError.write(Data("[nf-overlay] \(s)\n".utf8))
    }
}
