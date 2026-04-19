"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateTokens = estimateTokens;
exports.estimateContentTokens = estimateContentTokens;
const CHARS_PER_TOKEN = 4;
const MESSAGE_OVERHEAD = 4;
function estimateTokens(text) {
    const str = typeof text === 'string' ? text : JSON.stringify(text);
    return Math.ceil(str.length / CHARS_PER_TOKEN) + MESSAGE_OVERHEAD;
}
function estimateContentTokens(text) {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}
//# sourceMappingURL=tokens.js.map