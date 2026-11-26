// The repository's root: the nearest directory with a package.json, so the
// simulator and the tests find it from src or from their build in build/js/.
import fs from "node:fs";
import path from "node:path";

function findRoot(from: string): string {
  for (let dir = from; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    if (path.dirname(dir) === dir) throw new Error(`no package.json above ${from}`);
  }
}

export const root = findRoot(import.meta.dirname);
