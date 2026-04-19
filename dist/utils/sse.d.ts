export declare function parseSseLine(line: string): string | null;
export declare function encodeSseLine(data: string): string;
export declare function parseSseJson<T = unknown>(data: string): T | null;
