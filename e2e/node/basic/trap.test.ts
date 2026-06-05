import { describe, it, expect } from 'vitest';
import type { ActorMethod } from '@icp-sdk/core/agent';
import { Actor, AgentError, CertifiedRejectErrorCode } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';
import { requireEnv } from '../test-setup.ts';
import { makeAgent } from '../utils/agent.ts';

const trapCanisterId = requireEnv('CANISTER_ID_TRAP');

export const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  return IDL.Service({
    Throw: IDL.Func([], [], []),
    test: IDL.Func([], [], []),
  });
};

export interface _SERVICE {
  Throw: ActorMethod<[], undefined>;
  test: ActorMethod<[], undefined>;
}

describe('trap', () => {
  it('should trap', async () => {
    const agent = await makeAgent();
    const actor = Actor.createActor<_SERVICE>(idlFactory, { canisterId: trapCanisterId, agent });
    expect.assertions(3);
    try {
      await actor.Throw();
    } catch (error) {
      expect(error).toBeInstanceOf(AgentError);
      const errorCode = (error as AgentError).cause.code;
      expect(errorCode).toBeInstanceOf(CertifiedRejectErrorCode);
      expect((errorCode as CertifiedRejectErrorCode).rejectMessage).toBe('foo');
    }
  });
  it('should trap', async () => {
    const agent = await makeAgent();
    const actor = Actor.createActor<_SERVICE>(idlFactory, { canisterId: trapCanisterId, agent });
    expect.assertions(3);
    try {
      await actor.test();
    } catch (error) {
      expect(error).toBeInstanceOf(AgentError);
      const errorCode = (error as AgentError).cause.code;
      expect(errorCode).toBeInstanceOf(CertifiedRejectErrorCode);
      expect((errorCode as CertifiedRejectErrorCode).rejectMessage).toContain('trapping');
    }
  });
});
