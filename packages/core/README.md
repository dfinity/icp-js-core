# @icp-sdk/core

The `@icp-sdk/core` package is a JavaScript and TypeScript library designed to interact with the Internet Computer. It acts as a meta-package that re-exports functionality from several other `@dfinity` packages, providing a convenient way to access multiple tools and utilities in one place.

Do you want to know more about developing on the Internet Computer? Visit the [Developer Docs](https://internetcomputer.org/docs/home).

> Still using `@dfinity/agent`? Migrate to [`@icp-sdk/core`](https://js.icp.build/core/latest/upgrading/v4)!

---

## Installation

You can install the `@icp-sdk/core` package using your preferred package manager:

### npm

```shell
npm install @icp-sdk/core
```

### yarn

```shell
yarn add @icp-sdk/core
```

### pnpm

```shell
pnpm add @icp-sdk/core
```

## Import Paths

The package provides the following import paths for accessing the re-exported modules:

- `@icp-sdk/core/agent`
- `@icp-sdk/core/candid`
- `@icp-sdk/core/identity`
  - `@icp-sdk/core/identity/secp256k1`
- `@icp-sdk/core/principal`

## Usage Example

Here is an example of how to use the `@icp-sdk/core` package:

```ts
// Importing the HttpAgent from the agent module
import { HttpAgent } from '@icp-sdk/core/agent';

// Importing the Identity utility
import { Ed25519KeyIdentity } from '@icp-sdk/core/identity';

// Importing the Candid utility
import { IDL } from '@icp-sdk/core/candid';

// Importing the Principal utility
import { Principal } from '@icp-sdk/core/principal';

// Create a new identity
const identity = Ed25519KeyIdentity.generate();

// Create a Principal from a string
const canisterId = Principal.fromText('uqqxf-5h777-77774-qaaaa-cai');

// Create an HttpAgent instance
const agent = await HttpAgent.create({
  host: 'https://icp-api.io',
  identity,
});

// Call a canister
const response = await agent.call(canisterId, {
  methodName: 'greet',
  arg: IDL.encode([IDL.Text], ['world']),
});

console.log(response);
```

**Note:** If you are using TypeScript, this package requires the `node16` (or later) [`moduleResolution`](https://www.typescriptlang.org/tsconfig#moduleResolution) strategy to function correctly.

Additional API Documentation can be found [here](https://js.icp.build/core/latest/).

## Contributing

Contributions are welcome! Please refer to the [repository](https://github.com/dfinity/icp-js-core) for guidelines on contributing to this project.

## License

This project is licensed under the Apache-2.0 License. See the [LICENSE](https://github.com/dfinity/icp-js-core/blob/main/LICENSE) file for details.
