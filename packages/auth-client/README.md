# @dfinity/auth-client

> `@dfinity/auth-client` has been deprecated. Migrate to [`@icp-sdk/auth`](https://js.icp.build/auth/latest/upgrading/v4)

Simple interface to get your web application authenticated with the Internet Identity Service

Do you want to know more about developing on the Internet Computer? Visit the [Developer Docs](https://internetcomputer.org/docs/home).

Additional API Documentation can be found [here](https://js.icp.build/core/v3.2/libs/auth-client/api).

---

## Installation

Using AuthClient:

```shell
npm i --save @dfinity/auth-client
```

### In the browser:

```ts
import { AuthClient } from '@dfinity/auth-client';
```

To get started with auth client, run

```ts
const authClient = await AuthClient.create();
```

The authClient can log in with

```ts
authClient.login({
  // 7 days in nanoseconds
  maxTimeToLive: BigInt(7 * 24 * 60 * 60 * 1000 * 1000 * 1000),
  onSuccess: async () => {
    handleAuthenticated(authClient);
  },
});
```

It opens an `identity.ic0.app` window, saves your delegation to localStorage, and then sets you up with an identity.

Then, you can use that identity to make authenticated calls using the `@dfinity/agent` `Actor`.

```ts
const identity = await authClient.getIdentity();
const actor = Actor.createActor(idlFactory, {
  agent: new HttpAgent({
    identity,
  }),
  canisterId,
});
```

## Storage and Key management

If you prefer not to use ECDSA keys or the default IndexedDb storage interface, you can provide your own. Some reasons to use a custom storage implementation might be

- You prefer to use LocalStorage
- You don't want to persist keys across page loads for heightened security
- You have an alternate strategy for identity management

There is an exported LocalStorage interface, but any structure that implements the `AuthClientStorage` interface will work.

```ts
export type StoredKey = string | CryptoKeyPair;
export interface AuthClientStorage {
  get(key: string): Promise<StoredKey | null>;

  set(key: string, value: StoredKey): Promise<void>;

  remove(key: string): Promise<void>;
}
```

So you could easily implement your own

```ts
const noStorageImpl = {
  get(key: string) {
    return Promise.resolve(null);
  },
  set(key: string, value: StoredKey) {
    return Promise.resolve();
  },
  remove(key: string) {
    return Promise.resolve();
  },
};
const authClient = await AuthClient.create({
  storage: noStorageImpl,
});
```

If you are using a custom storage implementation like `LocalStorage` that only supports strings, you should use the `keyType` option to use an `Ed25519` key instead of the default `ECDSA` key.

```ts
const authClient = await AuthClient.create({
  storage: new LocalStorage(),
  keyType: 'Ed25519',
});
```

<h2 id="0.10.5-idle-update">Idle Management</h2>

The AuthClient provides two forms of security for session management. The first is built into the Internet Identity delegation - the `maxTimeToLive` option in nanoseconds determines how long the `DelegationIdentity` you get back will be valid for. The second is the Idle Manager, which moniters keyboard, mouse and touchscreen identity. The Idle Manager will automatically log you out if you don't interact with the browser for a period of time.

If you pass no options to the IdleManager, it will log you out after 10 minutes of inactivity by removing the `DelegationIdentity` from localStorage and then calling `window.location.reload()`.

If you pass an `onIdle` option, it will call that function when the user is idle, replacing the default window.location.reload() behavior. You can also register callbacks after the idleManager is created with the `idleManager.registerCallback()` method, which will also replace the default callback.

The full set of options for the IdleManager is:

```ts
  /**
   * Callback after the user has gone idle
   */
  onIdle?: IdleCB;
  /**
   * timeout in ms
   * @default 30 minutes [600_000]
   */
  idleTimeout?: number;
  /**
   * capture scroll events
   * @default false
   */
  captureScroll?: boolean;
  /**
   * scroll debounce time in ms
   * @default 100
   */
  scrollDebounce?: number;
```

Additionally, the AuthClient accepts a couple additional flags to `idleOptions` to control the IdleManager:

```ts
  /**
   * Disables idle functionality for {@link IdleManager}
   * @default false
   */
  disableIdle?: boolean;

  /**
   * Disables default idle behavior - call logout & reload window
   * @default false
   */
  disableDefaultIdleCallback?: boolean;
```

### IdleManager Example Usage

```ts
const authClient = await AuthClient.create({
  idleOptions: {
    idleTimeout: 1000 * 60 * 30, // set to 30 minutes
    disableDefaultIdleCallback: true // disable the default reload behavior
  }
});
// ...authClient.login()
const identity = await authClient.getIdentity();
const actor = Actor.createActor(idlFactory, {
  agent: new HttpAgent({
    identity,
  }),
  canisterId,
});

refreshLogin() {
  // prompt the user then refresh their authentication
  authClient.login({
    onSuccess: async () => {
      const newIdentity = await AuthClient.getIdentity();
      Actor.getAgent(actor).replaceIdentity(newIdentity);
    }
  });
}

authClient.idleManager?.registerCallback?.(refreshLogin);
```

In this code, we create an `authClient` with an idle timeout of 30 minutes. When the user is idle, we invalidate their identity and prompt them to login again.

After the user logs in, we can set the new identity in the actor without reloading the page.

Note: depends on [@dfinity/agent](https://www.npmjs.com/package/@dfinity/agent) and
[@dfinity/identity](https://www.npmjs.com/package/@dfinity/identity).
