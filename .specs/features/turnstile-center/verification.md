# Turnstile centralizado verification

**Verdict**: PASS
**Profile**: light
**Diff range**: ffa54ac..679adee
**Round**: 1 - full
**Verifier**: independent sub-agent (author != verifier)

Inputs: `checks.md` (Profile: light, 1 check; no `plan.md`, the Intent stands in), the diff
`ffa54ac..679adee` (one commit, `679adee fix(auth): center the turnstile widget in the sign-up form`),
and `@marsidev/react-turnstile@1.6.1` `dist/index.js` (the component that renders the container).

## Binding sources

No binding source: the feature has no `plan.md` and `checks.md` names none. The Intent cites a user
report from staging, not a design artifact.

## Checks

| Check | Claim | Proof run | Evidence | Result |
| --- | --- | --- | --- | --- |
| C1 | on `/register` with a site key, at the default desktop viewport, the center of the 300 px box the Turnstile script renders into its container is within 1 px of the form's center | `E2E_BASE_URL=http://localhost:5199 pnpm --filter @bens/web exec playwright test e2e/signup-gates.spec.ts -g "centers the turnstile widget"` at 679adee exit 0 - `✓ [chromium] › e2e/signup-gates.spec.ts:43:3 › signup gates › centers the turnstile widget`, 1 passed | `apps/web/e2e/signup-gates.spec.ts:82` - `expect(Math.abs(box.x + box.width / 2 - (form.x + form.width / 2))).toBeLessThanOrEqual(1)`; guard `apps/web/e2e/signup-gates.spec.ts:81` - `expect(form.width).toBeGreaterThan(box.width + 20)` (the form is wider than the box, so centering is not satisfied trivially) | PASS |

The test exists (`rg`: `apps/web/e2e/signup-gates.spec.ts:43` `test('centers the turnstile widget', ...)`),
ran individually, and was added by this diff. The fix sits at
`apps/web/src/routes/(auth)/register.tsx:127` - `className="flex justify-center"` on `<Turnstile>`.

**Level and representativeness of the stub.** The proof is an end-to-end browser test measuring real
layout (`boundingBox`) against the real route, which is the right level for a layout claim. The API
(`/api/v1/me` 401, `/api/public/signup-config`) and Cloudflare's `api.js` are stubbed; the stub's
`render(container)` appends a 300x65 `div` to the container. That represents the real widget:
in `@marsidev/react-turnstile@1.6.1` the container is `s(c,{ref:z,as:A,id:W,style:{...L,...k},...N})`,
where `L` is `{}` when `options.size` is unset (as here) and `N` carries the rest props including
`className` - so the container is a full-width block `div` that receives `flex justify-center`, and
Cloudflare's `turnstile.render(container, ...)` injects its widget (300x65 for `size: normal`, the
default) as a child of that container, exactly where the stub puts its box. The stub also uses
`window.onloadTurnstileCallback`, the library's default onload name (`f=\`onloadTurnstileCallback\``),
so the real component path runs. Residual, not a finding: the real widget also injects a hidden
`cf-turnstile-response` input into the container; hidden inputs generate no box and do not affect
flex centering.

## Coverage

Not recomputed (Profile: light). The author's row `widget position (1) -> C1` matches the single
claim.

## Faults injected

Not required under `light`; one was run anyway because the brief asked for it.

| Mutation | Location | Killed |
| --- | --- | --- |
| removed `className="flex justify-center"` from `<Turnstile>` | `apps/web/src/routes/(auth)/register.tsx:127` | yes - C1 failed at `signup-gates.spec.ts:82`: `Expected: <= 1, Received: 26` (26 px center offset) |

The mutation was applied to the real tree with the dev server running, then reverted with
`git checkout -- 'apps/web/src/routes/(auth)/register.tsx'`; `git status --porcelain` matched the
empty baseline afterwards, and `apps/web/test-results` was removed.

## Swept existing

- dependency failure: `requires the turnstile token` exists at `apps/web/e2e/signup-gates.spec.ts:85`;
  the constraint it cites is in the code: `register.tsx:65` `const waitingForToken = siteKey !== null && token === undefined`
  and `register.tsx:133` `disabled={isSubmitting || waitingForToken}`. Unchanged by this diff.
- All other rows are `n/a` (user-approved policy).

## Gate

`pnpm --filter @bens/web exec playwright test e2e/signup-gates.spec.ts -g "centers the turnstile widget"`
at 679adee - 1 passed, 0 failed. The full e2e suite runs in CI: run 36046068258 (CI, headSha
679adee) was `in_progress` at the time of this report; the previous CI run (36043526763) and the
Deploy run succeeded. The repo gate (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`) was
not re-run by the Verifier.
