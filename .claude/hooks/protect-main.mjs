// PreToolUse hook (Bash | PowerShell): bắt hỏi người dùng trước khi ghi vào main / master.
// Quy tắc: docs/07-workflow.md. Chỉ merge develop → main khi người dùng cho phép.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const PROTECTED = new Set(["main", "master"]);
// Lệnh git ghi vào nhánh hiện tại.
const WRITES_CURRENT_BRANCH = new Set(["merge", "rebase", "cherry-pick", "commit", "reset", "pull", "revert", "am"]);
// Tuỳ chọn toàn cục của git có kèm giá trị: `git -C dir`, `git -c key=value`.
const GLOBAL_OPTS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree"]);

function currentBranch(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function isProtectedRef(ref) {
  // refspec `src:dst`, `+dst`, `refs/heads/dst` → so tên nhánh đích.
  const destination = ref.replace(/^\+/, "").split(":").pop().replace(/^refs\/heads\//, "");
  return PROTECTED.has(destination);
}

function tokenize(segment) {
  return (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((t) => t.replace(/^["']|["']$/g, ""));
}

/** Tách `git <global opts> <sub> <args>` → { sub, args }, hoặc null nếu không phải lệnh git. */
function parseGit(tokens) {
  const start = tokens.findIndex((t) => /(^|[\\/])git(\.exe)?$/.test(t));
  if (start === -1) return null;
  let i = start + 1;
  while (i < tokens.length && tokens[i].startsWith("-")) i += GLOBAL_OPTS_WITH_VALUE.has(tokens[i]) ? 2 : 1;
  return { sub: tokens[i], args: tokens.slice(i + 1) };
}

function switchTarget({ sub, args }) {
  if (sub !== "checkout" && sub !== "switch") return null;
  const positional = args.filter((a) => !a.startsWith("-"));
  if (args.includes("--")) return null; // checkout -- <file>
  return positional[0] ?? null;
}

function pushReason(args, branch) {
  if (args.includes("--all") || args.includes("--mirror")) return "git push --all/--mirror có thể ghi đè main/master";
  const positional = args.filter((a) => !a.startsWith("-"));
  const refspecs = positional.slice(1);
  if (refspecs.some(isProtectedRef)) return "push lên main/master";
  if (refspecs.length === 0 && PROTECTED.has(branch)) return `push trong khi đang ở nhánh ${branch}`;
  return null;
}

function segmentReason(git, branch) {
  if (git.sub === "push") return pushReason(git.args, branch);
  if (WRITES_CURRENT_BRANCH.has(git.sub) && PROTECTED.has(branch)) return `git ${git.sub} trên nhánh ${branch}`;
  if (git.sub === "branch" && git.args.some((a) => ["-f", "--force", "-D", "-M", "-m"].includes(a)) && git.args.some((a) => PROTECTED.has(a))) {
    return "đổi / xoá nhánh main/master";
  }
  if (git.sub === "update-ref" && git.args.some((a) => /refs\/heads\/(main|master)$/.test(a))) return "update-ref vào main/master";
  return null;
}

/** Trả lý do cần hỏi người dùng, hoặc null nếu lệnh không ghi vào main/master. */
export function findViolation(command, startBranch) {
  let branch = startBranch;
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const tokens = tokenize(segment);
    if (tokens[0] === "gh" && tokens[1] === "pr" && tokens[2] === "merge") return "gh pr merge (có thể merge vào main)";
    const git = parseGit(tokens);
    if (!git) continue;
    const reason = segmentReason(git, branch);
    if (reason) return reason;
    branch = switchTarget(git) ?? branch;
  }
  return null;
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw || "{}");
  const command = input.tool_input?.command;
  if (typeof command !== "string" || !/\b(git|gh)\b/.test(command)) return;

  const reason = findViolation(command, currentBranch(input.cwd || process.cwd()));
  if (!reason) return;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: `Nhánh được bảo vệ: ${reason}. Theo docs/07-workflow.md chỉ ghi vào main/master khi người dùng cho phép.`,
      },
    }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    // Không đọc được input thì vẫn bắt hỏi, không lặng lẽ cho qua.
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: `protect-main hook lỗi (${error.message}); xác nhận lệnh thủ công.`,
        },
      }),
    );
  });
}
