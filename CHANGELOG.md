# Changelog


### Changed

- Adds changelog for `agent-js` packages
- `Buffer` and `Pipe` refactor
  - In previous versions of dfinity packages, we relied on `Buffer`, a polyfilled version of the Node.js `Buffer` utility. In a significant refactor, we have removed all cases of this, along with `Pipe` and the nonstandard `Blob` packages, in favor of `ArrayBuffer`, `Uint8Array`, and `DataView`
  - Utility methods such as `blobToUint8Array` have been removed.
  - Interfaces that relied on `Buffer` and related packages have been updated to accept `ArrayBuffer`, and the type interfaces are updated to reflect this
- `Secp256k1` Support
  - Adds two new exports to `@dfinity/identity` - `Secp256k1KeyIdentity` and `Secp256k1PublicKey`
  - API mirrors the `ed25519` components, and relies on the [secp256k1](https://www.npmjs.com/package/secp256k1) npm package for signing and verification.

## v5.1.0 (2026-03-18)

### Feat

- **agent**: add callAndPoll to HttpAgent (#1289)
- **agent**: add rawCertificate to pollForResponse and export PollFor… (#1287)
- **agent**: add queryStrategy option to ActorConfig (#1274)

### Fix

- **agent**: simplify getSubnetNodeKeys to use fetchSubnetKeys return … (#1291)
- **candid**: improve error messages for candid decoding errors (#1292)
- **candid**: improve error messages for candid decoding errors (#1270)
- hashTreeToString: the types are incorrect (#1290)
- **agent**: reject query responses with excessive signatures (#1281)
- **agent**: deduplicate parallel fetchSubnetKeys requests (#1278)
- resolve security vulnerabilities and upgrade dependencies (#1273)

### Refactor

- **agent**: reduce circular dependencies (#1285)
- **agent**: make CallContext.httpDetails optional (#1284)
- **agent**: extract readCertifiedReject helper to deduplicate ce… (#1283)
- **agent**: use `globalThis.fetch` instead of custom env. detection (#1272)

## v5.0.0 (2025-12-18)

### Feat

- deprecate `@dfinity/assets` (#1244)
- **agent**: use `/api/v3` for query and read_state requests (#1228)
- **agent**: `syncTimeWithSubnet` method for `HttpAgent` (#1240)
- **agent**: `SubnetStatus` module (#1238)
- **agent**: support both subnet id and canister id for certificate verification (#1234)
- **agent**: export `IC_STATE_ROOT_DOMAIN_SEPARATOR` constant (#1233)
- **agent**: `readSubnetState` and `getSubnetIdFromCanister` methods (#1232)
- **agent**: use `/api/v4` for call requests (#1223)
- **agent**: lookup canister ranges using the `/canister_ranges/<subnet_id>/<ranges>` certificate path (#1221)
- **agent**: `list_paths` internal function (#1219)
- **candid**: encode magic number only once (#1210)
- deprecate `@dfinity/auth-client` (#1207)
- **assets**: replace `@dfinity/{agent,candid,principal}` deps with `@icp-sdk/core` (#1206)
- **core**: remove peer dependencies (#1205)
- port `@dfinity/identity-secp256k1` source code to core package (#1199)
- port `@dfinity/identity` source code to core package (#1196)
- port `@dfinity/agent` source code to core package (#1194)
- port `@dfinity/candid` source code to core package (#1192)
- port `@dfinity/principal` source code to core package (#1190)

### Fix

- **agent**: sync time if ingress expiry is invalid in read_state (#1268)
- **agent**: sync time before retrying if query signature is outdated (#1260)
- **agent**: sync time if ingress expiry is invalid in queries (#1259)
- **agent,identity/secp256k1**: remove `console.*` statements (#1267)
- **agent**: verify all query signatures instead of only the first one (#1257)
- **agent**: check if canister is in ranges for certificates without delegation (#1256)
- **agent**: remove duplicated exports (#1246)
- **agent**: do not fetch subnet state for node keys (#1241)

### Refactor

- remove `@dfinity/use-auth-client` source code (#1264)
- remove `@dfinity/auth-client` source code (#1263)
- remove `@dfinity/principal` source code (#1251)
- remove `@dfinity/candid` source code (#1250)
- remove `@dfinity/agent` source code (#1249)
- remove `@dfinity/identity` source code (#1248)
- remove `@dfinity/identity-secp256k1` source code (#1247)
- **agent**: split `CanisterStatus` into smaller reusable functions (#1237)
- **agent,identity**: remove deprecated code and fix root export docs (#1236)
- **agent**: split read state into inner function (#1231)
- remove unused file (#1229)
- **agent**: prepare certificate functions for new logic (#1220)
- **agent**: split inner logic of `check_canister_ranges` into functions (#1188)
- **agent**: only declare IC URLs once (#1187)

## v4.2.3 (2025-11-19)

## v4.2.2 (2025-11-10)

### Fix

- **agent**: use minute precision when rounded expiry is at least 60s in future (#1181)

## v4.2.1 (2025-10-24)

## v4.2.0 (2025-10-22)

### Feat

- **agent**: `getCanisterEnv` and `safeGetCanisterEnv` (experimental) (#1156)

## v4.1.1 (2025-10-21)

### Fix

- throw error if IndexedDB fails to open (#1166)
- **agent**: remove exported `CanisterInstallMode` type (#1167)

## v4.1.0 (2025-10-13)

### Feat

- **principal**: export the `base32Encode` and `base32Decode` functions (#1159)

### Refactor

- **principal**: rename base32 functions (#1160)

## v4.0.5 (2025-09-30)

### Fix

- **candid**: recursive type table merging preserves concrete type mapping (#1153)
- **identity**: handle ArrayBuffer in delegation chain serialization (#1152)

## v4.0.4 (2025-09-18)

### Fix

- create a fresh default polling strategy per request (#1149)
- remove the `nonce` from the `ActorConfig` type. (#1150)

## v4.0.3 (2025-09-16)

### Fix

- **identity**: expose all exported elements from ed25519 module (#1144)

## v4.0.2 (2025-09-02)

### Fix

- use `effectiveCanisterId` in certificate verification (#1132)

## v4.0.1 (2025-08-27)

### Feat

- deprecate `@dfinity/use-auth-client` (#1125)

### Fix

- only delete knot if it's the last entry of the `TypeTable` (#1123)

## v4.0.0 (2025-08-22)

### Feat

- v4 docs (#1111)

## v3.2.2 (2025-08-21)

### Feat

- upload docs to the dfinity/icp-js-sdk-docs repo (#1095)
- `@icp-sdk/core` upgrading guide and migrator (#1102)

### Fix

- cross-package links normalization (#1113)
- add `bigint` to the `JsonValue` types (#1108)

### Refactor

- move upgrading guide to v4 path (#1107)
- remove unneeded switches and sync version with package.json (#1106)
- move secp256k1 submodule to identity submodule (#1105)
- remove `@dfnity/auth-client` from core package (#1103)
- break libs plugin into additional files, and markdown urls plugins (#1101)

## v3.2.1 (2025-08-13)

### Fix

- export generic types from IDL module (#1099)

## v3.2.0 (2025-08-07)

### Feat

- enable type safety for Func and Service IDL types (#1089)

### Fix

- error handling of call responses (#1092)
- enable certificate freshness checks for delegation certificates (#1094)
- avoid bigint overflow when decoding the time from the certificate (#1093)
- enable certificate freshness check in canister status request (#1082)
- use effective canister id to delete the node keys from the local map (#1091)
- account for clock drift in certificate freshness check (#1081)
- perform certificate delegation canister range check unconditionally (#1083)
- add declaration maps and source code to published package (#1088)
- round ingress expiry before applying clock drift (#1076)
- do not subtract replica permitted drift (#1075)

## v3.1.0 (2025-07-24)

### Feat

- export the `getCrc32` function from `@dfinity/principal` (#1077)

## v3.0.2 (2025-07-23)

### Fix

- canonicalizes record and variant labels during subtype checking (#1073)

## v3.0.1 (2025-07-22)

### Fix

- override instanceof in IDL types (#1067)

## v3.0.0 (2025-07-17)

### Fix

- fix publish command (#1065)

## v3.0.0-beta.4 (2025-07-17)

### Feat

- remove watermark checks (#1045)
- remove assets from core package (#1047)
- rename @dfinity/icp to @icp-sdk/core (#1046)
- add @dfinity/icp monopackage (#1041)

### Fix

- use .ts extension for imports (#1054)
- support bigints in leb encoding (#1059)
- export ESM modules (#1055)
- use `loginOptions` from `AuthClient.create` if none are provided to `AuthClient.login` (#1053)

## v3.0.0-beta.1 (2025-06-19)

### Fix

- mark `@noble/hashes` as a dependency rather than a dev dependency (#1034)

## v3.0.0-beta.0 (2025-06-17)

### Feat

- use new cbor library (#1015)
- sync time with the network when an ingress expiry error was received (#1014)
- replace `concat` with `concatBytes` from `@noble/hashes/utils` (#1021)
- replace `hash` with `sha256` from `@noble/hashes/sha2` to take advantage of existing dependencies (#1019)
- remove `base64-arraybuffer` dependency (#1016)
- standardizes on uint8array for agent-js interfaces (#1012)
- make `lookup_path` compliant with the spec and introduce `lookup_subtree` (#1009)
- `isCertified` flag on errors (#1010)
- `Expiry` JSON serialization and deserialization (#1008)
- use new error system in Agent and Actor (#1005)
- breaking out readState into signed and unsigned (#1000)
- removes proxyagent and getDefaultAgent exports (#992)

### Fix

- handle `response.arrayBuffer()` throws in `#requestAndRetry` (#1031)
- make isAuthenticated validate delegation expiry (#985)
- checks subtyping relation when decoding reference types in Candid (#994)

### Refactor

- update typescript config (#1026)
- use hex utils from `@noble/hashes` (#1022)
- use `@noble/hashes/sha2` consistently (#1020)
- remove unnecessary `uint8FromBufLike` calls (#1017)
- use new error system and error codes (#1004)


- drop support for node v19 or lower, and for node v21 (#1025)
- deprecate management canister (#1023)

## v2.4.1 (2025-04-10)

### Feat

- Change auth-client's default identity provider url (#987)

### Fix

- fixes a bug in Ed25519KeyIdentity `toRaw` where the output was not an ArrayBuffer (#995)
- fixes a bug in the Ed25519KeyIdentity verify implementation (#991)
- fixes a bug in the `Principal` library where the management canister id util was incorrectly importing using `fromHex` (#990)

## v2.4.0 (2025-03-24)

### Feat

- allows httpagent.call to be provided with a nonce (#983)

### Fix

- make IDL/Candid decoding of options spec compliant (#981)

## v2.3.0 (2025-02-07)

### Feat

- enhanced details in agent query and read_state errors (#970)
- HttpAgent uses anonymous identity to make syncTime call, which can allow readState calls to work beyond 5 minutes (#969)
- enhanced details in agent call errors (#968)
- fetch root key before making calls (#966)
- support allow list for canister logs in agent-js (#965)

### Fix

- reverts read_state polling expiry changes (#971)

## v2.2.0 (2024-12-12)

### Feat

- target_canister to be handled only for method install_chunked_code (#957)
- effective target canister ID for mgmt call (#954)
- adds management canister support for canister snapshots (#917)

### Fix

- JsDoc typo in DelegationIdentity class's `fromDelegation` method (#951)
- Make pollForResponse typesafe to avoid exceptions from unknown requests (#958)

## v2.1.3 (2024-10-23)

### Feat

- improved assertion options for agent errors (#908)
- allow for setting HttpAgent ingress expiry using `ingressExpiryInMinutes` option (#905)

### Fix

- read state with fresh expiry (#938)
- trap and throw handling in v3 sync call (#940)

## v2.1.2 (2024-09-29)

## v2.1.1 (2024-09-13)

### Feat

- **asset**: add headers to StoreArgs (#928)

## v2.1.0 (2024-09-12)

### Feat

- allow option set agent replica time (#923)
- expose inner certificate in Certificate (#925)
- multi-actor config (#916)
- exports polling utilities from `@dfinity/agent` (#921)
- v3 api sync call (#906)
- new option for setting rootKey during agent creation (#918)
- ensure that seed phrase must produce a 64 byte seed (#915)
- use-auth-client react hook (#911)
- management canister interface schnorr update (#913)

### Fix

- build paths on use-auth-client (#922)
- passing request correctly during pollForResponse Processing status (#909)

## v2.0.0 (2024-07-16)

### Feat

- deprecate `HttpAgent` constructor in favor of new `create` (#873)
- support getting certificate back from call (#892)

## v1.4.0 (2024-06-18)

### Feat

- strips out bitcoin query methods from management canister IDL (#893)
- add support for proof of absence in certificate lookups (#878)

### Fix

- ObservableLog no longer extends Function (#887)
- publish script will correctly update the package-lock.json file with the correct dependencies when making a new release (#883)

## v1.3.0 (2024-05-01)

### Feat

- retry delay strategy (#871)

## v1.2.1 (2024-04-25)

### Feat

- make `IdbStorage` `get/set` methods generic (#869)

## v1.2.0 (2024-03-25)

### Feat

- support for restricting II auth methods (#856)
- pure JS BLS verification (#817)
- support for management canister logging (#863)
- allow passing `DBCreateOptions` to `IdbStorage` constructor (#850)

### Fix

- pads date numbers in changelog automation (#862)

## v1.1.1 (2024-03-19)

### Fix

- Work around credentials not being enumerable (#860)

## v1.1.0 (2024-03-18)

### Feat

- replay attack prevention using watermarks (#854)
- adds fromPem method for identity-secp256k1 (#816)

### Fix

- Remove ArrayBuffer checks from WebAuthnIdentity (#857)

## v1.0.1 (2024-02-20)

### Fix

- ed25519KeyIdentity generates unique identities when no seed is provided (#851)

## v1.0.0 (2024-02-13)

### Feat

- introduces Observable Log for HttpAgent (#842)
- customPath changes (#840)
- Export AgentHTTPResponseError (#823)

### Fix

- adds npm run build to publish script (#845)

## v0.21.4 (2024-01-24)

## v0.21.3 (2024-01-24)

### Feat

- release automation changes (#832)

### Fix

- edit to the post-release script (#834)
- export partial identity from index of @dfinity/identity (#833)
- distinguish remote dev environments from known hosts (#830)

## v0.21.2 (2024-01-22)

### Fix

- incorrectly propogated package-lock (#828)

## v0.21.1 (2024-01-22)

### Fix

- running audit fix (#826)

## v0.21.0 (2024-01-22)

### Feat

- add `github.dev` and `gitpod.io` to known hosts (#822)
- replaces `secp256k1` npm package with `@noble/curves` (#814)
- introduces partial identity (#812)

### Fix

- honor disableIdle flag (#809)

## v0.20.2 (2023-11-27)

### Fix

- restoring localhost to list of known hosts (#805)

## v0.20.1 (2023-11-17)

### Feat

- retry query signature verification in case cache is stale (#801)

## v0.20.0 (2023-11-14)

### Feat

- uses expirable map for subnet keys (#796)

### Fix

- canisterStatus returns full list of controllers (#799)

## v0.20.0-beta.0 (2023-11-07)

### Feat

- introduces ExpirableMap (#794)
- node signature verification for queries (#784)
- refactor to remove nonce from queries (#792)
- round ingress expiry (#788)
- subnet metrics for canisterStatus (#790)
- retry logic catches thrown errors (#774)
- fetch node keys from subnet certificate (#776)

### Fix

- service ordering must be alphabetical (#781)

## v0.19.3 (2023-09-25)

### Feat

- Principal class serializes to JSON (#766)
- certificate time checks (#763)
- enhanced error message for missing canister id (#759)

### Fix

- Principal JSON is compatible with @dfinity/utils jsonReviver helper (#770)

## v0.19.2 (2023-08-25)

### Fix

- evaluates subdomains correctly when determining known hosts (#757)

## v0.19.1 (2023-08-24)

### Fix

- default host logic fixed and tests added (#755)

## v0.19.0 (2023-08-22)

### Feat

- replaces the `js-sha256` library with `@noble/hashes` (#753)
- HttpAgent now uses a default address (#751)
- removes use of date in nonce generation (#748)
- crypto nonce randomness (#747)

### Fix

- add `@dfinity/principal` as a peerDependency where needed (#752)

## v0.18.1 (2023-07-14)

### Fix

- fix composite query support in actor.ts (#739)

## v0.18.0 (2023-07-12)

### Feat

- expose boundary node http headers to calls (#736)

## v0.17.0 (2023-07-06)

### Feat

- support composite_query in candid (#730)

### Fix

- handle new update call errors (IC-1462) (#734)

## v0.16.0 (2023-06-29)

### Fix

- fix error on decoding service type (#731)
- Typo in JsonnableWebAuthnIdentitiy (#725)
- reverts use of Headers for improved node compatibility (#694)

## v0.15.7 (2023-06-21)

### Fix

- finish all tasks before calling onSuccess callback (#714)

## v0.15.6 (2023-04-25)

### Feat

- retry failed `read_state` requests (#705)

## v0.15.5 (2023-03-30)

### Feat

- Extend WebAuthnIdentity with AuthenticatorAttachment (#701)

## v0.15.4 (2023-02-21)

### Feat

- changes default host and supports icp-api.io (#690)
- auth client keyType config option (#689)

### Fix

- removes circular deps from barrel files (#691)

## v0.15.3 (2023-01-29)

## v0.15.2 (2023-01-26)

### Feat

- introduces X-Request-ID header to more easily identify retried requests (#678)
- migrate to secure ECDSA key for auth-client (#674)

### Fix

- Moved dev deps out of dependencies for auth-client. resolves #673 (#680)

## v0.15.0 (2022-12-12)

### Feat

- separate secp256k1 library (#663)
- React Native support with fetchOption and callOptions (#653)

## v0.14.1 (2022-11-07)

### Feat

- secp256k1 fromSeedPhrase now supported (#645)

### Fix

- idlemanager starting before login suceeds (#646)

## v0.14.0 (2022-10-06)

### Feat

- Asset manager performance (#639)
- add AssetManager (#603)
- AgentJs Candid Pinpointed Type Errors upgrade - PR (#633)
- Add fetchCandid() function to @dfinity/agent (#630)
- http-agent retries calls (#632)
- expose storage constant keys (#616)

### Fix

- Only clone and convert response to text when there is an error. (#638)
- time tests only use faketimers once (#634)
- optional fields not populated if wire type has additional fields (#627)
- return after resolve to avoid idb to be recreated (#617)

## v0.13.3 (2022-09-09)

### Feat

- new package - bls verify (#628)
- expose an agent syncTime method (#623)
- support for bls verification polyfill (#626)
- principal backwards compatibility (#614)

### Fix

- resolves window.open issue in safari due to async storage call (#620)

## v0.13.2 (2022-08-23)

### Fix

- logout clear storage missing promise await (#612)
- auth-client usage in web worker and nodejs (#611)

## v0.13.1 (2022-08-12)

### Fix

- migration from localstorage to idb (#608)

## v0.13.0 (2022-08-11)

### Feat

- auth-client stores identities in indexeddb (#605)

## v0.12.2 (2022-07-28)

### Feat

-  ECDSAKeyIdentity (#591)

### Fix

- BigInt exponentiation transpiler error (@dfinity/candid) (#599)
- canisterStatus throws if root key is not fetched (#600)

## v0.12.1 (2022-07-13)

### Feat

- enables inline sourcemaps for packages for developer experience (#593)
- reuse signed request when reading state (#584)
- adds support for derivationOrigin (#588)
- adds UTF-8 as an encoding option (#587)

## v0.12.0 (2022-06-28)

### Fix

- **agent**: Check subnet canister ranges (#580)
- typo for MetaData kind (#582)
- Candid UI cannot encode nat8 (#575)
- add setBigUint64 polyfill (#577)

## v0.11.2 (2022-05-19)

### Feat

- CanisterStatus utility (#572)
- idlemanager reload by default (#570)
- fast ArrayBuffer encoding (#566)

## v0.11.1 (2022-04-20)

### Feat

- Retain type information for functions and services on decoding (#563)

### Fix

- Correctly decode optional struct fields (#564)
- don't use spread operator when encoding vec (#561)

## v0.11.0 (2022-04-07)

### Feat

- Allow deserialization of candid values with unknown types (#555)
- add window config string (#552)
- generate nonce for HttpAgent calls (#554)
- support idle management in AuthClient  (#547)
- warn on bad origin (#549)
- Use full IC Management IDL (#406)

### Fix

- removes jest-expect message from toolchain (#553)
- versioning script now updates package.json (#551)
- Update webappsec types dependency
- make makeNonce return unique random values (#546)

## v0.10.4 (2022-03-22)

### Feat

- httpagent should allow its identity to be invalidated (#529)
- notify user interruption (#526)

## v0.10.3 (2022-02-15)

### Feat

- Remove the service worker (#494)
- add url rewrite to `HttpAgent` (#516)

### Fix

- decode optional fields (#531)

## v0.10.1 (2021-09-30)

### Feat

- secp256k1 support in agent js (#484)

### Fix

- auth-client identity option (#490)

### Refactor

- move all BLOB and Buffer to ArrayBuffer (breaking change) (#476)

## v0.9.2 (2021-07-12)

### Fix

- Implements DER wrapping and unwrapping (#463)

## v0.9.1 (2021-06-10)

### Feat

- automated version management (#448)

### Fix

- Fix an IDL bug in using FixedNat with BigInt (#439)

### Refactor

- move ledgerhq identity to using webhid (#449)

## v0.9.0 (2021-06-03)

### Feat

- extracts candid to its own package (#435)
- extracts Principal to @dfinity/principal (#428)
- **sw**: add a compile time env var to always fetch the root key (#425)
- adds fetchRootKey and rootKey to Agent api (#404)
- @dfinity/auth-client package (#371)
- configurable webauthn credentialCreationOptions (#376)
- add support for Ledger Hardware Wallet (#370)
- add a PollStrategy interface to define strategy (#368)

### Fix

- remove a fetchRootKey (#422)
- set the service worker public path to be always root (#424)
- return false when path cannot be found (and thus not validated) (#415)
- Various fixes related to the Service Worker validation (#414)
- correct typo on the SW loading screen (#413)
- optional credentialOptions (#398)
- Enhancements to auth-client. (#390)
- encode fields as hex strings rather than comma separated numbers (#396)
- use a poll strategy factory (#379)
- avoid math.pow in lebDecode (#373)

### Refactor

- split chunks more aggressively on ledger demo (#437)
- move Error messages to error classes (#421)
- optimize the vec nat8 to copy bytes (#410)

## v0.8.3 (2021-04-16)

### Feat

- split polling logic out of Actor class (#365)

## v0.8.2 (2021-04-15)

### Feat

- Export Delegation and SignedDelegation (#367)
- Construct a delegation chain for a list of delegations (#366)

## v0.8.1 (2021-04-14)

### Feat

- extends webauthn with credential support (#363)

## v0.8.0 (2021-04-13)

### Feat

- support HTTP API v2 and some QoL changes (#354)
- add a withOptions method to an actor method (#351)

### Fix

- throw when the Ed25519 seed isnt the proper length (#359)
- supporting BigInt(0) Nat encoding (#349)

### Refactor

- simplifies authenticator api (#350)
- simplify makeNonce logic so its easier to read (#360)

## v0.7.1 (2021-03-31)

### Feat

- add support for Http Requests to the Cloudflare worker (#319)

### Fix

- validate checksums in principal IDs (#321)
- use provisional_create_canister_with_cycles and other QoL (#325)

### Refactor

- replace BigNumber with BigInt primitive (#333)

## v0.6.28 (2021-03-23)

### Fix

- button design on mobile (#308)
- yubi key auth on chrome (#300)

## v0.6.26-beta.0 (2021-03-12)

### Feat

- Change webauthn options to enable touch id on safari (#282)
- move /design-phase-1 routes and subroutes to root (#235)
- **identity-provider**: Identity Provider v1 (#132)
- add support for bigint in leb128 (#200)
- add lerna to be able to publish these to npm (#184)
- BLS wasm from Rust (#180)
- implement a WebAuthnIdentity that uses navigator.credentials (#107)
- add support for sdk-test bootstrap server (#86)
- add key delegation and test for it (#80)
- use read_state instead of request_status (#45)
- Add BIP-39 methods and identity (#66)
- Implement SLIP 0010 key derivation (#65)
- remove public key and auth transforms and add Identity interface (#67)
- add a @dfinity/authentication package (#56)
- use anonymous for the first retrieve (#53)
- **idp**: add identity-provider package to repository (#52)
- DER-encode public key and principal ID when using Plain Authentication. (#48)
- use anonymous principal by default in HttpAgent (#46)
- add a getPrincipal() method to Agents (#40)
- add the canister ID to the window.ic object (#41)
- add a cache bust hash at the end of javascript output (#39)
- switch tsconfig compilerOptions.module=exnext + moduleResolution=node (#28)
- add request status done support for spec 0.10 (#19)
- add ingress_expiry field to http_agent (#18)
- init copy sdk:src/agent/javascript -> packages/agent

### Fix

- Small design changes (#281)
- sample js (#277)
- readState problems in browser and upgrade to webpack 5 (#246)
- ic-id-protocol updated to require AuthenticationResponse encoded in hash fragment for #security (#232)
- make arguments for Authenticator optional, and use proper typing in Command (#240)
- add Buffer import to principal (#130)
- allow for certificate to be fetched using a custom agent and Node fixes (#127)
- bundle bls.wasm in bootstrap (#99)
- use the correct Buffer class in transformRequest (#98)
- transfer all properties when using source in HttpAgent constructor (#78)
- add default values for ingress_expiry (#33)
- revert "feat: switch tsconfig compilerOptions.module=exnext + moduleR… (#31)
- cbor.value.u64 takes a radix when passing a string
- add a transform for ingress expiry (#23)
