# @icp-sdk/core/candid

JavaScript and TypeScript module to work with Candid interfaces

## Usage

```ts
import { IDL } from '@icp-sdk/core/candid';

const MyType = IDL.Record({
  name: IDL.Text,
  age: IDL.Nat8,
});

const encoded = IDL.encode([MyType], [{ name: 'John', age: 30 }]);
const decoded = IDL.decode([MyType], encoded);

console.log(decoded); // [{ name: 'John', age: 30 }]
```

## API Reference

Additional API Documentation can be found [here](https://js.icp.build/core/latest/libs/candid/api).
