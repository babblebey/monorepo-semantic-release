import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";

const execFile = promisify(execFileCallback);

async function runGit(args, { cwd, env }) {
  try {
    const { stdout } = await execFile("git", args, { cwd, env });
    return stdout;
  } catch (error) {
    const detail = error.stderr || error.stdout || error.message;
    throw new Error(`Git command failed: git ${args.join(" ")}\n${detail}`);
  }
}

export async function getTouchedCommitHashes({ cwd, env, from, to = "HEAD", path = "." }) {
  const range = from ? `${from}..${to}` : to;
  const stdout = await runGit(["log", "--format=%H", range, "--", path], { cwd, env });

  return new Set(
    stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  );
}
