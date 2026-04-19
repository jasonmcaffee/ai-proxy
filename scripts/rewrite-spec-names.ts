import * as fs from 'fs';
import * as path from 'path';

const INPUT_PATH = path.resolve(__dirname, '../src/openapi-spec.json');
const OUTPUT_PATH = path.resolve(__dirname, '../src/openapi-spec.rewritten.json');

/**
 * Applies all spec name rewrites to a JSON string:
 * - Strips "Dto" suffix from schema keys and $ref paths
 * - Renames chat completion operationId to match the OpenAI SDK
 * - Retagsthe chat completions path so the generator emits ChatCompletionsApi
 * @param text - raw JSON string of the OpenAPI spec
 */
export function rewriteSpecText(text: string): string {
  // Strip Dto suffix from component schema keys: "FooDto": { → "Foo": {
  text = text.replace(/"(\w+)Dto"/g, (match, name) => `"${name}"`);

  // Strip Dto suffix from $ref paths: /schemas/FooDto" → /schemas/Foo"
  text = text.replace(/(schemas\/)(\w+)Dto"/g, (match, prefix, name) => `${prefix}${name}"`);

  // Rename the chat completion operationId to match openai SDK
  text = text.replace('"createCompletion"', '"create"');

  // Retag chat completions endpoint so generator emits ChatCompletionsApi class
  text = text.replace(
    /"\/v1\/chat\/completions"[\s\S]*?"tags":\s*\[\s*"chat"\s*\]/,
    (match) => match.replace('"chat"', '"ChatCompletions"'),
  );

  return text;
}

/**
 * Reads the OpenAPI spec, applies rewrites, and writes the result for the client generator.
 */
function main(): void {
  const raw = fs.readFileSync(INPUT_PATH, 'utf-8');
  const rewritten = rewriteSpecText(raw);
  fs.writeFileSync(OUTPUT_PATH, rewritten, 'utf-8');
  console.log(`Wrote rewritten spec to ${OUTPUT_PATH}`);
}

main();
