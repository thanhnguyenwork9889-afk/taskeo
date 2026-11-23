// PreToolUse hook (Bash | PowerShell): bắt hỏi người dùng trước khi ghi vào main / master.
// Quy tắc: docs/07-workflow.md. Chỉ merge develop → main khi người dùng cho phép.
// Nguyên tắc: nghi ngờ thì hỏi (false positive chỉ tốn một lần bấm, false negative thì không sửa được).
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PROTECTED = new Set(["main", "master"]);
const WRITES_CURRENT_BRANCH = new Set(["merge", "rebase", "cherry-pick", "commit", "reset", "pull", "revert", "am"]);
const GLOBAL_OPTS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree"]);
const SHELL_WRAPPERS = /^(bash|sh|zsh|pwsh|powershell)(\.exe)?$/i;
const INLINE_SCRIPT_FLAGS = new Set(["-c", "-Command", "-command", "/c"]);
const BRANCH_DANGER_FLAG = /^(-[a-zA-Z]*[DdMmfC]|--(delete|move|force|copy))/;
const CREATE_FLAGS = new Set(["-b", "-B", "-c", "-C", "--orphan"]);
const FORCE_CREATE_FLAGS = new Set(["-B", "-C"]);

function branchAt(dir) {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const isProtected = (name) => PROTECTED.has(name);

/** Bỏ thân heredoc (`<<EOF … EOF`, `<<'EOF'`, `<<-EOF`) và here-string PowerShell (`@' … '@`). */
function stripHeredocs(command) {
  return command
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, "<<HEREDOC")
    .replace(/@(['"])\r?\n[\s\S]*?\r?\n\1@/g, "HERESTRING");
}

/** Tách lệnh ghép theo && || ; | & xuống dòng, nhưng không tách bên trong chuỗi trích dẫn. */
function splitSegments(command) {
  const segments = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
    } else if (";|&\n".includes(ch)) {
      segments.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  segments.push(current);
  return segments.map((s) => s.trim()).filter(Boolean);
}

function tokenize(segment) {
  return (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? [])
    .map((t) => t.replace(/^["']|["']$/g, ""))
    .map((t) => t.replace(/^[({`]+|^\$\(|[)}`]+$/g, ""))
    .filter(Boolean);
}

/** Tìm `<tool> <global opts> <sub> <args>` ở bất kỳ vị trí nào (bỏ qua `FOO=1`, `&`, `sudo`...). */
function parseTool(tokens, name, optsWithValue) {
  const pattern = new RegExp(`(^|[\\\\/])${name}(\\.exe)?$`, "i");
  const start = tokens.findIndex((t) => pattern.test(t));
  if (start === -1) return null;
  let i = start + 1;
  const globals = [];
  while (i < tokens.length && tokens[i].startsWith("-")) {
    const takesValue = optsWithValue.has(tokens[i]);
    globals.push(tokens[i], ...(takesValue ? [tokens[i + 1]] : []));
    i += takesValue ? 2 : 1;
  }
  return { globals, sub: tokens[i], args: tokens.slice(i + 1) };
}

function inlineScript(tokens) {
  if (!tokens.length || !SHELL_WRAPPERS.test(tokens[0].split(/[\\/]/).pop())) return null;
  const flag = tokens.findIndex((t) => INLINE_SCRIPT_FLAGS.has(t));
  return flag === -1 ? null : tokens.slice(flag + 1).join(" ");
}

/** Nhánh mà lệnh checkout/switch chuyển tới, hoặc null nếu không chuyển nhánh. */
function switchTarget({ sub, args }) {
  if (sub !== "checkout" && sub !== "switch") return null;
  if (args.includes("--") || args.includes("--detach") || args.includes("-d")) return null;
  const create = args.findIndex((a) => CREATE_FLAGS.has(a));
  if (create !== -1) return args[create + 1] ?? null;
  const positional = args.filter((a) => !a.startsWith("-"));
  return positional.length === 1 ? positional[0] : null; // `checkout main file.txt` là khôi phục file
}

function refspecReason(verb, refspecs, branch) {
  for (const spec of refspecs) {
    const [src, dst = src] = spec.replace(/^\+/, "").split(":");
    const destination = dst.replace(/^refs\/heads\//, "");
    if (isProtected(destination)) return `${verb} vào main/master`;
    if (verb === "push" && ["HEAD", "@"].includes(src) && isProtected(branch) && !spec.includes(":")) return `push HEAD khi đang ở ${branch}`;
  }
  return null;
}

function pushReason(args, branch) {
  if (args.some((a) => a === "--all" || a === "--mirror")) return "git push --all/--mirror có thể ghi đè main/master";
  const refspecs = args.filter((a) => !a.startsWith("-")).slice(1);
  if (refspecs.length === 0 && isProtected(branch)) return `push trong khi đang ở nhánh ${branch}`;
  return refspecReason("push", refspecs, branch);
}

function gitReason(git, branch) {
  const { sub, args } = git;
  if (sub === "push") return pushReason(args, branch);
  if (sub === "fetch") return refspecReason("fetch", args.filter((a) => !a.startsWith("-") && a.includes(":")), branch);
  if (WRITES_CURRENT_BRANCH.has(sub) && isProtected(branch)) return `git ${sub} trên nhánh ${branch}`;
  if (sub === "branch" && args.some((a) => BRANCH_DANGER_FLAG.test(a)) && args.some(isProtected)) return "đổi / xoá nhánh main/master";
  if ((sub === "checkout" || sub === "switch") && args.some((a) => FORCE_CREATE_FLAGS.has(a)) && isProtected(switchTarget(git))) {
    return "tạo lại nhánh main/master";
  }
  if ((sub === "update-ref" || sub === "symbolic-ref") && args.some((a) => /refs\/heads\/(main|master)$/.test(a))) return `${sub} vào main/master`;
  return null;
}

function ghReason(tokens) {
  const gh = parseTool(tokens, "gh", new Set(["-R", "--repo"]));
  if (!gh) return null;
  if (gh.sub === "pr" && gh.args[0] === "merge") return "gh pr merge (có thể merge vào main)";
  if (gh.sub === "api" && gh.args.some((a) => /\/(merge|merges)\b|git\/refs\/heads\/(main|master)/.test(a))) return "gh api ghi vào nhánh";
  return null;
}

function cdTarget(tokens) {
  return /^(cd|Set-Location|pushd|sl)$/i.test(tokens[0] ?? "") ? tokens.find((t, i) => i > 0 && !t.startsWith("-")) : undefined;
}

/** Trả lý do cần hỏi người dùng, hoặc null nếu lệnh không ghi vào main/master. */
export function findViolation(command, startBranch, cwd = process.cwd(), lookup = branchAt) {
  let dir = cwd;
  let branch = startBranch;
  for (const segment of splitSegments(stripHeredocs(command))) {
    const tokens = tokenize(segment);
    const nested = inlineScript(tokens);
    const reason = nested !== null ? findViolation(nested, branch, dir, lookup) : ghReason(tokens) ?? checkGit(tokens, branch, dir, lookup);
    if (reason) return reason;

    const cd = cdTarget(tokens);
    if (cd) {
      dir = resolve(dir, cd);
      branch = lookup(dir);
    }
    const git = parseTool(tokens, "git", GLOBAL_OPTS_WITH_VALUE);
    if (git && !gitDir(git, dir)) branch = switchTarget(git) ?? branch;
  }
  return null;
}

function gitDir(git, dir) {
  const i = git.globals.indexOf("-C");
  return i === -1 ? null : resolve(dir, git.globals[i + 1] ?? ".");
}

function checkGit(tokens, branch, dir, lookup) {
  const git = parseTool(tokens, "git", GLOBAL_OPTS_WITH_VALUE);
  if (!git) return null;
  const otherDir = gitDir(git, dir);
  return gitReason(git, otherDir ? lookup(otherDir) : branch);
}

function ask(reason) {
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: reason } }),
  );
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw || "{}");
  const command = input.tool_input?.command;
  if (typeof command !== "string" || !/\b(git|gh)\b/i.test(command)) return;

  const cwd = input.cwd || process.cwd();
  const reason = findViolation(command, branchAt(cwd), cwd);
  if (reason) ask(`Nhánh được bảo vệ: ${reason}. Theo docs/07-workflow.md chỉ ghi vào main/master khi người dùng cho phép.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  // Không đọc được input thì vẫn bắt hỏi, không lặng lẽ cho qua.
  main().catch((error) => ask(`protect-main hook lỗi (${error.message}); xác nhận lệnh thủ công.`));
}
