"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rewriteSpecText = rewriteSpecText;
const fs = require("fs");
const path = require("path");
const INPUT_PATH = path.resolve(__dirname, '../src/openapi-spec.json');
const OUTPUT_PATH = path.resolve(__dirname, '../src/openapi-spec.rewritten.json');
function rewriteSpecText(text) {
    text = text.replace(/"(\w+)Dto"/g, (match, name) => `"${name}"`);
    text = text.replace(/(schemas\/)(\w+)Dto"/g, (match, prefix, name) => `${prefix}${name}"`);
    text = text.replace('"createCompletion"', '"create"');
    text = text.replace(/"\/v1\/chat\/completions"[\s\S]*?"tags":\s*\[\s*"chat"\s*\]/, (match) => match.replace('"chat"', '"ChatCompletions"'));
    return text;
}
function main() {
    const raw = fs.readFileSync(INPUT_PATH, 'utf-8');
    const rewritten = rewriteSpecText(raw);
    fs.writeFileSync(OUTPUT_PATH, rewritten, 'utf-8');
    console.log(`Wrote rewritten spec to ${OUTPUT_PATH}`);
}
main();
//# sourceMappingURL=rewrite-spec-names.js.map