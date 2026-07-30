# Testing

Two distinct stacks: **Jest** for unit tests inside `packages/core`, **Vitest** for the PocketIC
e2e suite in `e2e/node`. They do not share config; don't copy idioms between them.

## Unit tests (Jest)

Tests are colocated with sources as `src/**/*.test.ts`. Config is `packages/core/jest.config.mjs`
extending `jest.config.base.js`; `rootDir` is the repo root.

`jest.config.mjs` defines one Jest **project** per module — `agent`, `candid`, `identity`,
`identity/secp256k1`, `principal` — each rooted at its own directory with the `#*` aliases mapped via
`moduleNameMapper`. Consequences worth knowing:

- The **`agent` project runs with fake timers enabled globally**. Anything involving polling,
  backoff, expiry, or `syncTime` must advance timers explicitly; a bare `await` on a delayed promise
  will hang. Other projects use real timers.
- A new top-level module directory needs a `getProjectConfig(...)` entry, or its tests are silently
  never run.

```bash
pnpm -F @icp-sdk/core test                              # all projects (pretest runs a build)
pnpm -F @icp-sdk/core test agent/certificate            # path substring, relative to repo root
pnpm -F @icp-sdk/core test --selectProjects agent
pnpm -F @icp-sdk/core test:coverage                     # what CI runs
```

Coverage thresholds are enforced globally by `test:coverage`: statements 70, branches 65,
functions 60, lines 70.

The base config transforms `@noble/*`, `@scure/*`, `jsdom` and friends through esbuild
(`jest.esm-transform.cjs`) because they are pure ESM. Adding a pure-ESM dependency generally means
extending `transformIgnorePatterns` in `jest.config.base.js`.

### Snapshots and golden data

`__snapshots__/` directories cover error message formatting, HTTP request shapes, and status
responses. Error text is therefore part of the tested contract — update snapshots deliberately, not
reflexively.

Fixed test vectors live in `src/agent/agent/http/__certificates__/goldenCertificates.ts` and
`src/agent/bin/with_subnet_key.bin`; the `__certificates__` directory is lint-excluded.

## E2E tests (Vitest + PocketIC)

`e2e/node` runs the built package (`@icp-sdk/core` is a `workspace:*` dependency), so **`pnpm build`
first**. Vitest typechecking is enabled, and `testTimeout` is 100s.

```bash
pnpm build
pnpm -F @e2e/node rebuild @dfinity/pic                # once: fetch the PocketIC binary
pnpm -F @e2e/node e2e
pnpm -F @e2e/node e2e run basic/counter               # single suite
```

The binary fetch is a separate step because `.npmrc` sets `ignore-scripts=true`.

`global-setup.ts` starts a `PocketIcServer`, installs the canisters from `canisters/*.wasm`, opens an
HTTP gateway, and writes `e2e/node/.env` with `GATEWAY_PORT`, `SERVER_URL`, and canister IDs. On
startup it will **reuse an already-running instance** if that `.env` exists and the gateway answers
`/api/v2/status`; a stale `.env` pointing at a dead server is detected and replaced, but a stale
`.env` pointing at a *live* server with different canisters is not — delete `e2e/node/.env` if
results look impossible.

`test-setup.ts` makes `global.crypto` writable (injecting Node's `subtle`) and registers Vitest
equality testers for `Principal` and `Uint8Array`, so `expect(principalA).toEqual(principalB)`
compares by value.

Helpers: `utils/agent.ts` (`makeAgent`, which sets `shouldFetchRootKey: true` since PocketIC has its
own root key), `utils/identity.ts` (incl. BLS signing for hand-built certificates), `utils/tree.ts`
(hash-tree builders), and `utils/mock-replica.ts` — an Express-based fake replica used to test
protocol-level edge cases that PocketIC can't produce.

Test canisters are Motoko (`counter.mo`, `trap.mo`) with checked-in `.wasm` and generated
declarations under `canisters/declarations/`. Rebuilding them requires the Motoko toolchain; the
`.wasm` files are committed so the suite runs without it. `prettier-plugin-motoko` formats the `.mo`
sources.

## MITM tests

`basic/mitm.test.ts` is excluded from the normal run and uses `vitest.config.mitm.ts`. It requires
PocketIC on a fixed port plus `mitmdump` in front of it, rewriting response bodies and stripping
`Transfer-Encoding` to exercise tampering detection. Reproduce the CI setup from
`.github/workflows/mitm.yml`:

```bash
cd e2e/node
npx tsx setup-pic.ts --gateway-port 4943 &
npx tsx setup-pic.ts --wait
mitmdump -p 8888 --mode reverse:http://localhost:4943 \
  --modify-headers '/~s/Transfer-Encoding/' --modify-body '/~s/Hello/Hullo' &
pnpm -F @e2e/node mitm
```

## What CI gates a PR on

`unit-tests` (coverage, Node 20/22/24) · `e2e-tests` (Node 20/22/24) · `mitm` (Node 20/22/24) ·
`lint` (`pnpm lint` + `pnpm build` + `pnpm typecheck`) · `prettier` · `size-limit` ·
`conventional-commits` (PR title) · `docs` (docs site compiles).

There is no test suite for `packages/migrate`; changes there are covered only by `typecheck` and lint.
