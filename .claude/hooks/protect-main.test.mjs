// Chạy: node .claude/hooks/protect-main.test.mjs
import { findViolation } from "./protect-main.mjs";
const lookup = (dir) => (/mainrepo/.test(dir) ? "main" : "feat/x");
const heredocCommit = `git commit -m "$(cat <<'EOF'\nchore: docs\n\nNever run git push origin main; git merge develop\nEOF\n)"`;
const cases = [
  // [command, branch, expectAsk]
  ["git merge --no-ff feat/T001-x", "develop", false],
  ["git merge develop", "main", true],
  ["git checkout main && git merge develop", "develop", true],
  ["git switch master; git pull", "develop", true],
  ["git switch main", "develop", false],
  ["git push origin main", "develop", true],
  ["git push -u origin develop", "develop", false],
  ["git push", "main", true],
  ["git push origin HEAD:main", "feat/x", true],
  ["git push origin +refs/heads/master", "feat/x", true],
  ["git push --all", "feat/x", true],
  ["git -C ../mainrepo commit -m x", "feat/x", true],
  ["git -C ../other commit -m x", "master", false],
  ["git commit -m 'fix main bug'", "feat/x", false],
  ["git log --oneline main..develop", "develop", false],
  ["git diff develop...HEAD", "feat/x", false],
  ["git branch -D master", "develop", true],
  ["git branch --delete --force main", "develop", true],
  ["git branch -d feat/old", "develop", false],
  ["gh pr merge 3", "feat/x", true],
  ["gh.exe -R o/r pr merge 3", "feat/x", true],
  ["FOO=1 gh pr merge 3", "feat/x", true],
  ["gh pr create --base develop --body 'see; git merge main'", "feat/x", false],
  ["git checkout -- src/main.ts", "main", false],
  ["git status && git checkout main && git log", "develop", false],
  // review findings
  ["git push origin HEAD", "main", true],
  ["git push -u origin HEAD", "feat/x", false],
  ["(git checkout main; git commit -m x)", "develop", true],
  ["{ git commit -m x; }", "main", true],
  ['bash -c "git merge feature"', "main", true],
  ['powershell -Command "git push origin main"', "develop", true],
  ["git checkout main & git commit -m x", "develop", true],
  ["git fetch origin develop:main", "feat/x", true],
  ["git fetch origin", "feat/x", false],
  ["git checkout -B main", "feat/x", true],
  ["git switch -c feat/T002-y", "develop", false],
  [heredocCommit, "feat/x", false],
  ["git checkout main file.txt && git commit -m x", "feat/x", false],
  ["git switch --detach main && git commit -m x", "feat/x", false],
  ["cd ../mainrepo && git commit -m x", "feat/x", true],
  ["git & git.exe push origin main", "feat/x", true],
];
let failed = 0;
for (const [cmd, br, expected] of cases) {
  const got = findViolation(cmd, br, "/work/repo", lookup) !== null;
  if (got !== expected) { failed++; console.log("FAIL", JSON.stringify(cmd), br, "expected", expected, "got", got); }
}
console.log(failed ? `${failed} failed` : `all ${cases.length} passed`);
process.exitCode = failed ? 1 : 0;
