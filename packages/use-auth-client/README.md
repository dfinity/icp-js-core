# @dfinity/use-auth-client

> **⚠️ DEPRECATED**: This package is deprecated since v3.2.3. Please use one of the following alternatives:
> - [`ic-use-internet-identity`](https://www.npmjs.com/package/ic-use-internet-identity)
> - [`@ic-reactor/react`](https://www.npmjs.com/package/@ic-reactor/react)

`@dfinity/use-auth-client`! This is a package for Internet Computer React developers, making it easier to integrate the auth-client with your React application.

You can use it to manage your identity for you, or you can pass it an `idlFactory` and `canisterId` and it will construct and manage your entire `Actor` for you.

Do you want to know more about developing on the Internet Computer? Visit the [Developer Docs](https://internetcomputer.org/docs/home).

Additional API Documentation can be found [here](https://js.icp.build/core/v3.2/libs/use-auth-client/api).

---

## Installation

To install, use:

```shell
npm install @dfinity/use-auth-client
```

and you can import and set it up like so:

```ts
import {useAuthClient} from '@dfinity/use-auth-client';

...ts
const App = () => {
  const identityProvider =
    // eslint-disable-next-line no-undef
    process.env.DFX_NETWORK === 'local'
      ? // eslint-disable-next-line no-undef
        `http://${process.env.CANISTER_ID_INTERNET_IDENTITY}.localhost:4943`
      : 'https://identity.internetcomputer.org';

  const { isAuthenticated, login, logout, actor } = useAuthClient({
    loginOptions: {
      identityProvider,
    },
    actorOptions: {
      canisterId,
      idlFactory,
    },
  });
  ...
}
```

## Multiple Actors

If you have multiple actors, you can pass a record of `actorOptions` to the `useAuthClient` hook. The keys of the record will be the names of the actors, and the values will be the `actorOptions` for that actor. It will look something like this:

```ts
const { isAuthenticated, login, logout, actors } = useAuthClient({
  actors: {
    actor1: {
      canisterId: canisterId1,
      idlFactory: idlFactory1,
    },
    actor2: {
      canisterId: canisterId2,
      idlFactory: idlFactory2,
    },
  },
});

const { actor1, actor2 } = actors;
```

There is a live demo at https://5ibdo-haaaa-aaaab-qajia-cai.icp0.io/.
