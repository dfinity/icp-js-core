# icp-js-core

[![NPM Version](https://img.shields.io/npm/v/%40icp-sdk%2Fcore)](https://www.npmjs.com/package/@icp-sdk/core)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

The source code repository for the `@icp-sdk/core` package - the official JavaScript SDK for building applications on the Internet Computer.

## For Package Users

If you're looking to use the `@icp-sdk/core` package in your project, visit:

- **📦 Package Folder**: [packages/core](./packages/core)
- **📚 Full Documentation**: [js.icp.build/core/](https://js.icp.build/core/)

### Quick Start

```typescript
import { HttpAgent } from '@icp-sdk/core/agent';
import { Ed25519KeyIdentity } from '@icp-sdk/core/identity';
import { IDL } from '@icp-sdk/core/candid';
import { Principal } from '@icp-sdk/core/principal';

const identity = Ed25519KeyIdentity.generate();
const canisterId = Principal.fromText('uqqxf-5h777-77774-qaaaa-cai');

const agent = await HttpAgent.create({
  host: 'https://icp-api.io',
  identity,
});

// Send an update call to the canister
await agent.call(canisterId, {
  methodName: 'greet',
  arg: IDL.encode([IDL.Text], ['world']),
});
```

## Contributing

This repository contains the source code for `@icp-sdk/core` and related packages. Contributions are welcome! Please refer to the [CONTRIBUTING.md](./.github/CONTRIBUTING.md) for details about setting up the development environment, running tests, and the review process.

## License

This project is licensed under the [Apache-2.0 License](./LICENSE).
