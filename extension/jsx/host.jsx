/*  Quick Apply (Premiere Pro) – host side.
    qa_index() lists everything searchable inside Premiere; qa_run(id) executes one entry.
    Every function returns a small JSON string for the panel.
*/

try { app.enableQE(); } catch (e) {}

function qa_str(s) {
    return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
        .replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t") + '"';
}
function qa_err(msg) { return '{"error":' + qa_str(msg) + '}'; }
function qa_ok(msg) { return '{"ok":true,"msg":' + qa_str(msg || "") + '}'; }
function qa_entry(id, name, cat, path) {
    return '{"id":' + qa_str(id) + ',"name":' + qa_str(name) + ',"cat":' + qa_str(cat) + ',"path":' + qa_str(path) + '}';
}

// ---------- Built-in commands ----------
var QA_COMMANDS = [
    ["save",       "Save Project",                        "File"],
    ["marker",     "Add Marker at Playhead",              "Sequence"],
    ["razor",      "Razor All Tracks at Playhead",        "Sequence"],
    ["inout",      "Set In/Out to Selection",             "Sequence"],
    ["clearinout", "Clear In/Out",                        "Sequence"],
    ["frame",      "Export Frame (PNG, next to project)", "Sequence"],
    ["toggle",     "Enable/Disable Selected Clips",       "Clip"],
    ["scale",      "Scale Selected to Frame Size",        "Clip"],
    ["link",       "Link Selection",                      "Clip"],
    ["unlink",     "Unlink Selection",                    "Clip"],
    ["rmfx",       "Remove Effects from Selected Clips",  "Clip"]
];

// Normalise QE list results (array or comma string, depending on version).
function qa_list(fn) {
    var out = [];
    try {
        var r = fn();
        if (!r) return out;
        if (typeof r === "string") r = r.split(",");
        for (var i = 0; i < r.length; i++) if (r[i]) out.push(String(r[i]));
    } catch (e) {}
    return out;
}

// cats: comma list of categories to include (fx,afx,tr,atr,seq,item,cmd)
function qa_index(cats) {
    try {
        var want = {}, parts = String(cats || "").split(","), i, out = [];
        for (i = 0; i < parts.length; i++) want[parts[i]] = true;

        if (want.cmd) for (i = 0; i < QA_COMMANDS.length; i++)
            out.push(qa_entry("cmd:" + QA_COMMANDS[i][0], QA_COMMANDS[i][1], "cmd", "Command > " + QA_COMMANDS[i][2]));

        if (typeof qe !== "undefined" && qe.project) {
            var groups = [
                ["fx",  "Video Effects",     function () { return qe.project.getVideoEffectList(); }],
                ["afx", "Audio Effects",     function () { return qe.project.getAudioEffectList(); }],
                ["tr",  "Video Transitions", function () { return qe.project.getVideoTransitionList(); }],
                ["atr", "Audio Transitions", function () { return qe.project.getAudioTransitionList(); }]
            ];
            for (var g = 0; g < groups.length; g++) {
                if (!want[groups[g][0]]) continue;
                var names = qa_list(groups[g][2]);
                for (i = 0; i < names.length; i++)
                    out.push(qa_entry(groups[g][0] + ":" + names[i], names[i], groups[g][0], groups[g][1]));
            }
        }

        if ((want.seq || want.item) && app.project && app.project.rootItem)
            qa_walk(app.project.rootItem, "Project", want, out, 0);

        return '{"items":[' + out.join(",") + ']}';
    } catch (e) {
        return qa_err("Index failed: " + e);
    }
}

function qa_walk(bin, path, want, out, depth) {
    if (depth > 30) return;
    var kids = bin.children;
    if (!kids) return;
    for (var i = 0; i < kids.numItems; i++) {
        var it = kids[i];
        if (!it) continue;
        var isSeq = false;
        try { isSeq = it.isSequence(); } catch (e) {}
        if (it.type === ProjectItemType.BIN) {
            if (want.item) out.push(qa_entry("item:" + it.nodeId, it.name, "bin", path));
            qa_walk(it, path + " > " + it.name, want, out, depth + 1);
        } else if (isSeq) {
            if (want.seq) out.push(qa_entry("seq:" + it.nodeId, it.name, "seq", path));
        } else if (want.item && it.type === ProjectItemType.CLIP || want.item && it.type === ProjectItemType.FILE) {
            out.push(qa_entry("item:" + it.nodeId, it.name, "item", path));
        }
    }
}

function qa_findItem(bin, nodeId, depth) {
    if (depth > 30 || !bin.children) return null;
    for (var i = 0; i < bin.children.numItems; i++) {
        var it = bin.children[i];
        if (!it) continue;
        if (it.nodeId === nodeId) return it;
        if (it.type === ProjectItemType.BIN) {
            var f = qa_findItem(it, nodeId, depth + 1);
            if (f) return f;
        }
    }
    return null;
}

// ---------- Selection helpers ----------
// Returns [{clip, qe, video}] for every selected clip in the active sequence.
function qa_selected(videoOnly, audioOnly) {
    var seq = app.project.activeSequence, res = [];
    if (!seq) return res;
    var qseq = null;
    try { qseq = qe.project.getActiveSequence(); } catch (e) {}
    var kinds = [];
    if (!audioOnly) kinds.push([seq.videoTracks, true]);
    if (!videoOnly) kinds.push([seq.audioTracks, false]);
    for (var k = 0; k < kinds.length; k++) {
        var tracks = kinds[k][0], isVideo = kinds[k][1];
        for (var t = 0; t < tracks.numTracks; t++) {
            var tr = tracks[t], qtr = null;
            try { qtr = qseq ? (isVideo ? qseq.getVideoTrackAt(t) : qseq.getAudioTrackAt(t)) : null; } catch (e1) {}
            for (var c = 0; c < tr.clips.numItems; c++) {
                var clip = tr.clips[c];
                if (!clip.isSelected()) continue;
                res.push({ clip: clip, qe: qa_qeItem(qtr, clip, c), video: isVideo });
            }
        }
    }
    return res;
}

// Match a DOM TrackItem to its QE item: by start ticks, falling back to the n-th non-empty item.
function qa_qeItem(qtr, clip, index) {
    if (!qtr) return null;
    var n = 0, nth = null, ticks = String(clip.start.ticks);
    for (var i = 0; i < qtr.numItems; i++) {
        var it = qtr.getItemAt(i);
        if (!it || it.type === "Empty") continue;
        try { if (it.start && String(it.start.ticks) === ticks) return it; } catch (e) {}
        if (n === index) nth = it;
        n++;
    }
    return nth;
}

function qa_needSeq() {
    if (!app.project.activeSequence) throw new Error("No active sequence");
    return app.project.activeSequence;
}

function qa_timecode(frames, fps) {
    fps = Math.max(1, Math.round(fps));
    var f = frames % fps, s = Math.floor(frames / fps);
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return p(Math.floor(s / 3600)) + ":" + p(Math.floor(s / 60) % 60) + ":" + p(s % 60) + ":" + p(f);
}

// ---------- Actions ----------
function qa_applyEffect(name, audio) {
    qa_needSeq();
    var fx = audio ? qe.project.getAudioEffectByName(name) : qe.project.getVideoEffectByName(name);
    if (!fx) return qa_err("Effect not found: " + name);
    var sel = qa_selected(!audio, audio), done = 0;
    if (!sel.length) return qa_err("Select " + (audio ? "audio" : "video") + " clips in the timeline first");
    for (var i = 0; i < sel.length; i++) {
        if (!sel[i].qe) continue;
        if (audio) sel[i].qe.addAudioEffect(fx); else sel[i].qe.addVideoEffect(fx);
        done++;
    }
    return done ? qa_ok(name + " → " + done + " clip(s)") : qa_err("Could not reach the selected clips");
}

function qa_applyTransition(name, audio, frames) {
    var seq = qa_needSeq();
    var tr = audio ? qe.project.getAudioTransitionByName(name) : qe.project.getVideoTransitionByName(name);
    if (!tr) return qa_err("Transition not found: " + name);
    var sel = qa_selected(!audio, audio), done = 0;
    if (!sel.length) return qa_err("Select " + (audio ? "audio" : "video") + " clips in the timeline first");
    var fps = 254016000000 / Number(seq.timebase);
    var dur = qa_timecode(Math.max(1, frames || 15), fps);
    for (var i = 0; i < sel.length; i++) {
        var q = sel[i].qe;
        if (!q) continue;
        // One clip selected: both ends. Several: the end of each (the cuts between them).
        if (sel.length === 1) q.addTransition(tr, true, dur, "00:00:00:00", 0.5, false, true);
        q.addTransition(tr, false, dur, "00:00:00:00", 0.5, false, true);
        done++;
    }
    return done ? qa_ok(name + " → " + done + " clip(s)") : qa_err("Could not reach the selected clips");
}

function qa_openSequence(nodeId) {
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
        var s = app.project.sequences[i];
        if (s.projectItem && s.projectItem.nodeId === nodeId) {
            app.project.openSequence(s.sequenceID);
            return qa_ok("Opened " + s.name);
        }
    }
    return qa_err("Sequence not found (refresh the list)");
}

// Clips: overwrite at the playhead on the first targeted video track. Bins: reveal in Project panel.
function qa_useItem(nodeId) {
    var it = qa_findItem(app.project.rootItem, nodeId, 0);
    if (!it) return qa_err("Item not found (refresh the list)");
    if (it.type === ProjectItemType.BIN) {
        try { it.select(); } catch (e) {}
        return qa_ok("Selected bin " + it.name);
    }
    var seq = qa_needSeq();
    var tracks = seq.videoTracks, track = tracks[0];
    for (var i = 0; i < tracks.numTracks; i++) if (tracks[i].isTargeted()) { track = tracks[i]; break; }
    track.overwriteClip(it, seq.getPlayerPosition().seconds);
    return qa_ok("Placed " + it.name + " at playhead");
}

function qa_command(cmd) {
    var seq, qseq, sel, i;
    switch (cmd) {
    case "save":
        app.project.save();
        return qa_ok("Project saved");
    case "marker":
        seq = qa_needSeq();
        seq.markers.createMarker(seq.getPlayerPosition().seconds);
        return qa_ok("Marker added");
    case "razor":
        qa_needSeq();
        qseq = qe.project.getActiveSequence();
        qseq.razor(qseq.CTI.timecode);
        return qa_ok("Razored at " + qseq.CTI.timecode);
    case "inout":
        seq = qa_needSeq();
        sel = seq.getSelection();
        if (!sel || !sel.length) return qa_err("Select clips first");
        var a = Infinity, b = -Infinity;
        for (i = 0; i < sel.length; i++) {
            a = Math.min(a, sel[i].start.seconds);
            b = Math.max(b, sel[i].end.seconds);
        }
        seq.setInPoint(a);
        seq.setOutPoint(b);
        return qa_ok("In/Out set to selection");
    case "clearinout":
        seq = qa_needSeq();
        seq.setInPoint(0);
        seq.setOutPoint(seq.end);
        return qa_ok("In/Out cleared");
    case "frame":
        seq = qa_needSeq();
        if (!app.project.path) return qa_err("Save the project first");
        qseq = qe.project.getActiveSequence();
        var tc = qseq.CTI.timecode;
        var f = new File(app.project.path).parent.fsName + "/" +
            String(seq.name).replace(/[\/\\:*?"<>|]/g, "_") + "_" + tc.replace(/[:;]/g, "-");
        qseq.exportFramePNG(tc, f);
        return qa_ok("Frame saved: " + f + ".png");
    case "toggle":
        sel = qa_needSeq().getSelection();
        if (!sel || !sel.length) return qa_err("Select clips first");
        for (i = 0; i < sel.length; i++) sel[i].disabled = !sel[i].disabled;
        return qa_ok("Toggled " + sel.length + " clip(s)");
    case "scale":
        sel = qa_needSeq().getSelection();
        if (!sel || !sel.length) return qa_err("Select clips first");
        for (i = 0; i < sel.length; i++) try { sel[i].setScaleToFrameSize(); } catch (e) {}
        return qa_ok("Scaled " + sel.length + " clip(s)");
    case "link":
        qa_needSeq().linkSelection();
        return qa_ok("Linked");
    case "unlink":
        qa_needSeq().unlinkSelection();
        return qa_ok("Unlinked");
    case "rmfx":
        sel = qa_selected(false, false);
        if (!sel.length) return qa_err("Select clips first");
        for (i = 0; i < sel.length; i++) if (sel[i].qe) sel[i].qe.removeEffects(true, true, true, true, true);
        return qa_ok("Removed effects from " + sel.length + " clip(s)");
    }
    return qa_err("Unknown command: " + cmd);
}

function qa_runScript(path) {
    var f = new File(path);
    if (!f.exists) return qa_err("Script not found: " + path);
    $.evalFile(f);
    return qa_ok("Ran " + f.displayName);
}

function qa_importMogrt(path) {
    var seq = qa_needSeq();
    var f = new File(path);
    if (!f.exists) return qa_err("Template not found: " + path);
    var v = 0, a = 0, i;
    for (i = 0; i < seq.videoTracks.numTracks; i++) if (seq.videoTracks[i].isTargeted()) { v = i; break; }
    for (i = 0; i < seq.audioTracks.numTracks; i++) if (seq.audioTracks[i].isTargeted()) { a = i; break; }
    seq.importMGT(f.fsName, String(seq.getPlayerPosition().ticks), v, a);
    return qa_ok("Added " + f.displayName);
}

// id format: "<kind>:<payload>"
function qa_run(id, transFrames) {
    try {
        id = String(id);
        var k = id.indexOf(":"), kind = id.substring(0, k), arg = id.substring(k + 1);
        switch (kind) {
        case "fx":   return qa_applyEffect(arg, false);
        case "afx":  return qa_applyEffect(arg, true);
        case "tr":   return qa_applyTransition(arg, false, transFrames);
        case "atr":  return qa_applyTransition(arg, true, transFrames);
        case "seq":  return qa_openSequence(arg);
        case "item": return qa_useItem(arg);
        case "cmd":  return qa_command(arg);
        case "js":   return qa_runScript(arg);
        case "mg":   return qa_importMogrt(arg);
        }
        return qa_err("Unknown entry: " + id);
    } catch (e) {
        return qa_err(String(e.message || e));
    }
}
