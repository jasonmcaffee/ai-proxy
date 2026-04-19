"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSseLine = parseSseLine;
exports.encodeSseLine = encodeSseLine;
exports.parseSseJson = parseSseJson;
function parseSseLine(line) {
    if (!line.startsWith('data: '))
        return null;
    return line.slice('data: '.length).trim();
}
function encodeSseLine(data) {
    return `data: ${data}\n\n`;
}
function parseSseJson(data) {
    try {
        return JSON.parse(data);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=sse.js.map