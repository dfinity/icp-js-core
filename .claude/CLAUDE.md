# CLAUDE.md

## Project Overview

`icp-js-core` is the monorepo for `@icp-sdk/core`, the official JavaScript/TypeScript SDK for the
Internet Computer Protocol (ICP). It is the JS counterpart to Rust's `agent-rs`: an agent that
signs, submits, and verifies ICP requests, plus Candid serialization, identities, and principals.

The published package has **no root export** — `packages/core/src/index.ts` deliberately throws.
Everything is reached through subpath exports (`@icp-sdk/core/agent`, `/candid`, `/identity`,
`/identity/secp256k1`, `/principal`, `/agent/canister-env`).

## Essential Commands

```bash
pnpm install                              # pnpm only; npm is blocked via engines
pnpm build                                # builds every workspace package (core, migrate, e2e, docs)
pnpm test                                 # unit tests (core only); runs a build first via pretest
pnpm typecheck                            # tsc --noEmit across core, migrate, e2e
pnpm lint                                 # eslint; pnpm lint:fix to autofix
pnpm prettier:format                      # format files changed vs main
pnpm size                                 # bundle-size budgets (enforced on PRs); needs pnpm bundle
pnpm attw                                 # validates published type resolution (are-the-types-wrong)

# Targeted tests
pnpm test agent/certificate.test.ts
pnpm e2e run basic.test.ts  # requires pnpm build
```

Node version is pinned by `.node-version` (24); CI runs the matrix 20/22/24. Use `corepack enable`
to get the pinned pnpm.

See `.claude/testing.md` for the test topology, running subsets, and the PocketIC / mitm e2e setup.

Release and publishing steps live in `.github/CONTRIBUTING.md`.

## Workspace Structure

- **`packages/core`** — the `@icp-sdk/core` library. Four modules under `src/`, mapping 1:1 onto the
  subpath exports: `principal`, `candid`, `agent`, `identity` (plus `agent/canister-env`).
- **`packages/migrate`** — `@icp-sdk/core-migrate`, a codemod CLI rewriting `@dfinity/agent`-era
  imports to `@icp-sdk/core`. Versioned and released separately. No tests.
- **`e2e/node`** — Vitest e2e suite driven by PocketIC, with Motoko test canisters and a mock replica.
- **`docs`** — TypeDoc-generated API reference plus hand-written `.mdx` guides, published to the
  separate `dfinity/icp-js-sdk-docs` repo.

## Architecture

Dependency direction between core's modules is strictly one-way:
`principal` ← `candid` ← `agent` ← `identity`. The `Identity` interface itself lives in
`agent/auth.ts`, so `agent` never imports `identity`.

Each module's `index.ts` barrel is both the public API surface and a TypeDoc entry point
(`docs/typedoc.json`) — anything exported there is public and requires JSDoc.

### `principal/`

`Principal` — an ICP principal, stored as bytes, rendered as base32-with-CRC32 text. Also exports
`base32Encode`/`base32Decode`, `getCrc32`. Depends on nothing else in the package.

Per repo convention, code holds the byte encoding but comments/docs use the text encoding.

### `candid/`

- `idl.ts` (~2.6k lines) — the `IDL` namespace: type constructors (`IDL.Record`, `IDL.Variant`,
  `IDL.Text`, …), `IDL.encode`/`IDL.decode`, and the visitor machinery in `candid-core.ts`.
  Analogous to Rust's `candid` crate, but a *runtime* type system — type descriptors are values you
  build and pass around, not derive macros.
- `candid-ui.ts` — renders an IDL type into form/UI descriptors.
- `utils/` — `PipeArrayBuffer` (the read/write cursor used throughout de/serialization), LEB128
  codecs, the Candid field-name hash, byte helpers.

### HttpAgent

- `agent/api.ts` — the `Agent` interface (`call`, `update`, `query`, `readState`, `status`,
  `fetchRootKey`, `getPrincipal`, optional `invalidateIdentity`/`replaceIdentity`) and its request and
  response types.
- `agent/http/index.ts` (~1.8k lines) — `HttpAgent`, the only real implementation. Construct with
  `HttpAgent.create()` (async; honours `shouldFetchRootKey`/`shouldSyncTime`) or `createSync()`.
  Owns host resolution (`determineHost`), the hard-coded mainnet `IC_ROOT_KEY`, retry/backoff,
  query-signature verification against cached subnet node keys, clock-drift tracking (`syncTime`,
  `getTimeDiffMsecs`), and the request transform pipeline.
- `agent/actor.ts` is the ergonomic layer: `Actor.createActor(idlFactory, config)` builds a typed
  `ActorSubclass` whose methods encode/decode Candid and dispatch through the agent.

### `identity/`

Implementations of the `SignIdentity`/`Identity` contract from `agent/auth.ts`:

- `ed25519.ts`, `ecdsa.ts` (WebCrypto), `webauthn.ts`, and `secp256k1/` — a separate subpath export
  because it pulls in `@scure/bip32`/`bip39` and a larger curve implementation.
- `delegation.ts` — `DelegationChain`/`DelegationIdentity`, including the `permissions` field wired
  through in v6. Normally produced by the separate `@icp-sdk/auth` package.
- `partial.ts` — a public-key-only identity that cannot sign.
- `attributes.ts` — `AttributesIdentity`, a decorator injecting signed `sender_info` into request
  content before the inner identity signs (skipped for `read_state`).

### Build outputs

`packages/core` emits two trees from one source: `lib/esm` (`tsconfig.build.json`) and `lib/cjs`
(`tsconfig.cjs.json`, `module: commonjs`), with `tsc-alias` rewriting the `#*` aliases in both and
`src/package.json` (`{"type":"module","sideEffects":false}`) copied into `lib/esm`. `pnpm bundle`
additionally produces browser bundles in `dist/`, which is what `size-limit` measures. `pnpm attw`
verifies the dual-format `exports` map resolves correctly for consumers.

## Important Constraints

### Imports

- **Cross-module** imports use the aliases `#agent`, `#candid`, `#identity`, `#principal`, resolving
  to that module's `index.ts` barrel.
- **Intra-module** imports are relative and carry an explicit `.ts` extension (`./errors.ts`) —
  `rewriteRelativeImportExtensions` strips it at build time.
- Adding a new alias means touching `packages/core/tsconfig.json`, `tsconfig.build.json` (`paths`),
  and `jest.config.mjs` (`moduleNameMapper`). The aliases are *not* declared in `package.json`
  `imports`; `tsc-alias` rewrites them to relative paths after `tsc`.

### Bundle size is a hard budget

Root `package.json` declares per-subpath `size-limit` entries (e.g. `/agent` ≤ 55 kb, `/principal`
≤ 5 kb, root ≤ 100 b) and CI fails PRs that exceed them. A cross-module import
that drags a barrel file into a small module will break this; a new dependency must be justified
for the limits to be raised.

### Bytes are `Uint8Array`

Never use Node's `Buffer` in library code. Byte helpers come from `@noble/hashes/utils.js`
(`bytesToHex`, `hexToBytes`, `utf8ToBytes`, `concatBytes`) plus local `uint8Equals`,
`uint8FromBufLike`, `PipeArrayBuffer`. For code that interacts with crypto, always use `Uint8ArrayBuffer`
as the backing type, always declare it explicitly in return types, and always convert parameters
explicitly with `slice()` (never cast).

### Error handling

Errors use a two-axis system: an **`ErrorKind`** (`TrustError`, `ProtocolError`, `RejectError`,
`TransportError`, `ExternalError`, `LimitError`, `InputError`, `UnknownError`) wrapping a specific
**`ErrorCode`**. Always throw via `Kind.fromCode(...)`:

```ts
throw InputError.fromCode(new CborEncodeErrorCode(error, value));
```

- Every distinct failure gets its own `ErrorCode` subclass in `agent/errors.ts` (~50 of them), with a
  `name` field, an `Object.setPrototypeOf(this, X.prototype)` call in the constructor, and a
  `toErrorMessage()`. Carry the offending value in a readonly field rather than pre-formatting it.
- Don't throw bare `Error` from library code, and don't add generic catch-all codes.
- `AgentError` overrides `cause` as `{ code, kind }`, and exposes `hasCode(SomeErrorCode)` for
  narrowing plus `isCertified` — whether the failure was proven by a verified certificate, the
  security-relevant distinction.
- `ErrorCode` can carry `requestContext` and `callContext`, which `toString()` renders. Binary fields
  are hex-encoded, with large ones (`arg`, `certificate`, `nonce`) elided unless
  `ErrorCode.verbosity = ErrorVerbosity.Verbose`.
- Error message text is covered by Jest snapshots — changes there are intentional, not incidental.

### Style rules enforced by lint

- JSDoc is required on every exported declaration (`jsdoc/require-jsdoc` with `publicOnly`).
- `import type` for type-only imports (`consistent-type-imports`); `interface` over `type` for object
  shapes (`consistent-type-definitions`).
- `console.log` is banned outside `packages/migrate` (only `warn`/`error` allowed); the agent's own
  diagnostics go through `ObservableLog`.
- When code is ready to push, run `pnpm prettier:format`, as `pnpm prettier:check` is checked in CI

### Supply-chain hardening

`pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` (7 days), so a just-published dependency
version will refuse to install — pin an older one or add it to `minimumReleaseAgeExclude`. `.npmrc`
sets `ignore-scripts=true`.

### Versioning and releases

Conventional Commits are mandatory (PR titles are checked in CI). The changelog and the version in
`packages/core/package.json` are produced by commitizen in the release workflow — never hand-edit
either. Root `package.json`'s `version` field is vestigial and drifts from the released version;
ignore it.

## Cross-repo relationships

- `ic-agent` (`dfinity/agent-rs`) (Rust) — the reference implementation; the certificate, hash tree, and error taxonomy
  deliberately mirror it.
- `@icp-sdk/auth` (`dfinity/icp-js-auth`) — produces `DelegationIdentity` for browser auth flows.
- `dfinity/icp-js-sdk-docs` — receives the built docs via the release workflow.
- `@dfinity/cbor` (`dfinity/cbor-js`), `@dfinity/pic` (`dfinity/pic-js`) (PocketIC bindings) — DFINITY-owned
  dependencies, excluded from `minimumReleaseAge`.
- `@icp-sdk/canisters` (`dfinity/icp-js-canisters`) — actors and bindings for known canisters (management canister, NNS, SNS, CMC, ICP ledger, ICRC-1, ckBTC/ckETH)
