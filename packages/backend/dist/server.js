"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const db_1 = require("./db");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const fast_levenshtein_1 = __importDefault(require("fast-levenshtein"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
const glossaryPath = path_1.default.resolve(__dirname, 'glossary.json');
const dictPath = path_1.default.resolve(__dirname, 'dict.json');
const glossary = JSON.parse(fs_1.default.readFileSync(glossaryPath, 'utf8'));
const dict = JSON.parse(fs_1.default.readFileSync(dictPath, 'utf8'));
function normalizeText(s) {
    return s.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[\p{P}\p{S}]/gu, '');
}
function applyGlossary(text) {
    // apply longest matches first
    const keys = glossary.map(g => g.source).sort((a, b) => b.length - a.length);
    let out = text;
    for (const k of keys) {
        const re = new RegExp('\\b' + k.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '\\b', 'gi');
        const g = glossary.find(x => x.source.toLowerCase() === k.toLowerCase());
        if (g)
            out = out.replace(re, g.target);
    }
    return out;
}
// In-memory TM index for faster fuzzy lookup
let tmIndex = [];
async function buildTmIndex() {
    const rows = await (0, db_1.getAllTM)();
    tmIndex = rows.map((r) => ({ src: r.src, srcNorm: r.src_norm || normalizeText(r.src), tgt: r.tgt, count: r.count }));
}
// build index at startup
buildTmIndex().catch(() => { });
async function queryTM(src) {
    const exact = await (0, db_1.queryTMExact)(src);
    if (exact)
        return { src: exact.src, tgt: exact.tgt, via: 'TM', score: 1 };
    // fuzzy search using in-memory index
    let best = null;
    const s1 = normalizeText(src);
    for (const r of tmIndex) {
        const s2 = r.srcNorm;
        const distance = fast_levenshtein_1.default.get(s1, s2);
        const maxLen = Math.max(s1.length, s2.length);
        const score = maxLen === 0 ? 1 : 1 - distance / maxLen;
        if (!best || score > best.score)
            best = { src: r.src, tgt: r.tgt, score };
    }
    if (best && best.score >= 0.9)
        return { src: best.src, tgt: best.tgt, via: 'FUZZY', score: best.score };
    if (best && best.score >= 0.75)
        return { src: best.src, tgt: best.tgt, via: 'FUZZY', score: best.score, review: true };
    return null;
}
function queryDict(text) {
    // try multiword first
    const words = text.split(/\s+/);
    for (let size = words.length; size >= 1; size--) {
        for (let i = 0; i + size <= words.length; i++) {
            const slice = words.slice(i, i + size).join(' ');
            const t = dict[slice.toLowerCase()];
            if (t)
                return { src: slice, tgt: t, via: 'DICT' };
        }
    }
    return null;
}
app.post('/translate', async (req, res) => {
    const segments = req.body.segments || [];
    const results = [];
    for (const seg of segments) {
        let s = seg;
        // apply glossary substitutions
        s = applyGlossary(s);
        // check TM
        const tm = await queryTM(s);
        if (tm) {
            results.push({ src: seg, tgt: tm.tgt, via: tm.via, score: tm.score || 1 });
            continue;
        }
        // try dictionary
        const d = queryDict(s);
        if (d) {
            results.push({ src: seg, tgt: d.tgt, via: d.via });
            continue;
        }
        results.push({ src: seg, tgt: '', via: 'NONE' });
    }
    res.json({ success: true, data: results });
});
app.post('/tm/save', async (req, res) => {
    const { src, tgt } = req.body;
    if (!src || !tgt)
        return res.status(400).json({ success: false, error: 'src and tgt required' });
    await (0, db_1.upsertTM)(src, tgt);
    // refresh in-memory index
    try {
        await buildTmIndex();
    }
    catch (e) { /* ignore */ }
    res.json({ success: true });
});
const port = process.env.PORT || 3000;
app.listen(port, () => console.log('Server running on port', port));
//# sourceMappingURL=server.js.map