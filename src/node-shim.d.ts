// Minimal Node typings. Avoids @types/node (typescript is the only dev dependency).
declare module "node:fs" {
  export function readFileSync(path: string | number, enc: "utf8"): string;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { mtimeMs: number };
  export function appendFileSync(path: string, data: string): void;
}
declare module "node:path" {
  export function join(...p: string[]): string;
  export function dirname(p: string): string;
  export function basename(p: string): string;
}
declare module "node:url" {
  export function fileURLToPath(u: string): string;
}
interface ImportMeta { url: string }
declare const process: {
  argv: string[];
  exitCode: number | undefined;
  stdout: { write(s: string): void };
  stderr: { write(s: string): void };
};
