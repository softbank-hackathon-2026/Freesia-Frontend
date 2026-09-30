import { spawnSync } from "node:child_process";
const commands = [
  ["TypeScript", "node_modules/typescript/bin/tsc", ["--noEmit"]],
  ["ESLint", "node_modules/eslint/bin/eslint.js", ["."]],
  ["Tests", null, ["--test", "tests/*.test.ts"]],
  ["Build", "node_modules/vite/bin/vite.js", ["build"]],
];
for (const [name, script, args] of commands) {
  console.log(`\n${name}`);
  const result = spawnSync(
    process.execPath,
    script ? [script, ...args] : args,
    { stdio: "inherit" },
  );
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
