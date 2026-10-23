/*  Quick Apply – keyboard plumbing shared by the panel, the palette and the background launcher.
    - Global "open palette" hotkey via the native helper (macOS), configured in hotkey.json.
    - registerKeyEventsInterest so Premiere hands modifier combos (Cmd+F…) to our HTML.
*/
var QAKeys = (function () {
    var fs = require("fs");
    var path = require("path");
    var os = require("os");
    var cp = require("child_process");

    var IS_MAC = os.platform() === "darwin";
    var PALETTE_ID = "com.sun.quickapply.pr.palette";
    var FOCUS_EVENT = "com.sun.quickapply.pr.focus";
    var DATA_DIR = IS_MAC ? path.join(os.homedir(), "Library/Application Support/QuickApplyPR")
                          : path.join(process.env.APPDATA || os.homedir(), "QuickApplyPR");
    var CONF = path.join(DATA_DIR, "hotkey.json");
    var PID = path.join(DATA_DIR, "helper.pid");
    var ROOT = path.dirname(decodeURI(window.location.pathname)).replace(/^\/([A-Za-z]:)/, "$1");
    var HELPER = path.join(ROOT, "helper", "qa_hotkey");

    // e.code -> macOS virtual key code (also the Carbon hotkey code).
    var MAC = {
        KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyH: 4, KeyG: 5, KeyZ: 6, KeyX: 7, KeyC: 8, KeyV: 9, KeyB: 11,
        KeyQ: 12, KeyW: 13, KeyE: 14, KeyR: 15, KeyY: 16, KeyT: 17, Digit1: 18, Digit2: 19, Digit3: 20,
        Digit4: 21, Digit6: 22, Digit5: 23, Equal: 24, Digit9: 25, Digit7: 26, Minus: 27, Digit8: 28,
        Digit0: 29, BracketRight: 30, KeyO: 31, KeyU: 32, BracketLeft: 33, KeyI: 34, KeyP: 35, KeyL: 37,
        KeyJ: 38, Quote: 39, KeyK: 40, Semicolon: 41, Backslash: 42, Comma: 43, Slash: 44, KeyN: 45,
        KeyM: 46, Period: 47, Space: 49, Backquote: 50, Enter: 36, Tab: 48, Backspace: 51, Escape: 53,
        F1: 122, F2: 120, F3: 99, F4: 118, F5: 96, F6: 97, F7: 98, F8: 100, F9: 101, F10: 109, F11: 103,
        F12: 111, ArrowLeft: 123, ArrowRight: 124, ArrowDown: 125, ArrowUp: 126
    };
    // e.code -> Windows virtual key code.
    function winCode(code) {
        var m;
        if ((m = /^Key([A-Z])$/.exec(code))) return m[1].charCodeAt(0);
        if ((m = /^Digit(\d)$/.exec(code))) return 48 + +m[1];
        if ((m = /^F(\d+)$/.exec(code))) return 111 + +m[1];
        return { Space: 32, Enter: 13, Tab: 9, Backspace: 8, Escape: 27, ArrowLeft: 37, ArrowUp: 38,
            ArrowRight: 39, ArrowDown: 40, Semicolon: 186, Equal: 187, Comma: 188, Minus: 189, Period: 190,
            Slash: 191, Backquote: 192, BracketLeft: 219, Backslash: 220, BracketRight: 221, Quote: 222 }[code];
    }
    function nativeCode(code) { return IS_MAC ? MAC[code] : winCode(code); }

    // ---------- Key interest ----------
    // all = every combo that has Ctrl/Cmd/Alt; codes = extra e.code combos given as {code, ctrl, meta, alt, shift}.
    function registerInterest(all, combos) {
        var list = [];
        var plain = ["Enter", "Escape", "ArrowUp", "ArrowDown", "Tab", "Backspace"];
        plain.forEach(function (c) { list.push({ keyCode: nativeCode(c) }); });
        if (all) {
            Object.keys(MAC).forEach(function (code) {
                var kc = nativeCode(code);
                if (kc === undefined) return;
                for (var m = 0; m < 16; m++) {
                    var e = { keyCode: kc, ctrlKey: !!(m & 1), metaKey: !!(m & 2), altKey: !!(m & 4), shiftKey: !!(m & 8) };
                    if (e.ctrlKey || e.metaKey || e.altKey || /^F\d/.test(code)) list.push(e);
                }
            });
        }
        (combos || []).forEach(function (c) {
            var kc = nativeCode(c.code);
            if (kc !== undefined) list.push({ keyCode: kc, ctrlKey: !!c.ctrl, metaKey: !!c.meta, altKey: !!c.alt, shiftKey: !!c.shift });
        });
        try { window.__adobe_cep__.registerKeyEventsInterest(JSON.stringify(list)); } catch (e) {}
    }

    // ---------- Global hotkey ----------
    function readConf() {
        try { return JSON.parse(fs.readFileSync(CONF, "utf8")); } catch (e) {
            return { combo: "Cmd+F", code: "KeyF", meta: true }; // default
        }
    }

    // Carbon modifier flags: cmd 256, shift 512, option 2048, control 4096.
    function carbonMods(c) { return (c.meta ? 256 : 0) | (c.shift ? 512 : 0) | (c.alt ? 2048 : 0) | (c.ctrl ? 4096 : 0); }

    function alive(pid) { try { process.kill(pid, 0); return true; } catch (e) { return false; } }
    function helperPid() { try { return parseInt(fs.readFileSync(PID, "utf8"), 10) || 0; } catch (e) { return 0; } }

    var child = null;

    function openPalette() {
        try { window.__adobe_cep__.requestOpenExtension(PALETTE_ID, ""); } catch (e) {}
        try {
            window.__adobe_cep__.dispatchEvent({ type: FOCUS_EVENT, scope: "APPLICATION", appId: "", extensionId: "", data: "" });
        } catch (e2) {}
    }

    // Start the helper unless one is already running (owned by another of our extensions).
    function ensure() {
        if (!IS_MAC || child) return;
        var pid = helperPid();
        if (pid && alive(pid)) return;
        if (!fs.existsSync(HELPER)) return;
        var c = readConf();
        var kc = MAC[c.code];
        if (kc === undefined) return;
        try { fs.chmodSync(HELPER, 493); } catch (e) {}
        try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
        child = cp.spawn(HELPER, [String(kc), String(carbonMods(c))], { stdio: ["pipe", "pipe", "ignore"] });
        fs.writeFileSync(PID, String(child.pid));
        child.stdout.on("data", function (d) { if (String(d).indexOf("open") >= 0) openPalette(); });
        child.on("exit", function () { child = null; });
        child.on("error", function () { child = null; });
    }

    function restart() {
        var pid = helperPid();
        if (pid && alive(pid)) { try { process.kill(pid); } catch (e) {} }
        if (child) { try { child.kill(); } catch (e) {} child = null; }
        try { fs.unlinkSync(PID); } catch (e) {}
        setTimeout(ensure, 200);
    }

    function setHotkey(c) {
        try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
        fs.writeFileSync(CONF, JSON.stringify(c));
        restart();
    }

    return {
        IS_MAC: IS_MAC, FOCUS_EVENT: FOCUS_EVENT, PALETTE_ID: PALETTE_ID,
        registerInterest: registerInterest, readConf: readConf, setHotkey: setHotkey,
        ensure: ensure, restart: restart, openPalette: openPalette
    };
})();
