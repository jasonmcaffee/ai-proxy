"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeText = normalizeText;
exports.wordOverlap = wordOverlap;
function normalizeText(text) {
    return text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}
function wordOverlap(actual, expected) {
    const expectedWords = expected.split(' ').filter(Boolean);
    const actualWords = new Set(actual.split(' ').filter(Boolean));
    const found = expectedWords.filter(w => actualWords.has(w)).length;
    return found / expectedWords.length;
}
//# sourceMappingURL=_helpers.js.map