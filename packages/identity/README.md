# @icp-sdk/core/identity

JavaScript and TypeScript module to manage Identities and enable simple Web Authentication flows for applications on the [Internet Computer](https://internetcomputer.org/)

## Usage

```ts
import { ECDSAKeyIdentity, Ed25519KeyIdentity, WebAuthnIdentity } from '@icp-sdk/core/identity';

const ecdsaIdentity = await ECDSAKeyIdentity.generate();
const ed25519Identity = Ed25519KeyIdentity.generate();
const webAuthnIdentity = await WebAuthnIdentity.create();
```

### DelegationIdentity

The `DelegationIdentity` is typically generated using the [`@icp-sdk/auth`](https://js.icp.build/auth/latest/) package.

### PartialIdentity

The `PartialIdentity` is not typically used directly, but is used by the `DelegationIdentity` and `WebAuthnIdentity` classes.

### Secp256k1KeyIdentity

See [@icp-sdk/core/identity/secp256k1](https://js.icp.build/core/latest/libs/identity-secp256k1/api/) for more information.

## In Node.js

Depending on your version, you may need to use a polyfill and set `global.crypto` in a setup file. If you prefer, you can also pass in a `subtleCrypto` implementation in methods that call for it, either as a direct argument, or in a `cryptoOptions` object.

## API Reference

Additional API Documentation can be found [here](https://js.icp.build/core/latest/libs/identity/api/).
