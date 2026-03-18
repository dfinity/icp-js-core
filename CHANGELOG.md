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

## Unreleased

### Feat

- **agent**: add callAndPoll to HttpAgent (#1289)
- **agent**: add rawCertificate to pollForResponse and export PollFor… (#1287)
- **agent**: add queryStrategy option to ActorConfig (#1274)

### Fix

- **ci**: add changelog_start_rev to prevent commitizen from rewriting… (#1296)
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
