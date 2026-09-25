# Button pointer verification

**Verdict**: PASS
**Profile**: light
**Diff range**: c8b9072..060b515d535fd27531fa8c307c428c49cd97888f
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

## Checks

Proofs run at `060b515` from `apps/web` in one invocation against the running dev stack
(`http://localhost:3000/login` -> 200): `pnpm exec playwright test e2e/buttons.spec.ts` - exit 0,
`2 passed (1.5s)`, each test listed individually as passed (`buttons.spec.ts:6:3`,
`buttons.spec.ts:19:3`). Both tests exist in the tree (`grep -n` hits at
`apps/web/e2e/buttons.spec.ts:6` and `:19`) and are new in this diff (commit `060b515`), so the
proofs resolve to tests the feature touched.

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | every visible enabled `button` on `/login` and `/register` has `cursor: pointer`, at least one per page | `pnpm exec playwright test e2e/buttons.spec.ts` - "shows a pointer on every enabled button" passed | `apps/web/e2e/buttons.spec.ts:15` - `expect(new Set(cursors), path).toEqual(new Set(['pointer']))`; non-empty guard at `:14` - `expect(cursors.length, path).toBeGreaterThan(0)`; loop over `['/login', '/register']` at `:7` | PASS |
| C2 | a disabled `button` keeps `cursor: default` | same invocation - "keeps the default cursor on a disabled button" passed | `apps/web/e2e/buttons.spec.ts:30` - `expect(await page.locator('#disabled-probe').evaluate(cursorOf)).toBe('default')`; precondition at `:29` - `await expect(page.locator('#disabled-probe')).toBeDisabled()` | PASS |

**Level and sampling.** A computed-style claim is settled only in a real browser, and both proofs
run in Chromium against the real stylesheet served by Vite: the level is right. C1 samples two pages
with a `:visible:not(:disabled)` locator and a non-empty guard, so an empty set cannot pass; the rule
is a global element selector in `@layer base` (`apps/web/src/styles.css:141-145`), so two pages are a
sufficient sample for a selector that does not depend on the page. C2 uses a synthetic bare
`<button disabled>` appended to `/login` rather than a disabled Base UI `Button` from the app; that
is adequate because the rule targets the `button` element and the synthetic probe is exactly the
element the `:not(:disabled)` exclusion is about.

**Does C2 discriminate?** The author flagged that C2 already passed before the rule existed. Tested,
not reasoned: in a scratch `git worktree` at `060b515`, the selector `button:not(:disabled),` was
changed to `button,` and a separate Vite dev server was started from the scratch on port 3100
(confirmed serving `button, [role="button"]:not(...) { cursor: pointer; }`). Running the same spec
with `E2E_BASE_URL=http://localhost:3100`: C2 FAILED (`Expected: "default"`, `Received: "pointer"`
at `buttons.spec.ts:30`), C1 passed. So C2 does catch the removal of `:not(:disabled)`; its passing
before the rule existed is expected (the pre-rule state also satisfies "disabled keeps default") and
is not a sign of a vacuous assertion. No precision gap.

**Not covered, noted (not a check failure).** The rule's second selector,
`[role="button"]:not([aria-disabled="true"])`, has no check: neither C1 (locator is `button`) nor C2
exercises a non-`button` element with `role="button"`, enabled or `aria-disabled="true"`. The Intent
and the checks only promise buttons (Base UI `Button` and bare `<button>`), so this is extra behaviour
without a proof, not an unmet claim.

## Coverage

Light profile: the `Coverage` join is not recomputed. The checks' table names button states (2:
enabled C1, disabled C2) and pages sampled (2: `/login`, `/register`, both C1); each member resolves
to a located assertion above.

## Faults injected

Not required under `light`; run to settle the author's question about C2 and recorded for
completeness. Scratch worktree removed afterwards; the real tree's `git status --porcelain` was empty
before and after (only this report added).

| Mutation | Location | Killed |
| --- | --- | --- |
| selector `button:not(:disabled)` -> `button` | `apps/web/src/styles.css:141` | yes - C2 failed (`pointer` != `default`) |
| cursor rule removed entirely | `apps/web/src/styles.css:140-145` | yes - C1 failed (set of cursors != `{pointer}`) |

## Swept

Re-read against the code. Every row is `n/a` (approved policy) except `state transitions: C2
(disabled vs enabled)`, which resolves to the `:not(:disabled)` exclusion at
`apps/web/src/styles.css:141` and is proven by C2 (and shown discriminating above). No `existing`
rows to check.

## Gate

`pnpm lint && pnpm typecheck && pnpm test && pnpm build` from the repo root at `060b515` - exit 0.
Lint: Biome checked 187 files, no fixes. Typecheck: clean. Test: 38 test files, 393 passed, 0 failed
(`apps/server` vitest; `apps/web` has no unit `test` script). Build: `apps/web` built.
