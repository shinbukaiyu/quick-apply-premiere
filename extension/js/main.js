/*  Quick Apply (Premiere Pro) – panel side.
    Search-everything palette (like After Effects' Quick Apply) with user-assigned shortcuts.
*/
(function () {
    var fs = require("fs");
    var path = require("path");
    var os = require("os");

    var IS_MAC = os.platform() === "darwin";
    // The same page runs as the dockable panel and as the floating palette opened by the hotkey.
    var IS_PALETTE = false;
    try { IS_PALETTE = window.__adobe_cep__.getExtensionId() === QAKeys.PALETTE_ID; } catch (e) {}
    var MAX_ROWS = 300;
    var REFRESH_MS = 5000;
    var $ = function (id) { return document.getElementById(id); };

    var CATS = [
        ["cmd",  "Commands"],
        ["fx",   "Video effects"],
        ["afx",  "Audio effects"],
        ["tr",   "Video transitions"],
        ["atr",  "Audio transitions"],
        ["seq",  "Sequences"],
        ["item", "Project items (clips, bins)"],
        ["js",   "Scripts (.jsx / .jsxbin)"],
        ["mg",   "Motion Graphics Templates (.mogrt)"],
        ["ext",  "Extensions (Window › Extensions)"]
    ];
    var HOST_CATS = { cmd: 1, fx: 1, afx: 1, tr: 1, atr: 1, seq: 1, item: 1 };
    var ICONS = {
        cmd:  '<path d="M4 7h16M4 12h16M4 17h16"/>',
        fx:   '<path d="M5 19L19 5M7 5h4M5 7v4M15 19h4M19 15v4"/>',
        afx:  '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>',
        tr:   '<path d="M4 5h7v14H4zM13 5h7v14h-7z"/><path d="M11 12h2"/>',
        atr:  '<path d="M3 17C8 17 9 7 21 7M3 7c5 0 6 10 18 10"/>',
        seq:  '<path d="M3 6h18v12H3zM3 10h18M8 6v4M14 6v4"/>',
        item: '<path d="M4 5h16v14H4zM10 9l5 3-5 3z"/>',
        bin:  '<path d="M3 6h6l2 2h10v11H3z"/>',
        js:   '<path d="M8 6l-5 6 5 6M16 6l5 6-5 6"/>',
        mg:   '<path d="M4 6h16M4 12h10M4 18h6"/><path d="M17 15l4 3-4 3z"/>',
        ext:  '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4z"/><path d="M16.5 14v6M13.5 17h6"/>'
    };

    // ---------- Storage ----------
    function load(key, def) {
        try { var v = localStorage.getItem("qapr." + key); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
    }
    function save(key, val) { try { localStorage.setItem("qapr." + key, JSON.stringify(val)); } catch (e) {} }

    function defaultMogrtDir() {
        return IS_MAC
            ? path.join(os.homedir(), "Library/Application Support/Adobe/Common/Motion Graphics Templates")
            : path.join(process.env.APPDATA || "", "Adobe/Common/Motion Graphics Templates");
    }

    var cfg = {
        cats: load("cats", { cmd: true, fx: true, afx: true, tr: true, atr: true, seq: true, item: true, js: true, mg: true }),
        scriptDirs: load("scriptDirs", ""),
        mogrtDirs: load("mogrtDirs", defaultMogrtDir()),
        transDur: load("transDur", 15),
        keepQuery: load("keepQuery", false)
    };
    // Categories added after a user's settings were saved default to on.
    CATS.forEach(function (c) { if (cfg.cats[c[0]] === undefined) cfg.cats[c[0]] = true; });
    var keys = load("keys", {});       // combo -> id
    var keyRaw = load("keyRaw", {});   // combo -> { code, ctrl, meta, alt, shift } for key-interest registration
    var names = load("keyNames", {});  // id -> display name (so the settings list survives a reindex)
    var usage = load("usage", {});     // id -> { n, t }

    // ---------- Host bridge ----------
    function evalHost(code) {
        return new Promise(function (resolve) {
            window.__adobe_cep__.evalScript(code, function (res) {
                try { resolve(JSON.parse(res)); } catch (e) { resolve({ error: res || "No response" }); }
            });
        });
    }

    var msgTimer;
    function say(text, isErr) {
        var m = $("msg");
        m.textContent = text;
        m.title = text;
        m.className = isErr ? "err" : "";
        clearTimeout(msgTimer);
        msgTimer = setTimeout(function () { m.textContent = ""; }, isErr ? 6000 : 3500);
    }

    // ---------- Index ----------
    var items = [];
    var byId = {};
    var lastIndex = 0;
    var indexing = false;

    function expand(dir) {
        dir = dir.trim();
        return dir.indexOf("~") === 0 ? path.join(os.homedir(), dir.slice(1)) : dir;
    }

    function scanDir(root, re, kind, out) {
        (function walk(dir, rel, depth) {
            if (depth > 5) return;
            var list;
            try { list = fs.readdirSync(dir); } catch (e) { return; }
            list.forEach(function (f) {
                if (f.charAt(0) === ".") return;
                var full = path.join(dir, f), st;
                try { st = fs.statSync(full); } catch (e) { return; }
                if (st.isDirectory()) walk(full, rel ? rel + " > " + f : f, depth + 1);
                else if (re.test(f)) out.push({ id: kind + ":" + full, name: f, cat: kind,
                    path: (kind === "js" ? "Script" : "Template") + (rel ? " > " + rel : "") });
            });
        })(root, "", 0);
    }

    function scanLocal() {
        var out = [];
        var dirs = function (s) { return String(s || "").split(/\r?\n/).map(expand).filter(Boolean); };
        if (cfg.cats.js) dirs(cfg.scriptDirs).forEach(function (d) { scanDir(d, /\.jsx(bin)?$/i, "js", out); });
        if (cfg.cats.mg) dirs(cfg.mogrtDirs).forEach(function (d) { scanDir(d, /\.mogrt$/i, "mg", out); });
        if (cfg.cats.ext) out = out.concat(listExtensions());
        return out;
    }

    // Every CEP panel Premiere has loaded (what Window › Extensions shows), except our own windows.
    function listExtensions() {
        var list, seen = {};
        try { list = JSON.parse(window.__adobe_cep__.getExtensions(JSON.stringify([]))); } catch (e) { return []; }
        return (list || []).filter(function (x) {
            var type = String(x.windowType || "");
            if (!x.id || !x.name || /^com\.sun\.quickapply\.pr\.(palette|bg)$/.test(x.id)) return false;
            if (type && !/panel|modeless|modal/i.test(type)) return false;
            if (seen[x.name]) return false;
            return (seen[x.name] = true);
        }).map(function (x) {
            return { id: "ext:" + x.id, name: x.name, cat: "ext", path: "Window > Extensions" };
        });
    }

    function reindex(quiet) {
        if (indexing) return Promise.resolve();
        indexing = true;
        var hostCats = Object.keys(cfg.cats).filter(function (c) { return cfg.cats[c] && HOST_CATS[c]; });
        return evalHost("qa_index(" + JSON.stringify(hostCats.join(",")) + ")").then(function (res) {
            indexing = false;
            lastIndex = Date.now();
            if (res.error) { say(res.error, true); return; }
            setItems(res.items.concat(scanLocal()));
            save("cache", items.map(function (it) { return { id: it.id, name: it.name, cat: it.cat, path: it.path }; }));
            if (!quiet) say(items.length + " items indexed");
            refresh();
        });
    }

    function setItems(list) {
        items = list;
        byId = {};
        items.forEach(function (it) { it.key = norm(it.name); it.pkey = norm(it.path); byId[it.id] = it; });
    }

    // ---------- Search ----------
    function norm(s) {
        return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
    }

    // Scores one token against a string; 0 = no match.
    function scoreToken(tok, s) {
        var i = s.indexOf(tok);
        if (i === 0) return 100;
        if (i > 0) return /[\s_\-.>(]/.test(s.charAt(i - 1)) ? 80 : 60;
        // Subsequence ("gblur" -> "gaussian blur")
        var j = 0;
        for (var k = 0; k < s.length && j < tok.length; k++) if (s.charAt(k) === tok.charAt(j)) j++;
        return j === tok.length ? 20 : 0;
    }

    function usageBoost(id) {
        var u = usage[id];
        if (!u) return 0;
        var days = (Date.now() - u.t) / 86400000;
        return Math.min(40, Math.log(1 + u.n) * 12) + Math.max(0, 20 - days * 2);
    }

    function search(q) {
        var toks = norm(q).trim().split(/\s+/).filter(Boolean);
        var res = [];
        for (var i = 0; i < items.length; i++) {
            var it = items[i], total = 0, ok = true;
            for (var t = 0; t < toks.length; t++) {
                var s = scoreToken(toks[t], it.key), p = s ? 0 : scoreToken(toks[t], it.pkey) * 0.4;
                if (!s && !p) { ok = false; break; }
                total += s || p;
            }
            if (!ok) continue;
            if (toks.length && it.key === toks.join(" ")) total += 50;
            res.push({ it: it, s: total + usageBoost(it.id) - it.name.length * 0.05 });
        }
        if (!toks.length) {
            // Empty query: recently used first, then commands, then the rest alphabetically.
            res.forEach(function (r) { r.s = usageBoost(r.it.id) * 10 + (r.it.cat === "cmd" ? 5 : 0); });
        }
        res.sort(function (a, b) { return b.s - a.s || a.it.name.localeCompare(b.it.name); });
        return res.map(function (r) { return r.it; });
    }

    // ---------- List rendering ----------
    var results = [];
    var sel = 0;

    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

    function highlight(name, q) {
        var tok = norm(q).trim().split(/\s+/)[0];
        if (!tok) return esc(name);
        var i = norm(name).indexOf(tok);
        if (i < 0) return esc(name);
        return esc(name.slice(0, i)) + "<b>" + esc(name.slice(i, i + tok.length)) + "</b>" + esc(name.slice(i + tok.length));
    }

    function comboFor(id) {
        for (var c in keys) if (keys[c] === id) return c;
        return "";
    }

    function refresh() {
        var q = $("q").value;
        var keepId = results[sel] && results[sel].id;
        results = search(q);
        sel = 0;
        if (keepId && !q) {
            var k = results.findIndex(function (r) { return r.id === keepId; });
            if (k >= 0 && k < MAX_ROWS) sel = k;
        }
        render();
    }

    function render() {
        var q = $("q").value, list = $("list");
        $("count").textContent = results.length ? results.length : "";
        if (!results.length) {
            list.innerHTML = '<div class="empty">' + (items.length ? "No matches" : "Loading…") + "</div>";
            updateFoot();
            return;
        }
        var html = [];
        var n = Math.min(results.length, MAX_ROWS);
        for (var i = 0; i < n; i++) {
            var it = results[i], kb = comboFor(it.id);
            html.push('<div class="row' + (i === sel ? " sel" : "") + '" data-i="' + i + '">' +
                '<svg class="ic" viewBox="0 0 24 24">' + (ICONS[it.cat] || ICONS.cmd) + "</svg>" +
                '<span class="nm">' + highlight(it.name, q) + "</span>" +
                '<span class="pt">' + esc(it.path) + "</span>" +
                (kb ? '<span class="kb">' + esc(kb) + "</span>" : "") +
                '<button class="run" tabindex="-1">Run</button></div>');
        }
        list.innerHTML = html.join("");
        updateFoot();
    }

    function select(i) {
        var n = Math.min(results.length, MAX_ROWS);
        if (!n) return;
        sel = Math.max(0, Math.min(n - 1, i));
        var rows = $("list").children;
        for (var r = 0; r < rows.length; r++) rows[r].classList.toggle("sel", r === sel);
        if (rows[sel]) rows[sel].scrollIntoView({ block: "nearest" });
        updateFoot();
    }

    function updateFoot() {
        var it = results[sel];
        var kbd = $("kbd");
        if (capturing) return;
        kbd.textContent = it ? (comboFor(it.id) || "Unassigned") : "Unassigned";
        kbd.disabled = !it;
    }

    // ---------- Running ----------
    function run(it) {
        if (!it) return;
        usage[it.id] = { n: ((usage[it.id] && usage[it.id].n) || 0) + 1, t: Date.now() };
        save("usage", usage);
        if (it.cat === "ext") {
            try { window.__adobe_cep__.requestOpenExtension(it.id.slice(4), ""); } catch (e) { say(it.name + ": " + e, true); }
            if (IS_PALETTE) closePalette();
            else { $("q").value = ""; refresh(); }
            return;
        }
        evalHost("qa_run(" + JSON.stringify(it.id) + "," + (parseInt(cfg.transDur, 10) || 15) + ")").then(function (res) {
            if (res.error) say(it.name + ": " + res.error, true);
            else if (IS_PALETTE) closePalette();
            else say(res.msg || it.name);
            if (it.cat === "seq" || it.cat === "item" || it.cat === "mg") lastIndex = 0;
        });
        if (!cfg.keepQuery) { $("q").value = ""; refresh(); }
        $("q").focus();
    }

    function closePalette() {
        try { window.__adobe_cep__.closeExtension(); } catch (e) {}
    }

    // ---------- Shortcuts ----------
    var capturing = false; // false | "cmd" (selected command) | "global" (open-palette hotkey)
    var MOD_KEYS = { Shift: 1, Control: 1, Alt: 1, Meta: 1, CapsLock: 1 };

    // Layout-independent combo name built from e.code (so Vietnamese input methods don't interfere).
    function comboOf(e) {
        if (MOD_KEYS[e.key]) return null;
        var k = e.code || e.key;
        k = k.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num");
        var map = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Backquote: "`", Minus: "-",
            Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Semicolon: ";", Quote: "'",
            Comma: ",", Period: ".", Slash: "/", Space: "Space" };
        k = map[k] || k;
        var parts = [];
        if (e.ctrlKey) parts.push("Ctrl");
        if (e.metaKey) parts.push(IS_MAC ? "Cmd" : "Win");
        if (e.altKey) parts.push(IS_MAC ? "Opt" : "Alt");
        if (e.shiftKey) parts.push("Shift");
        parts.push(k);
        return { combo: parts.join("+"), hasMod: e.ctrlKey || e.metaKey || e.altKey, fkey: /^F\d{1,2}$/.test(k),
            raw: { code: e.code, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, shift: e.shiftKey } };
    }

    // Ask Premiere to hand us modifier combos instead of running its own shortcuts.
    // The palette takes them all; the docked panel only takes the assigned ones (plus all while capturing).
    function updateKeyInterest() {
        var raws = Object.keys(keys).map(function (c) { return keyRaw[c]; }).filter(Boolean);
        QAKeys.registerInterest(IS_PALETTE || !!capturing, raws);
    }

    function captureButton() { return capturing === "global" ? $("hotkey") : $("kbd"); }

    function startCapture(kind) {
        if (kind === "cmd" && !results[sel]) return;
        capturing = kind;
        updateKeyInterest();
        captureButton().textContent = "Press keys… (Esc cancel" + (kind === "cmd" ? ", ⌫ clear)" : ")");
        captureButton().classList.add("wait");
    }

    function endCapture() {
        var btn = captureButton();
        capturing = false;
        btn.classList.remove("wait");
        updateKeyInterest();
        updateFoot();
        $("hotkey").textContent = QAKeys.readConf().combo;
        if (!$("settings").classList.contains("open")) $("q").focus();
    }

    function assign(id, combo, raw) {
        for (var c in keys) if (keys[c] === id) { delete keys[c]; delete keyRaw[c]; }
        if (combo) {
            var prev = keys[combo];
            keys[combo] = id;
            keyRaw[combo] = raw;
            names[id] = byId[id] ? byId[id].name : id;
            if (prev && prev !== id) say(combo + " moved from “" + (names[prev] || prev) + "”");
            else say(combo + " → " + names[id]);
        } else {
            say("Shortcut cleared");
        }
        save("keys", keys);
        save("keyRaw", keyRaw);
        save("keyNames", names);
        render();
        renderKeyList();
    }

    function onKey(e) {
        if (capturing) {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === "Escape") return endCapture();
            var it = results[sel];
            if (capturing === "cmd" && (e.key === "Backspace" || e.key === "Delete") && !e.ctrlKey && !e.metaKey && !e.altKey) {
                assign(it.id, null);
                return endCapture();
            }
            var c = comboOf(e);
            if (!c) return;
            if (!c.hasMod && !c.fkey) { captureButton().textContent = "Needs Ctrl/Cmd/Alt or F-key…"; return; }
            if (capturing === "global") {
                var conf = c.raw;
                conf.combo = c.combo;
                QAKeys.setHotkey(conf);
                say("Open Quick Apply: " + c.combo);
            } else {
                assign(it.id, c.combo, c.raw);
            }
            return endCapture();
        }

        if ($("settings").classList.contains("open") && e.target.tagName !== "BODY" && e.target.id !== "q") return;

        var cb = comboOf(e);
        if (cb && keys[cb.combo]) {
            e.preventDefault();
            var target = byId[keys[cb.combo]];
            if (target) run(target);
            else say("“" + (names[keys[cb.combo]] || keys[cb.combo]) + "” is not in the current index", true);
            return;
        }

        switch (e.key) {
        case "ArrowDown": e.preventDefault(); select(sel + 1); break;
        case "ArrowUp":   e.preventDefault(); select(sel - 1); break;
        case "PageDown":  e.preventDefault(); select(sel + 10); break;
        case "PageUp":    e.preventDefault(); select(sel - 10); break;
        case "Enter":     e.preventDefault(); run(results[sel]); break;
        case "Escape":
            e.preventDefault();
            if ($("settings").classList.contains("open")) toggleSettings(false);
            else if (IS_PALETTE && !$("q").value) closePalette();
            else { $("q").value = ""; refresh(); }
            break;
        }
    }

    // ---------- Settings ----------
    function renderCats() {
        $("cats").innerHTML = CATS.map(function (c) {
            return '<label><input type="checkbox" data-cat="' + c[0] + '"' + (cfg.cats[c[0]] ? " checked" : "") + "> " + c[1] + "</label>";
        }).join("");
    }

    function renderKeyList() {
        var rows = Object.keys(keys).sort().map(function (c) {
            var id = keys[c];
            return "<tr><td>" + esc(c) + "</td><td>" + esc(names[id] || id) + '</td><td class="x" data-combo="' +
                esc(c) + '" title="Remove">✕</td></tr>';
        });
        $("keylist").innerHTML = rows.length ? rows.join("") : '<tr><td class="hint">No shortcuts yet</td></tr>';
    }

    function toggleSettings(open) {
        $("settings").classList.toggle("open", open);
        $("gear").classList.toggle("on", open);
        if (open) {
            renderCats();
            renderKeyList();
            $("scriptDirs").value = cfg.scriptDirs;
            $("mogrtDirs").value = cfg.mogrtDirs;
            $("transDur").value = cfg.transDur;
            $("keepQuery").checked = cfg.keepQuery;
            $("hotkey").textContent = QAKeys.readConf().combo;
        } else {
            $("q").focus();
        }
    }

    function saveSettings() {
        Array.prototype.forEach.call(document.querySelectorAll("[data-cat]"), function (el) {
            cfg.cats[el.getAttribute("data-cat")] = el.checked;
        });
        cfg.scriptDirs = $("scriptDirs").value;
        cfg.mogrtDirs = $("mogrtDirs").value;
        cfg.transDur = Math.max(1, parseInt($("transDur").value, 10) || 15);
        cfg.keepQuery = $("keepQuery").checked;
        Object.keys(cfg).forEach(function (k) { save(k, cfg[k]); });
    }

    function pickFolder(target) {
        var r;
        try {
            r = window.cep.fs.showOpenDialogEx ? window.cep.fs.showOpenDialogEx(false, true, "Choose folder", "")
                : window.cep.fs.showOpenDialog(false, true, "Choose folder", "");
        } catch (e) { say("Folder picker unavailable – type the path instead", true); return; }
        if (!r || !r.data || !r.data.length) return;
        var ta = $(target);
        ta.value = (ta.value.trim() ? ta.value.trim() + "\n" : "") + r.data[0];
        saveSettings();
    }

    // ---------- Wiring ----------
    document.addEventListener("keydown", onKey, true);
    $("q").addEventListener("input", refresh);

    $("list").addEventListener("mousedown", function (e) {
        var row = e.target.closest(".row");
        if (!row) return;
        e.preventDefault();
        select(+row.getAttribute("data-i"));
        if (e.target.classList.contains("run")) run(results[sel]);
        $("q").focus();
    });
    $("list").addEventListener("dblclick", function (e) {
        if (e.target.closest(".row") && !e.target.classList.contains("run")) run(results[sel]);
    });

    $("kbd").addEventListener("click", function () { capturing ? endCapture() : startCapture("cmd"); });
    $("hotkey").addEventListener("click", function () { capturing ? endCapture() : startCapture("global"); });
    $("gear").addEventListener("click", function () { toggleSettings(!$("settings").classList.contains("open")); });
    $("closeSettings").addEventListener("click", function () { saveSettings(); toggleSettings(false); reindex(); });
    $("reindex").addEventListener("click", function () { saveSettings(); reindex(); });
    $("settings").addEventListener("change", saveSettings);
    $("settings").addEventListener("click", function (e) {
        var add = e.target.getAttribute("data-add");
        if (add) pickFolder(add);
        var combo = e.target.getAttribute("data-combo");
        if (combo) { delete keys[combo]; delete keyRaw[combo]; save("keys", keys); save("keyRaw", keyRaw); renderKeyList(); render(); updateKeyInterest(); }
    });

    // Re-focus the search box (and pick up project changes) whenever the panel is brought forward.
    function onShow() {
        if ($("settings").classList.contains("open")) return;
        window.focus();
        $("q").focus();
        $("q").select();
        if (Date.now() - lastIndex > REFRESH_MS) reindex(true);
    }
    window.addEventListener("focus", onShow);
    try { window.__adobe_cep__.addEventListener(QAKeys.FOCUS_EVENT, onShow); } catch (e) {}

    // Palette closes as soon as it loses focus, like After Effects' Quick Apply.
    if (IS_PALETTE) {
        window.addEventListener("blur", function () {
            if (capturing || $("settings").classList.contains("open")) return;
            setTimeout(function () { if (!document.hasFocus()) closePalette(); }, 150);
        });
    } else {
        QAKeys.ensure(); // fallback if the background launcher didn't start
    }

    updateKeyInterest();
    setItems(load("cache", []));
    refresh();
    $("q").focus();
    reindex(true);
})();
