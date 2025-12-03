# Changelog

## [Unreleased]

- feat(core)!: removes `@dfinity/{agent,candid,identity,identity-secp256k1,principal}` peer dependencies and moves their source code to the `@icp-sdk/core` package
- feat(agent)!: use `/api/v4` for call requests
  - Renames `v3ResponseBody` to `v4ResponseBody`
  - Renames `isV3ResponseBody` to `isV4ResponseBody`
  - Renames `HttpV3ApiNotSupportedErrorCode` to `HttpV4ApiNotSupportedErrorCode`
- feat(assets)!: replaces `@dfinity/{agent,candid,principal}` deps with `@icp-sdk/core`
- feat(assets)!: drops support for cjs for the `@dfinity/assets` package
- feat(auth-client)!: `@dfinity/auth-client` has been deprecated. Migrate to [`@icp-sdk/auth`](https://js.icp.build/auth/latest/upgrading/v4)
- feat(agent): lookup canister ranges using the `/canister_ranges/<subnet_id>/<ranges>` certificate path
- feat(agent): introduce the `getSubnetIdFromCanister` and `readSubnetState` methods in the `HttpAgent` class
- refactor(agent): only declare IC URLs once in the `HttpAgent` class
- refactor(agent): split inner logic of `check_canister_ranges` into functions
- test(principal): remove unneeded dependency

## [4.2.3] - 2025-11-19

- docs: fix next button link in guide pages

## [4.2.2] - 2025-11-10

- fix(agent): use minute precision when rounded expiry is at least 60s in future

## [4.2.1] - 2025-10-24

## [4.2.0] - 2025-10-22

- feat(agent): (_experimental_) introduce the `getCanisterEnv` and `safeGetCanisterEnv` functions to load the canister environment from the `ic_env` cookie. See the [Canister Environment guide](https://js.icp.build/core/v4.2/canister-environment/) for more details.

## [4.1.1] - 2025-10-21

- fix(agent): remove exported `CanisterInstallMode` type

## [4.1.0] - 2025-10-13

- feat(principal): export the `base32Encode` and `base32Decode` functions

## [4.0.5] - 2025-09-30

- fix(candid): recursive type table merging preserves concrete type mapping
- fix(identity): handle ArrayBuffer in delegation chain serialization

## [4.0.4] - 2025-09-18

- fix(agent): create a fresh default polling strategy per request.
- fix(agent): remove the unused `PollStrategyFactory` type.
- fix(agent): remove the `nonce` from the `ActorConfig` type. This field must be used through the `CallConfig` type instead.

## [4.0.3] - 2025-09-16

- fix(identity): expose all the exported elements from the `ed25519` module.
- ci: add provenance to the published packages on NPM.
- docs(identity-secp256k1): update the submodule name in the README.
- docs: push markdown files to the docs site.

## [4.0.2] - 2025-09-02

- fix(agent): use the `effectiveCanisterId` (if provided) instead of the `canisterId` to verify the certificate of an update call.

## [4.0.1] - 2025-08-26

- fix(candid): avoid removing shared knot types when multiple `Rec()`s are present in the same struct.

## [4.0.0] - 2025-08-22

Publishes the new `@icp-sdk/core` package.

This package unifies the following packages:

- `@dfinity/agent`
- `@dfinity/candid`
- `@dfinity/identity`
- `@dfinity/identity-secp256k1`
- `@dfinity/principal`

and re-exports them as `@icp-sdk/core/*` submodules.

The `@icp-sdk/core` package does not contain any other changes.

See the [upgrading guide](https://js.icp.build/core/latest/upgrading/v4/) for more information.

### Deprecated

- `@dfinity/use-auth-client`: this package has been deprecated. We recommend using one of the following alternatives:
  - [ic-use-internet-identity](https://www.npmjs.com/package/ic-use-internet-identity)
  - [@ic-reactor/react](https://www.npmjs.com/package/@ic-reactor/react)

## [3.2.2] - 2025-08-21

- fix: add `bigint` to the `JsonValue` types in `@dfinity/candid`.

## [3.2.1] - 2025-08-12

- fix: export the `GenericIdlFuncArgs`, `GenericIdlFuncRets`, and `GenericIdlServiceFields` types from `@dfinity/candid`.

## [3.2.0] - 2025-08-07

- fix: do not subtract the replica permitted clock drift when calculating the ingress expiry.
- fix: pick the expiry rounding strategy based on the delta, without adding the clock drift to the delta.
- feat: adds a `clockDriftMs` optional parameter to `Expiry.fromDeltaInMilliseconds` to add to the current time, typically used to specify the clock drift between the IC network clock and the client's clock.
- fix: add declaration maps and typescript source code to published packages.
- feat: enables type inference for the arguments and return types of `FuncClass`.
- feat: enables type inference for the fields of `ServiceClass`.
- fix: perform the canister range checks unconditionally for delegations when constructing a `Certificate` instance.
- fix: account for clock drift when verifying the certificate freshness, and syncs time with the IC network if the certificate fails the freshness check and the agent's time is not already synced.
- feat: adds the `agent` optional field to the `CreateCertificateOptions` interface, which is used to sync time with the IC network if the certificate fails the freshness check, if provided.
- feat: adds the `getTimeDiffMsecs` method to the `HttpAgent` class, which returns the time difference in milliseconds between the IC network clock and the client's clock.
- feat: adds the `hasSyncedTime` method to the `HttpAgent` class, which returns `true` if the time has been synced at least once with the IC network, `false` otherwise.
- fix: use the effective canister id to delete the node keys from the local cache.
- docs: add DFINITY Starlight theme to the docs
- feat: adds the `disableCertificateTimeVerification` optional field to the `CanisterStatus.request` function argument, which allows you to control the `disableTimeVerification` option for the internal `Certificate.create` call.
- fix: avoid bigint overflow when decoding the time from the certificate.
- fix: enable certificate freshness checks for delegation certificates.
- feat: adds the `UncertifiedRejectUpdateErrorCode` error code.
- fix: changes error code to `UncertifiedRejectUpdateErrorCode` when throwing an error in v2 responses.
- fix: avoid syncing time indefinitely in case of an ingress expiry error.
- fix: throw an error with code `UncertifiedRejectUpdateErrorCode` if the reply from the update call was returned undefined and the method has no return type.

## [3.1.0] - 2025-07-24

- feat: export the `getCrc32` function from `@dfinity/principal`

## [3.0.2] - 2025-07-23

- fix: canonicalizes record and variant labels during subtype checking

## [3.0.1] - 2025-07-22

- fix: override `instanceof` in Candid IDL types to avoid issues when importing `IDL` from multiple locations.

## [3.0.0] - 2025-07-17

## [3.0.0-beta.4] - 2025-07-17

### Changed

- chore: replaces ts-node with `pnpm dlx tsx` for version management scripts
- chore: updates the version script to work with new pnpm workspaces
- feat: removes the watermark checks when checking query responses. Now the agent checks if the node signature is not older than the `ingressExpiryInMinutes` option (taking into account the clock drift).
- fix: always account for the clock drift when calculating the ingress expiry.
- fix: `AuthClient.create`'s options now have an additional `loginOptions` optional parameter, which is merged with the options passed to `login` when calling it.
- fix: handle BigInt values when instantiating the buffer in `lebEncode` and `slebEncode` from `@dfinity/candid`. As a result, `@dfinity/candid` now correctly encodes large bigints as `Nat` values.
- fix: make `.ts` extension required for all relative imports. This is required to avoid the "Module not found" error when importing the packages in Node.js (ESM).

### Added

- feat: Starlight documentation website, with custom plugin for typedoc

## [3.0.0-beta.1] - 2025-06-19

### Changed

- chore: update `@noble/*` dependencies
- fix: mark `@noble/hashes` as a dependency rather than a dev dependency

## [3.0.0-beta.0] - 2025-06-17

### Changed

- chore!: removes management canister from @dfinity/agent in favor of @dfinity/ic-management
- feat!: changes all @dfinity/candid interfaces to `Uint8Array<ArrayBuffer>` instead of `ArrayBuffer` to make the API more consistent.
- feat!: replaces `fromHex`, `toHex`, `concat` utils with `bytesToHex`, `hexToBytes`, and `concatBytes` from `@noble/hashes/utils` respectively, to take advantage of existing dependencies.
- feat!: changes polling strategy for `read_state` requests to support presigned requests. By default, `read_state` requests will create a new signature with a new ingress expiry each time they are made. However, the new `preSignReadStateRequest` will make one signature and use it for all polling requests. This is useful for hardware wallets or other external signing solutions that make signing cumbersome.
  - pollForResponse now moves `strategy`, `request`, and `preSignReadStateRequest` to the `options: PollingOptions` object
  - new export: `PollingOptions` type
  - Actor also includes a `pollingOptions` object that can be passed to the `actor` function and will be passed to the `pollForResponse` method
- feat!: removes the unused `defaultAgent` global concept and the `getDefaultAgent` function. The `HttpAgent` constructor is now the only way to create an agent.
- feat!: removes the `ProxyAgent` class.
- feat!: removes the following errors in favor of the new `AgentError`:
  - `AgentHTTPResponseError`
  - `AgentCallError`
  - `AgentQueryError`
  - `AgentReadStateError`
  - `CertificateVerificationError`
  - `ActorCallError`
  - `QueryCallRejectedError`
  - `UpdateCallRejectedError`

  The new `AgentError` error uses the `code` and `kind` props to enable a better programmatic error handling.

- feat!: refactors `Expiry` class to use static factory methods and add JSON serialization/deserialization.
- feat!: makes `lookup_path` compliant with the [IC Interface Specification](https://github.com/dfinity/portal/blob/8015a4ab50232176723ffd95e32a02f1bf7fef30/docs/references/ic-interface-spec.md?plain=1#L3069). Renames the `lookup` method of the `Certificate` class into `lookup_path`, for consistency.
- feat!: removes the `lookup_label` method from the `Certificate` class.
- feat!: replaces `hash` with `sha256` from `@noble/hashes/sha2` to take advantage of existing dependencies
- chore!: drops support for Node.js v19 or lower, and Node.js v21

- feat: replaces `borc` and `simple-cbor` with `@dfinity/cbor`.
- chore: removes unused `bs58check` dependency from `@dfinity/identity-secp256k1`
- fix: AuthClient `isAuthenticated` now correctly returns false if the delegation chain is invalid; eg: expired session
- feat: introduces the `lookup_subtree` standalone function and `Certificate` class method.
- chore: formatting files and changelog
- test: removes backwards compatibility test for `Actor` with `v1` HttpAgent due to breaking interface changes.
- fix: Check subtyping relationship when decoding function or service references
  - This means we now follow the Candid spec more closely, and reduces the risk of calling services with the wrong argument types
- fix: retry requests that fail due to a malformed response body

## [2.4.1] - 2025-04-10

### Changed

- fix: fixes a bug in Ed25519KeyIdentity `toRaw` where the output was not an ArrayBuffer
- test: fixes e2e tests for compatibility with dfx 0.26.0 and `pocket-ic` by querying for the `default_effective_canister_id` before calling the management canister
- fix: fixes a bug in the Ed25519KeyIdentity verify implementation where the argument order was incorrect
- fix: fixes a bug in the `Principal` library where the management canister id util was incorrectly importing using `fromHex`
- feat: change auth-client's default identity provider url

## [2.4.0] - 2025-03-24

### Changed

- chore: changes trap e2e test to check for the response "trapping". Resolves a discrepancy with the replica response introduced in dfx 0.25.1
- fix: Bring Candid decoding of `opt` types up to Candid spec:
  In particular, when decoding at an `opt` type:
  - If the wire type is an `opt` type, decode its payload at the expected content type
    (as before).
  - Allow decoding `null` wire type as IDL value `null` (i.e. JS `[]`).
  - Allow decoding of value of `reserved` wire type, defaulting to IDL value `null` (i.e. JS `[]`).
  - Allow decoding of wider variant type on the wire at narrower expected variant type,
    provided the decoded value is valid at the expected variant type. Otherwise, default to `null` (i.e. JS `[]`).
  - Otherwise:
    - If the expected content type is `null` or `reserved` or (nested) `opt`, return IDL value `null` (i.e. JS `[]`).
    - The expected content type is neither `null`, `reserved` or nested `opt`:
      allow decoding of the non-optioned value `v` as `opt v` (JS `[v*]`) if compatible with
      the expected content type; if incompatible, return IDL value `null` (JS `[]`).

### Added

- feat: refactor nonce logic to prioritize options and ensure compatibility with ArrayBuffer and Uint8Array
- test: added e2e test for CanisterStatus requesting a subnet path, as a reference for getting the subnet id of a given canister id

## [2.3.0] - 2025-02-07

### Added

- shouldFetchRootKey option added to `HttpAgent` constructor
- ci: adds BOT_APPROVED_FILES config

### Changed

- feat: HttpAgent uses anonymous identity to make syncTime call, which can allow readState calls to work beyond 5 minutes
- chore: bumps .nvmrc and nodejs version in CI to 22
- HttpAgent now awaits fetching rootkey before making network calls if `shouldFetchRootKey` is set
- chore: npm audit fixes
- feat: enhanced details in agent call, query, and read_state errors
  - error now includes hex encoded response, requestId, sender_pubkey, and sender_sig in addition to message for improved debugging process

## [2.2.1] - 2025-02-07

### Changed

- fix: reverts read_state polling expiry changes due to mismatched signature introduced in 2.1.3. Polling will re-use the original request as before, up to the point where the request expires

## [2.2.0] - 2024-12-12

### Added

- fix: `target_canister` is used only for `install_chunked_code` of management canister, complying with internet computer specification
- feat: Add support for effective target canister ID in management canister calls.

### Changed

- chore: pins nanoid dev dependency version to override warning
- chore: Removes warning that users found unhelpful, when a message originates from other sources than the identity provider in `AuthClient` during authentication.
- chore: fixes typo in DelegationIdentity jsdoc comment
- chore: Removes warning that users found unhelpful, when a message originates from other sources than the identity provider in `AuthClient` during authentication.
- fix: Make pollForResponse typesafe to avoid exceptions from unknown requests

## [2.1.3] - 2024-10-23

### Added

- feat: allow for setting HttpAgent ingress expiry using `ingressExpiryInMinutes` option

- feat: improved assertion options for agent errors using `prototype`, `name`, and `instanceof`

### Changed

- test: automatically deploys trap canister if it doesn't exist yet during e2e
- fix: handle v3 traps correctly, pulling the reject_code and message from the certificate in the error response like v2.
  Example trap error message:

```txt
AgentError: Call failed:
  Canister: hbrpn-74aaa-aaaaa-qaaxq-cai
  Method: Throw (update)
  "Request ID": "ae107dfd7c9be168a8ebc122d904900a95e3f15312111d9e0c08f136573c5f13"
  "Error code": "IC0406"
  "Reject code": "4"
  "Reject message": "foo"
```

- feat: the `UpdateCallRejected` error now exposes `reject_code: ReplicaRejectCode`, `reject_message: string`, and `error_code?: string` properties directly on the error object.
- fix: recalculates body to use a fresh `Expiry` when polling for `read_state` requests. This prevents the request from exceeding the `maximum_ingress_expiry` when the replica is slow to respond.

## [2.1.2] - 2024-09-30

- fix: revert https://github.com/dfinity/agent-js/pull/923 allow option to set agent replica time

## [2.1.1] - 2024-09-13

### Added

- fix: support for headers during upload with `@dfinity/assets`

## [2.1.0] - 2024-09-12

### Added

- chore: awaits prettier formatting in release automation
- feat: expose inner certificate in `Certificate` for inspection or use in raw calls. `Certificate.cert` is now a public property
- feat: allow creation of multiple Actors in `useAuthClient` by passing a record to `actorOptions` with the actor name as the key, and `CreateActorOptions` as the value
- feat: sync_call support in HttpAgent and Actor
  - Skips polling if the sync call succeeds and provides a certificate
  - Falls back to v2 api if the v3 endpoint 404's
  - Adds certificate to SubmitResponse endpoint
  - adds callSync option to `HttpAgent.call`, which defaults to `true`
- feat: management canister interface updates for schnorr signatures
- feat: ensure that identity-secp256k1 seed phrase must produce a 64 byte seed
- docs: documentation and metadata for use-auth-client
- feat: adds optional `rootKey` to `HttpAgentOptions` to allow for a custom root key to be used for verifying signatures from other networks
- chore: npm audit bumping micromatch
- feat: exports polling utilities from `@dfinity/agent` for use in other packages
  - `pollForResponse` now uses the default strategy by default
  - Updated the `bls-verify` jsdoc comment to accurately reflect that the default strategy now uses @noble/curves
- docs: clarifies meaning of `effectiveCanisterId` in `CallOptions`

### Changed

- feat: adds management canister support for canister snapshots
- feat: replaces hdkey and bip32 implementations with `@scure/bip39` and `@scure/bip32` due to vulnerability and lack of maintenance for `elliptic`
- chore: bumps dev dependency versions to remove warnings
- chore: addresses eslint errors uncovered by bumping eslint version

## [2.0.0] - 2024-07-16

### Changed

- fix: passing `request` correctly during pollForResponse `Processing` status
  - credit: [Senior Joinu](https://forum.dfinity.org/t/timestamp-failed-to-pass-the-watermark-after-retrying-the-configured-3-times/29180/11?)
- ci: removing headless browser tests pending a rewrite
- ci: changing token for creating release

### Added

- test: adding test for backwards compatibility with actor for v1 agents
- feat!: deprecate `HttpAgent` constructor in favor of new `create` and `createSync` methods.
  - `create` is async and returns a promise. It will sync time with the replica and fetch the root key if the host is not `https://icp-api.io`
  - Replaces `source` option with a `from` and `fromSync` methods, similar to `Principal.from`

## [1.4.0] - 2024-06-17

### Added

- feat!: add support for proof of absence in Certificate lookups
- feat: `update-management-idl` automation to update the management canister IDL in `@dfinity/agent`

### Changed

- fix: ObservableLog no longer extends Function and class instance can no longer be called. Fixes an issue when running in a browser extension context.
- feat!: ObservableLog's `log` method is renamed to `print` to avoind calling `log.log`.
- chore: update management canister interface with latest bitcoin features
- fix: publish script will correctly update the `package-lock.json` file with the correct dependencies when making a new release
- chore: updates agent error response to read "Gateway returns error" instead of "Server"`
- chore: updates dfinity/conventional-pr-title-action to v4.0.0
- chore: updates dfinity/conventional-pr-title-action to v3.2.0

## [1.3.0] - 2024-05-01

### Added

- docs: adds instructions on how to run unit and e2e tests to the README
- chore: adds required `npm audit` check to PRs
- new `HttpAgent` option: `backoffStrategy` - allows you to set a custom delay strategy for retries. The default is a newly exported `exponentialBackoff`, but you can pass your own function to customize the delay between retries.

### Changed

- chore: upgrades github actions to v4
- fix: retry logic now includes delays with exponential backoff matching the dfx strategy. Retries should no longer happen too quickly for the replica to catch up.

## [1.2.1] - 2024-04-25

### Added

- feat: make `IdbStorage` `get/set` methods generic
- chore: add context to errors thrown when failing to decode CBOR values.
- chore: replaces global npm install with setup-node for size-limit action

## [1.2.0] - 2024-03-25

### Added

- feat: adds support for verified queries against management canister
  - includes support for `fetch_canister_logs` in the actor provided by `getManagementCanister`
  - also includes support for bitcoin queries

Logging

```ts
// Agent should not use an anonymous identity for this call, and should ideally be a canister controller
const management = await getManagementCanister({ agent });
const logs = await management.fetch_canister_logs({ canister_id: canisterId });
```

Bitcoin

```ts
// For now, the verifyQuerySignatures option must be set to false
const agent = await makeAgent({ host: 'https://icp-api.io', verifyQuerySignatures: false });
const management = getManagementCanister({
  agent,
});

const result = await management.bitcoin_get_balance_query({
  address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  network: { mainnet: null },
  min_confirmations: [6],
});
```

### Changed

- chore: npm audit fix
- feat!: support for restricting II auth methods
  - New login option: `allowPinAuthentication?: boolean;`
  - Response from II includes `authnMethod: 'passkey' | 'pin' | 'recovery';`
  - OnSuccess now optionally passes the message directly from the IDP provider
  - Support for arbitrary login values passed to IDP through `customValues` option
- fix: pads date numbers in changelog automation. E.G. 2024-3-1 -> 2024-03-01

- feat: allow passing `DBCreateOptions` to `IdbStorage` constructor
- updated management canister interface

## [1.1.1] - 2024-03-19

- fix: work around `PublicKeyCredential` not being enumerable

## [1.1.0] - 2024-03-18

### Added

- feat: adds `fromPem` method for `identity-secp256k1`
- feat: HttpAgent tracks a watermark from the latest readState call. Queries with signatures made before the watermark will be automatically retried, and rejected if they are still behind.
- fix: remove `ArrrayBuffer` checks from `WebAuthnIdentity` to resolve issues with the Bitwarden password manager

## [1.0.1] - 2024-02-20

### Changed

- fix: `Ed25519KeyIdentity` was not generating unique identities when no seed was provided. This issue was introduced in `v0.20.0-beta.0`. If your code was affected please upgrade to `>=1.0.1`
- chore: export `AuthClientStorage` to aid with custom implementations

## [1.0.0]

### Added

- feat: new `CustomPath` class, better docs, and deprecating metadata path type for `CanisterStatus`

### Changed

- chore: npm audit fix
- fix: adds npm run build to publish script
- chore: update Management Canister interface
- feat: new `CustomPath` class, better docs, and deprecating metadata path type for `CanisterStatus`
- chore: adding new controller to snapshot for e2e canister status

## [0.21.4]

### Changed

- fix: edit to the post-release script
- fix: export partial identity from index of @dfinity/identity
- chore: npm update & bumping jest-environment-jsdom
- feat: release automation changes
- fix: distinguish remote dev environments from known hosts

## [0.21.0]

### Added

- feat: introduces `ObservableLog` to `HttpAgent`. Allows subscribers to be notified of events from the agent without sending them directly to the console
- feat: enhances `.from` methods on public key classes to support unknown types, including PublicKey instances, ArrayBuffer-like objects, DER encoded public keys, and hex strings. Also introduces a new `bufFromBufLike` util

### Changed

- chore: exporting http errors
- chore: cleaning up lint warnings
- chore: cleans up github actions linting warnings
- feat: replaces `secp256k1` npm package with `@noble/curves`
- feat: introduces partial identities from public keys for authentication flows
- fix: honor disableIdle flag
- fix: add `github.dev` and `gitpod.io` to known hosts

## [0.20.2]

### Changed

- chore: lowering prettier version for CI
- fix: restoring localhost to list of known hosts

## [0.20.1]

### Changed

- feat: retry query signature verification in case cache is stale

## [0.20.0]

### Added

- feat: uses expirable map for subnet keys in `agent-js`, with a timeout of 1 hour
- **feat!: node signature verification**
  This feature includes additional changes in support of testing and releasing the feature:
  _ Mainnet e2e tests for queries and calls
  _ published counter canister
  _ New `HttpAgent` option - `verifyQuerySignatures`. Defaults to true, but allows you to opt out of verification. Useful for testing against older replica versions
  _ Introducing `ed25519` logic to agent for validating node signatures
  _ Standardizing around `@noble/curves` instead of tweetnacl in `@dfinity/identity`
  _ new export - hashOfMap from agent, matching the naming used in the interface specification
  _ new unit tests
  _ new Verify export on ed25519 because why not
  _ Adds support for `Uint8Arrays` in `Principal.from()`
  _ feat: introduces `ExpirableMap`, a utility class that will return values up until a configured expiry
  _ chore: increases size limit for `agent-js` to allow for `Ed25519` support for node key signature verification
  _ feat!: replaces `disableNonce` feature with `useQueryNonces`. Going forward, updates will use nonces, but queries and readstate calls will not. Queries and readsatate calls will use nonces if `useQueryNonces` is set to true
  _ feat: adds subnet metrics decoding to canisterStatus for `/subnet` path
  _ feat!: sets expiry to 1 minute less than the configured expiry, and then down to the nearest second. This matches existing behaviour, but adds the rounding

### Changed

- chore: cleanup for node 20 development in `agent-js`
- fix: `canisterStatus` returns full list of controllers
- chore: replaces use of `localhost` with `127.0.0.1`for better node 18 support. Also swaps Jest for vitest, runs mitm against mainnet, and updates some packages
- feat: retry logic will catch and retry for thrown errors
- feat!: adds certificate logic to decode subnet and node key paths from the hashtree. Changes the interface for `lookup\_path` to allow returning a `HashTree`, but also constrains `lookup` response to an `ArrayBuffer` using a new `lookupResultToBuffer` export

## [0.19.3]

### Changed

- fix: `Principal` JSON is compatible with `@dfinity/utils ``jsonReviver` helper
- chore: npm audit
- feat: `Principal` class serializes to JSON
- feat: certificate checks validate that certificate time is not more than 5 minutes ahead of or behind system time.
- feat: two new `leb` decoding utils added to `@dfinity/agent/utils/leb` to make it simpler to decode leb values and time from a certificate tree
- chore: limit npm version to 9 in ci for compatibility with node 16
- Adds more helpful error message for when principal is undefined during actor creation

## [0.19.2]

### Changed

- fix: subdomains on `icp0.io` and `ic0.app` were incorrectly sending requests to `icp-api` and encountering CSP issues

## [0.19.1]

### Changed

- fix: default host logic fixed and tests added

## [0.19.0]

### Changed

- feat: replaces the `js-sha256` library with `@noble/hashes` due to a breaking bug in Chrome
- Fix: add `@dfinity/principal` as a peerDependency to `assets` and `candid`.
- Feat: `HttpAgent` now uses a default address of https://icp-api.io. Users will be warned for not setting a host, but the code will default to mainnet.
- Feat: use webcrypto or node crypto instead of Math.random for nonce generation if available

## [0.18.1]

### Changed

- fix: fix composite query in actor.ts
- fix: handle new update call errors ([IC-1462](https://github.com/dfinity/interface-spec/pull/143))
- chore: updates engines in package.json and recommended node version for development in nvmrc to support node 18+
- chore: corrections to publishing docs
- fix: typo in `JsonnableWebAuthnIdentitiy`, breaking change that requires users to update their imports to `JsonnableWebAuthnIdentity` when this type is used
- fix: fix a bug in decoding service types, when function types come after the service type in the type table
- feat: support `composite_query` in candid
- fix: fix a bug in decoding service types, when function types come after the service type in the type table
- feat: include boundary node http details to query and update calls
- feat: adds method for actor creation that includes boundary node http details

## [0.15.7]

### Changed

- Do not use `Headers` struct during init of HttpAgent for Node compatibility. Note: still supports use of Headers in application code

- fix: finish all tasks before calling onSuccess auth callback in `@dfinity/auth-client`

## [0.15.6]

### Changed

- feat: retry failed `read\_state` requests

## [0.15.5]

### Changed

- add support for WebAuthn level 3 [authenticatorAttachment](https://w3c.github.io/webauthn/#dom-publickeycredential-authenticatorattachment)

## [0.15.4]

### Changed

- removes more circular dependencies in agent, actor, proxy, and pollingstrategy
- chore: updates distro for lint and prettier checks
- removes more circular dependencies in agent, actor, proxy, and pollingstrategy
- feat: adds keyType option for `AuthClient`, allowing users to specify whether to use an `ed25519` or `ECDSAKey`. This is important for custom storage providers that can't store `CryptoKey` objects
- chore: removes a circular dependency on index for canisterStatus
- chore: documents usage of fetch and fetchOptions for `HttpAgent`

## [0.15.3]

### Changed

- reverts the `X-IC-Request-ID header` until we coordinate cors support with icx-proxy

## [0.15.2]

### Changed

- Corrects some dev dependencies incorrectly listed as dependencies in `auth-client` package.json
- introduces `X-IC-Request-ID header` to more easily identify retried requests. Also uses a standard Headers constructor to manage headers

Changes default stored key for `auth-client` to use ECDSAKey\* Also updates the storage interface types to support `CryptoKeyPair`

- updates link to `identity-secp256k1` in docs site

## [0.15.1]

### Changed

- fixes a package configuration issue with `@dfinity/identity-secp256k1`

## [0.15.0]

### Changed

- _Breaking change:_ Moves `Secp256k1KeyIdentity` to its own package. `@dfinity/identity-secp256k1`
- _Breaking change:_ Deprecates `@dfinity/authentication`. If you relied on the `isDelegationValid` check, it has been moved to `@dfinity/identity`

- Deprecates `@dfinity/identity-ledgerhq`. Use `@zondax/ledger-icp` instead.
- chore: links assets docs in index
- chore: sets up new size-limit job for packages, in preparation for CI

## [0.14.1]

### Changed

- feat: `secp256k1` now supports a `fromSeedPhrase` method that will reproduce the same identity across `agent-js`, `dfx`, and `quill`
- chore: configures `unpkg` to use esmodules
- chore: removes unused lint shell script
- chore: adds `js-sha256` dependency to principal
- bug: fixes idlemanager initializing - now either requires `createOptions.identity` or `authClient.login` to be called before starting idle timeout

## [0.14.0]

### Changed

- feat: strips out bitcoin query methods from management canister IDL
- Adds retry logic to `HttpAgent`. By default, retries three times before throwing an error, to offer a more cohesive workflow
- Improves and truncates error messages in Candid
- fixes flaky tests for syncTime
- Adds a top-level `fetchCandid()` function which retrieves the Candid interface for a given canister id.
- chore: `auth-client` expose storage constant keys
- bug: `auth-client` resolves window.open issue in login function in safari due to async storage call
- New package: @dfinity/assets. This package provides an asset manager to manage assets on an assets canister.
- bug: `auth-client` storage wrapper returns after resolve to avoid idb to be recreated

## [0.13.3]

### Changed

- New package: `@dfinity/bls-verify`. This package provides a pure-js implementation of BLS verification using the `miracl-core` package. This can be used to polyfill BLS verification for `agent-js`, but it is notably very slow (~3s per verification). Optimization may be possible with a significant refactoring
- adds ability to polyfill bls verification in Certificate
- Auth Client moves key fallback generation to the create method instead of login and makes the `\_key` non-nullable. This fixes a regression with async window.open behavior in Safari
- `HttpAgent` now offers a method to sync time with the replica, provided a specific canister. This can be used to set proper `Expiry` times when a device has fallen out of sync with the replica.
- Fixes a candid bug where when decoding, optional fields could be skipped if the data on the wire contains additional fields.

## [0.13.2]

### Changed

- `auth-client` avoids localstorage global and can be used in a web worker or nodejs
- bug: `auth-client` logout now awaits clearing storage

## [0.13.1]

### Changed

- fixes a bug with the localstorage migration strategy

## [0.13.0]

### Changed

- AuthClient now uses `IndexedDb` by default. To use localStorage, import LocalStorage provider and pass it during `AuthClient.create()`.

- Also offers a generic `IndexedDb` keyval store, `IdbKeyVal`

- `AuthClient` migrates gracefully from localstorage to IDB when upgrading

## [0.12.2]

### Changed

- Support for the `SubtleCrypto` interface in `@dfinity/identity` using the new `ECDSAKeyIdentity`
- `CanisterStatus` no longer suppresses rootKey errors
- Readme's point to https://agent-js.icp.xyz

## [0.12.1]

### Changed

- Adds inline sourcemaps to packages
- Pulls lint out to a separate job now that Node 12 is failing with latest eslint dependencies
- Adds `UTF-8` as an encoding option for `CanisterStatus` custom paths
- Adds a public method `createReadStateRequest` that creates the request for `readState`.
- Add an extra parameter to `readState` to pass a created request. If this parameter is passed, the method does the request directly without creating a new one.
- Use the `createReadStateRequest` and the extra parameter when polling for the response to avoid signing requests during polling.
- Adds `derivationOrigin` to `auth-client` login to support the ability to login using the identity derived from a different origin. See [proposed changes](https://github.com/dfinity/internet-identity/pull/724/files#diff-44c106928503ccfb1b3f09f02513578552f66b68dea01c5ec4bd2de858bbba1a)

## [0.12.0]

### Changed

- Changed the certificate verification interface and fixed its logic. The public constructor is now static and asynchronous. There is no separate verification method, the check is done automatically in the constructor and newly also checks that the delegation is authoritative for the given canister ID, as required by the Internet Computer interface specification.

## [0.11.2]

### Changed

- Adds a default callback to the `IdleManager` that will refresh the page after clearing the storage
- Adds a new utility method, `canisterStatus`, to `agent-js`. Canister status now allows you to query paths from the canister certificate with a simple interface, using the API from the[interface specification](https://internetcomputer.org/docs/current/references/ic-interface-spec#state-tree-canister-information)
  Comes with nicely configured options for

  `time`, `controllers`, `subnet`, `module_hash`, `candid`. Additionally, has a utility for reading custom MetaData set using [ic-wasm](https://github.com/dfinity/ic-wasm), as well as generic custom paths in the format of ArrayBuffers.

- updates to package.json files for metadata in npm

## [0.11.1]

### Changed

- Fix for a corner case that could lead to incorrect decoding of record types.

## [0.11.0]

### Changed

- makeNonce now returns unique values. Previously only the first byte of the nonce was populated.
- Introduces `IdleManager` to the `auth-client`. You can now use it to detect when the user has been idle for a configurable amount of time, and then to register callbacks for the sake of logging the user out and prompting re-authentication. See the `@dfinity/auth-client` Readme for more details
- Reduces the `maxTimeToLive` default setting from 24 hours to 8
- Versioning tool now sets patch version to 0 for minor version updates, or patch and minor versions to 0 for major version updates
- Removes jest-expect-message, which was making test error messages less useful
- `HttpAgent` now generates a nonce to ensure that calls are unique by default. If you want to opt out or provide your own nonce logic, you can now pass an option of `disableNonce: true`during the agent initialization.

  If you are currently using `agent.addTransform(makeNonceTransform())` , please note that you should remove that logic, or add the `disableNonce` option to your agent when upgrading.

## [0.10.3]

### Changed

- Candid now allows optional records to be omitted. See https://github.com/dfinity/agent-js/issues/524
- In `auth-client`, login `onSuccess` callback and `onError` callback now supports async pattern.
- Updates npm dependencies to resolve warnings for typedoc and node-fetch. No runtime dependencies were affected.

## [0.10.2]

### Changed

- Security enhancement - adds a rewrite for urls to subdomains of

  `\*.ic0.app/api`

  to

  `ic0.app/api`

- Improves error messages for when `HttpAgent` cannot infer `fetch` implementation

## [0.10.1]

### Changed

- Fix for the `auth-client` identity option and added JSDOC comment for the `timeToLive` option
- Sets the default Internet Identity expiration to 1 day for the `authClient`, up from 15 minutes
- No longer checks instanceof `Principal` in `@dfinity/agent`, which should allow non-identical versions of packages to interoperate, as long as they share the same API

## [0.10.0]

### Changed

- Adds changelog for `agent-js` packages
- `Buffer` and `Pipe` refactor
  - In previous versions of dfinity packages, we relied on `Buffer`, a polyfilled version of the Node.js `Buffer` utility. In a significant refactor, we have removed all cases of this, along with `Pipe` and the nonstandard `Blob` packages, in favor of `ArrayBuffer`, `Uint8Array`, and `DataView`
  - Utility methods such as `blobToUint8Array` have been removed.
  - Interfaces that relied on `Buffer` and related packages have been updated to accept `ArrayBuffer`, and the type interfaces are updated to reflect this
- `Secp256k1` Support
  - Adds two new exports to `@dfinity/identity` - `Secp256k1KeyIdentity` and `Secp256k1PublicKey`
  - API mirrors the `ed25519` components, and relies on the [secp256k1](https://www.npmjs.com/package/secp256k1) npm package for signing and verification.
