// Quick Apply hotkey helper (macOS).
// Usage: qa_hotkey <carbonKeyCode> <carbonModifiers>
// Registers a global hotkey only while Premiere Pro is the frontmost app and prints "open"
// on stdout each time it is pressed. Exits when its parent closes stdin.
import Cocoa
import Carbon

let args = CommandLine.arguments
guard args.count >= 3, let keyCode = UInt32(args[1]), let mods = UInt32(args[2]) else {
    FileHandle.standardError.write("usage: qa_hotkey <keyCode> <modifiers>\n".data(using: .utf8)!)
    exit(1)
}

var hotKeyRef: EventHotKeyRef?
let hotKeyID = EventHotKeyID(signature: OSType(0x51415052), id: 1) // 'QAPR'

func setRegistered(_ on: Bool) {
    if on && hotKeyRef == nil {
        RegisterEventHotKey(keyCode, mods, hotKeyID, GetApplicationEventTarget(), 0, &hotKeyRef)
    } else if !on, let ref = hotKeyRef {
        UnregisterEventHotKey(ref)
        hotKeyRef = nil
    }
}

func isPremiere(_ app: NSRunningApplication?) -> Bool {
    return app?.bundleIdentifier?.hasPrefix("com.adobe.PremierePro") ?? false
}

var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
InstallEventHandler(GetApplicationEventTarget(), { _, _, _ in
    print("open")
    fflush(stdout)
    return noErr
}, 1, &spec, nil, nil)

// Only hold the hotkey while Premiere is in front, so the same keys still work in other apps.
NSWorkspace.shared.notificationCenter.addObserver(
    forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
) { note in
    let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
    setRegistered(isPremiere(app))
}
setRegistered(isPremiere(NSWorkspace.shared.frontmostApplication))

// Quit with the panel that started us.
FileHandle.standardInput.readabilityHandler = { h in
    if h.availableData.isEmpty { exit(0) }
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
app.run()
