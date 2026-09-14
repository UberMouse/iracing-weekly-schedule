---
name: sdd-loop
description: Lightweight, ungated subagent-driven development for this repo. Take an ask, pin it down with questions, implement it via implementer + parallel spec/quality reviewers, run a whole-change review, and finish with verified commits on the current branch. Use for bug fixes, small features and refactors that don't need a design discussion.
---

# SDD Loop (lightweight, ungated)

Take the ask, pin it down, implement it under subagent-driven development, let autonomous
reviewers converge, and finish with **verified commits on the current branch**. No plan document,
no spec document, no approval gates.

> **Ungated does not mean silent.** You never hand the user a plan or report and wait for
> approval — but **ask questions freely** with `AskUserQuestion`, especially at intake (§0), where
> you derive the criteria the whole loop is judged against. A question costs one round-trip; a
> wrong spec costs the whole run.

**Core principle:** a change is not done because it works — it is done when a reviewer that did
not write it, reading the real committed tree, cannot find anything wrong with it.

**Announce at start:** "Using the sdd-loop skill — implementing this under subagent-driven
development with autonomous review. I'll ask up front if anything's ambiguous, then run without
planning gates."

Give running commentary throughout: say what you're doing and why before each step.

```
  0. Intake        read code ─► ASK what you need ─► ACCEPTANCE CRITERIA (the spec surrogate)
  1. Setup         clean tree on the current branch; record BASE
  2. Split         DEFAULT: one task. Split only if genuinely separable (2-4, primitives-first)
  3. SDD loop      per task, sequentially:
                     implement ─► ⟨spec-review ∥ quality-review⟩ ─► one combined fix
                       ─►(re-review ONLY what flagged)*─► task done, committed
  4. Verify        npm run test + npm run lint + npm run build all green
  5. Change review one reviewer over BASE..HEAD ─► auto-fix every PRIMARY finding
                     ─► appendix reported, not fixed ─► re-verify
  6. Finish        commits on the current branch (not pushed) + final report
```

## When to use

- A bug fix, small feature, or refactor you understand and don't want to plan formally.
- You want independent spec + quality review with fix-forward, without sitting through gates.
- Long unattended runs — questions are front-loaded at §0; after that the loop runs to the end.

## When NOT to use

| Situation | Do instead |
|---|---|
| Real design decisions, competing approaches, 5+ tasks | Plan it with the user first (`superpowers:brainstorming` / `superpowers:writing-plans`) |
| Code already written; you just want it reviewed | `/code-review` |
| A typo, a comment, a version bump | Just edit it. Three subagents to fix a typo is theatre. |

## Repo facts every step relies on

- **Git:** work **directly on the current branch** (normally `main`). No feature branches, no
  worktrees. Commit every task. **Never push** unless the user asks — a push to `main` deploys to
  GitHub Pages via `.github/workflows/deploy.yml`. Never force-push, never rewrite history.
  Background sessions don't need isolation here — that's what `worktree.bgIsolation: "none"` in
  `.claude/settings.json` is for. If a session was nonetheless forced into a worktree, stay in it,
  give every subagent the worktree's absolute path as its cwd, and tell them to keep git commands
  simple (the worktree guard refuses compound lines that mix git with `cd`); finish by giving the
  user the `git merge --ff-only <branch>` to run from the main checkout.
- **Verification commands:** `npm run test` (Vitest), `npm run lint` (ESLint flat config),
  `npm run build` (`tsc -b && vite build` — this is the typecheck). Single file:
  `npx vitest run <path>`.
- **Tests:** component tests live in `src/components/__tests__/`, store tests in
  `src/store/__tests__/`, pipeline tests in `scripts/__tests__/`. Testing Library + jsdom.
- **Data:** season data is committed in `public/seasons/`. `npm run fetch-data` /
  `npm run fetch-prelim` hit the iRacing API with credentials injected by 1Password (`op run`)
  and can be run anytime. CI never has credentials — anything needed at deploy time must be
  derivable from committed files.
- **Browser checks:** use the `playwright-cli` skill against `npm run dev` (base path
  `/iracing-weekly-schedule/`), not Chrome MCP tools. Its "This repo" section has the recipe.
- **Debug logging:** tag it with a greppable string and report a regex matching all of it.

## State you carry

| Field | Meaning |
|---|---|
| `criteria` | the acceptance-criteria list from §0 — the spec every spec-review checks against |
| `tasks` | usually one; each with title, criteria slice, files |
| `BASE` | the commit you started from (`git rev-parse HEAD`) |
| `implModel` | `sonnet` default; `opus` for a genuinely hard change |

---

## 0. Intake — ask, then write the acceptance criteria

This list **is the spec**. Without it the spec reviewer has nothing to check against and
degenerates into a second code review.

### 0a. Read the code first

Read the files the ask touches **before** asking anything — and look at the real data in
`public/seasons/` when the ask involves schedule data. Most apparent ambiguities dissolve on
contact with the code or data. Questions you could have answered by reading are noise.

### 0b. Ask what's actually load-bearing

Use `AskUserQuestion` for whatever survives, batched into one call (up to 4 questions, options
with real trade-offs in the descriptions, recommended option first).

**Ask when** two readings of the ask would produce **materially different code**:

- Scope boundaries — one component, or every consumer?
- Edge behaviour the ask didn't mention — empty/error states, provisional seasons, past
  (read-only) seasons, existing persisted Zustand state in users' localStorage.
- Data semantics — what counts, how things are grouped, which source of truth (series category
  vs iRacing's own metadata, etc.).
- Migration/compat — does persisted state need a `migrate` step, or is a clean break fine?
- An intentional-looking oddity you'd otherwise "fix" — it may be load-bearing.

**Don't ask — decide and note it** when the answer is conventional, cheap to change, or the repo
already votes (naming, file placement, whether to extract a helper). Write those into the
criteria as explicit `**Assumption:**` lines.

**If the ask is a one-liner with no real ambiguity, ask nothing.**

### 0c. Write the criteria

```
## Acceptance criteria
- [ ] `<symbol>` in `<file>` <does X> instead of <Y>
- [ ] <edge case> is handled: <expected behaviour>
- [ ] A Vitest test covers <the behaviour that changed>
- [ ] CLAUDE.md updated if the architecture/commands changed
- Out of scope: <obvious adjacent temptation>
```

Rules:

- **Keep it to what the user asked for.** Improvements you noticed go in the final report as
  suggestions, not scope.
- **Include an explicit out-of-scope line** so the spec reviewer can flag over-building.
- **Include the test criterion.**
- **Fold every §0b answer and assumption in** — an answer you merely remember is one no reviewer
  can check.

**Echo the criteria to the user, then keep going — do not wait for approval.** The criteria live
in your context and are passed **verbatim inline** to every subagent; never write them to a file.

## 1. Setup

```bash
git status --short
git rev-parse HEAD   # BASE
```

The tree must be clean apart from files unrelated to the ask. **If it's dirty with related
changes, stop and ask** — implementing on an unknown state makes every review diff meaningless.
Tell implementers which unrelated paths to leave unstaged.

## 2. Split only if you must

**Default is ONE task.** Split into 2-4 only for genuinely separable units (e.g. a data/pipeline
change whose output a UI change consumes). Order **primitives-first**: whatever creates a shared
type or file lands before its consumers, and pin the interface (type shape, file path) in the
criteria so both tasks agree.

Five or more tasks means you need a design discussion — see *Escape hatch*.

## 3. The SDD loop

Run tasks **strictly sequentially**. Each task edits the real tree and commits — git is the state.

For each task:

1. **Dispatch the implementer** (`Agent`, `general-purpose`, model = `implModel`) with the
   *Implementer* template. It implements, runs tests/lint/build, **commits**, and self-reviews.
   If it returns a **blocking question**, route it through `AskUserQuestion` and re-dispatch.
2. **Review in PARALLEL** — both reviewers **in a single message** against the same commit:
   - **Spec-compliance reviewer** (`sonnet`) — code vs §0 criteria: missing, extra, misunderstood.
   - **Code-quality reviewer** (`sonnet`, `haiku` for a trivial task) — quality only.
3. **Converge.** If either flagged, dispatch **ONE combined fix agent** (Implementer template, fix
   mode) carrying both finding sets. It commits on top. **Re-run only the review(s) that
   flagged.** Repeat until every most-recent review is clean.
4. Task done. Next task.

**Rules:**

- **Only ONE agent edits the tree at a time.** Reviewers run concurrently because they only read.
- **Never skip a review, never proceed with open findings.**
- **Re-review is targeted** — a clean dimension stays clean; §5 is the whole-change backstop.
- **Fix-forward only.** Commit on top; never rewind a prior task.
- Give subagents the **full task text inline**.

## 4. Verify

Run it yourself (not via a subagent) and read the output:

```bash
npm run test && npm run lint && npm run build
```

**If the change touches anything under `src/`** (components, store, styles, routing), also run a
browser pass yourself with `playwright-cli` (recipe in that skill's "This repo" section): load
every route the change affects, exercise each acceptance criterion that's visible in the UI,
and check `playwright-cli console warning` shows no new warnings or errors. Skip it for changes
confined to `scripts/`, `data/` or docs, and say you skipped it.

Do not proceed to §5 with anything red.

## 5. Change review — auto-fix the primaries

Per-task reviews saw one task each; this pass sees the whole change, where cross-task coupling
bugs live. **Not optional**, even for one task.

Dispatch one reviewer (`Agent`, `general-purpose`, model `opus`) with the *Change reviewer*
template over `git diff BASE..HEAD`. It returns findings tagged `primary` (confident, worth
fixing) or `appendix` (low confidence / judgement call).

- **Zero findings** — go to §6.
- **Fix every `primary` finding.** Group by file (definitions before importers). Per group,
  strictly sequentially: dispatch a fix agent (Implementer template, fix mode) that **stages but
  does not commit**. **Review the staged diff yourself** — (a) finding actually resolved, (b) no
  new bug (re-check empty collections, null/undefined, fallbacks the fix may have defeated),
  (c) nothing out of scope — then commit `fix(review): <file> — <ids>`.
- **Leave `appendix` findings unfixed** but list them in the final report.
- A finding that needs a refactor beyond its scope: don't force it — mark it *deferred* and list
  it in the report.

Then **re-run §4**.

## 6. Finish

The loop ends with **verified commits on the current branch, not pushed** (pushing `main`
deploys). Do not create branches or PRs.

**Final report to the user:**

- What was implemented, per task, with commit SHAs.
- What the per-task reviews caught and fixed.
- Change review: primary findings fixed (by id), appendix findings **not** fixed (id + one line
  each), anything deferred.
- Final test / lint / build status.
- Every assumption made.
- The next command, e.g. `git push` to deploy, or `npm run dev` to try it.

---

## Escape hatch

If after reading the code the work needs genuine design decisions or 5+ tasks, **stop and say
so**. `AskUserQuestion`: proceed anyway / plan it properly first / narrow the scope. This is about
**size, not uncertainty** — a handful of ambiguities is just §0b doing its job.

## Subagent dispatch templates

### Implementer (also the fix agent)

```
Agent(general-purpose, model=implModel):
  description: "Implement <task-id>: <title>"
  prompt:
    You are implementing ONE task, working directly in this repo on the current branch (cwd).
    Earlier tasks (if any) are ALREADY COMMITTED — build on them. Do not create branches.

    ## Task
    <task title + what to do, verbatim>

    ## Acceptance criteria
    <the §0 criteria relevant to this task, verbatim>

    ## Context / where this fits
    <one paragraph: the change, what prior tasks landed, files involved, local conventions,
     relevant data shapes/API responses you already verified, paths to leave unstaged>

    ## If this is a FIX dispatch, also:
    REVIEW FEEDBACK to address — do exactly this, nothing more; fix ALL of it in one pass:
    <both finding sets inline>

    ## Before you begin
    If something is genuinely ambiguous and you CANNOT resolve it from the repo, STOP and
    return it as a question — do NOT guess.

    ## Your job
    1. Implement exactly what's specified — read neighbouring files first; follow conventions.
    2. Write/extend Vitest tests. Run `npx vitest run <file>`, then `npm run test`,
       `npm run lint` and `npm run build`. All must pass.
    3. Commit the specific paths you changed (`git add <paths>`, then `git commit`). Do NOT push.
       [FIX-AGENT VARIANT in §5: STAGE only, do NOT commit — the conductor reviews and commits.]
    4. Self-review with fresh eyes: completeness, quality, no overbuild, tests verify behaviour.
       Fix what you find before reporting.

    ## Report
    What you implemented, tests + results, files changed, commit SHA, self-review findings,
    concerns or blocking questions.
```

### Spec-compliance reviewer

```
Agent(general-purpose, model=sonnet):
  description: "Spec review <task-id>"
  prompt:
    Verify an implementation matches what was asked — no more, no less. Read-only: do not edit.

    ## What was requested
    <the §0 acceptance criteria, verbatim>

    ## What the implementer claims
    <implementer's report>

    ## Do NOT trust the report. Verify against the ACTUAL code.
    Read `git diff <task parent>..HEAD` and the touched files. Where the criteria concern data
    output, run the code/build and inspect the output. Check:
    - Missing: requested but not implemented, or claimed-but-absent.
    - Extra: built but not requested, including anything the criteria put out of scope.
    - Misunderstood: right problem, wrong interpretation.
    Earlier tasks are committed — don't flag a dependency that legitimately exists in the tree.

    Report: ✅ spec compliant, OR ❌ with a specific list (file:line, what's missing/extra/wrong).
```

### Code-quality reviewer (runs in PARALLEL with the spec reviewer)

```
Agent(general-purpose, model=sonnet|haiku):
  description: "Code review <task-id>"
  prompt:
    Code-review this task's committed change for QUALITY only — a separate reviewer owns spec
    conformance. Read-only: do not edit. Read `git diff <task parent>..HEAD` and the surrounding
    files. Report ONLY clear, high-impact issues; skip nitpicks and anything tsc/ESLint catches.

    Lenses for this repo:
    - React 19: needless re-renders (unstable props, bad hook deps), conditional hooks, effects
      that should be derived state, missing keys, inaccessible controls (buttons vs divs, labels).
    - Zustand: selectors returning fresh objects/arrays each call (infinite re-render risk — use
      stable empty constants like EMPTY_SERIES); persisted state shape changes without a
      `version` bump + `migrate`; ephemeral fetched data leaking into `partialize`.
    - Styling: Tailwind 4 + the existing CSS variables (`var(--color-*)`, `font-display`);
      reimplemented tokens or inconsistent patterns vs neighbouring components; mobile layout.
    - Data pipeline: prior season archives must stay immutable; provisional vs official handling;
      anything needed at deploy time must work WITHOUT credentials (CI only builds);
      `import.meta.env.BASE_URL` for asset paths; cache-busting of mutable JSON.
    - Types: `any`, unsafe casts, `!` on nullable, duplicated types that should be shared
      between `scripts/` and `src/`.
    - Errors: empty catch that hides real failures, unhandled promise rejections, missing
      loading/error UI for fetches.
    - Tests: new logic without Vitest coverage; tests asserting implementation details or mocks
      instead of behaviour.

    Report: Strengths, Issues (Critical / Important / Minor with file:line + suggestion),
    Assessment (approved / needs fixes).
```

### Change reviewer (§5)

```
Agent(general-purpose, model=opus):
  description: "Review whole change"
  prompt:
    Review the whole change `git diff <BASE>..HEAD` in this repo for correctness bugs and
    significant quality problems. Read-only: do not edit. You are the only reviewer who sees all
    tasks together — focus on cross-file/cross-task coupling: type/shape mismatches between
    producer and consumer, paths that differ between dev and build, behaviour on empty or
    missing data, and regressions to existing pages.

    ## What was requested
    <the §0 acceptance criteria, verbatim>

    Verify each suspected issue against the code (and by running it where cheap) before
    reporting. For each finding give: id (F1, F2…), tier (`primary` = confident and worth fixing
    / `appendix` = low confidence or judgement call), severity (critical/warning/info),
    file:line, the concrete failure scenario, and a suggested resolution.
    Report "no findings" explicitly if there are none.
```

## Constraints

- **No artifact gates — but ask freely** whenever a wrong guess would cost more than the question.
- **Never answer a user decision on their behalf** to keep the loop moving.
- **Sequential edits, parallel reviews.**
- **Both per-task reviews clean** before a task is done.
- **Primary findings fixed; appendix findings reported.**
- **Review every §5 fix before committing it.**
- **Current branch only; commit every task; never push unless asked.**
- **Model tiers:** implementation `sonnet` (`opus` if hard); reviews `sonnet` (`haiku` if
  trivial); change review `opus`.
- **Scope discipline:** tech debt found along the way goes in the report, not extra commits.
- Never give effort estimates in units of time.
