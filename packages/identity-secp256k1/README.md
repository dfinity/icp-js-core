# @icp-sdk/core/identity/secp256k1

The `@icp-sdk/core/identity/secp256k1` module provides an implementation of the [`SignIdentity`](https://js.icp.build/core/latest/libs/agent/api/classes/signidentity/) interface for the secp256k1 elliptic curve. It allows you to create and manage key pairs for signing and verification of messages.

## Usage

Here's an example of how to use the `Secp256k1KeyIdentity` class to generate a new key pair and sign and verify a message:

```ts
import { Secp256k1KeyIdentity } from '@icp-sdk/core/identity/secp256k1';

// Generate a new key pair
const identity = Secp256k1KeyIdentity.generate();

// Sign a message
const message = 'Hello, world!';
const signature = identity.sign(message);

// Verify the signature
const isValid = identity.verify(message, signature);

console.log(`Signature is ${isValid ? 'valid' : 'invalid'}`);
```

You can also use a seed to generate deterministic key pairs:

```ts
import { Secp256k1KeyIdentity } from '@icp-sdk/core/identity/secp256k1';

const seed = Buffer.from('my-secret-seed', 'utf8');
const identity = Secp256k1KeyIdentity.generate(seed);
```

The Secp256k1KeyIdentity class also provides methods for converting the key pair to and from JSON-serializable objects:

```ts
import { Secp256k1KeyIdentity } from '@icp-sdk/core/identity/secp256k1';

// Generate a new key pair
const identity = Secp256k1KeyIdentity.generate();

// Convert the key pair to a JSON-serializable object
const json = identity.toJson();

// Convert the JSON-serializable object back to a key pair
const restoredIdentity = Secp256k1KeyIdentity.fromJson(json);
```

## API Reference

Additional API Documentation can be found [here](https://js.icp.build/core/latest/libs/identity-secp256k1/api/).
