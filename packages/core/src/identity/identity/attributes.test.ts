import { Principal } from '#principal';
import { requestIdOf } from '#agent';
import { DelegationChain, DelegationIdentity } from './delegation.ts';
import { Ed25519KeyIdentity } from './ed25519.ts';
import { AttributesIdentity } from './attributes.ts';
import {
  Endpoint,
  ReadRequestType,
  type HttpAgentReadStateRequest,
  type HttpAgentSubmitRequest,
} from '../../agent/agent/http/types.ts';
import { Expiry } from '../../agent/agent/http/expiry.ts';

function createIdentity(seed: number): Ed25519KeyIdentity {
  const s = new Uint8Array([seed, ...new Array(31).fill(0)]);
  return Ed25519KeyIdentity.generate(s);
}

function makeCallRequest(): HttpAgentSubmitRequest {
  return {
    endpoint: Endpoint.Call,
    request: {},
    body: {
      request_type: 'call' as const,
      canister_id: Principal.fromText('aaaaa-aa'),
      method_name: 'greet',
      arg: new Uint8Array([]),
      sender: Principal.anonymous(),
      ingress_expiry: Expiry.fromDeltaInMilliseconds(300000),
    },
  };
}

function makeReadStateRequest(): HttpAgentReadStateRequest {
  return {
    endpoint: Endpoint.ReadState,
    request: {},
    body: {
      request_type: ReadRequestType.ReadState,
      paths: [[new Uint8Array([1, 2, 3])]],
      sender: Principal.anonymous(),
      ingress_expiry: Expiry.fromDeltaInMilliseconds(300000),
    },
  };
}

describe('AttributesIdentity', () => {
  const attributes = {
    data: new Uint8Array([1, 2, 3]),
    signature: new Uint8Array([4, 5, 6]),
  };
  const signer = { canisterId: Principal.fromText('aaaaa-aa') };

  it('should delegate getPrincipal to the inner identity', () => {
    const inner = createIdentity(0);
    const identity = new AttributesIdentity({ inner, attributes, signer });

    expect(identity.getPrincipal().toText()).toEqual(inner.getPrincipal().toText());
  });

  it('should include sender_info in the transformed request body for call endpoint', async () => {
    const inner = createIdentity(0);
    const identity = new AttributesIdentity({ inner, attributes, signer });

    const request = makeCallRequest();
    const result = (await identity.transformRequest(request)) as {
      body: { content: Record<string, unknown> };
    };

    expect(result.body.content).toHaveProperty('sender_info');
    expect(result.body.content.sender_info).toEqual({
      signer: signer.canisterId.toUint8Array(),
      info: attributes.data,
      sig: attributes.signature,
    });
  });

  it('should include sender_info in the request ID hash for call endpoint', async () => {
    const inner = createIdentity(0);
    const identity = new AttributesIdentity({ inner, attributes, signer });

    const request = makeCallRequest();
    const result = (await identity.transformRequest(request)) as {
      body: { content: Record<string, unknown> };
    };

    // The request ID should differ from one without sender_info
    const requestIdWith = requestIdOf(result.body.content);
    const requestIdWithout = requestIdOf(request.body);

    expect(requestIdWith).not.toEqual(requestIdWithout);
  });

  it('should NOT inject sender_info for read_state endpoint', async () => {
    const inner = createIdentity(0);
    const identity = new AttributesIdentity({ inner, attributes, signer });

    const request = makeReadStateRequest();
    const result = (await identity.transformRequest(request)) as {
      body: { content: Record<string, unknown> };
    };

    expect(result.body.content).not.toHaveProperty('sender_info');
  });

  it('should produce read_state request hash matching the un-decorated body', async () => {
    const inner = createIdentity(0);
    const identity = new AttributesIdentity({ inner, attributes, signer });

    const request = makeReadStateRequest();
    const decorated = (await identity.transformRequest(request)) as {
      body: { content: Record<string, unknown> };
    };

    // The IC computes its hash over the original body (without sender_info).
    // The decorated content must hash identically, otherwise sender_sig won't verify.
    expect(requestIdOf(decorated.body.content)).toEqual(requestIdOf(request.body));
  });

  it('should work with DelegationIdentity as inner', async () => {
    const root = createIdentity(1);
    const session = createIdentity(0);

    const chain = await DelegationChain.create(root, session.getPublicKey(), new Date(1609459200000));
    const delegation = DelegationIdentity.fromDelegation(session, chain);
    const identity = new AttributesIdentity({ inner: delegation, attributes, signer });

    expect(identity.getPrincipal().toText()).toEqual(delegation.getPrincipal().toText());

    const request = makeCallRequest();
    const result = (await identity.transformRequest(request)) as {
      body: {
        content: Record<string, unknown>;
        sender_delegation: unknown;
        sender_pubkey: unknown;
        sender_sig: unknown;
      };
    };

    // Should have both sender_info in content and delegation fields in the envelope
    expect(result.body.content).toHaveProperty('sender_info');
    expect(result.body).toHaveProperty('sender_delegation');
    expect(result.body).toHaveProperty('sender_pubkey');
    expect(result.body).toHaveProperty('sender_sig');
  });
});
