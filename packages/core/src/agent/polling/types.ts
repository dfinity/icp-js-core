import type { Principal } from '#principal';
import type { RequestStatusResponseStatus } from '../agent/http/index.ts';
import type { RequestId } from '../request_id.ts';

export type PollStrategy = (
  canisterId: Principal,
  requestId: RequestId,
  status: RequestStatusResponseStatus,
) => Promise<void>;

export type Predicate<T> = (
  canisterId: Principal,
  requestId: RequestId,
  status: RequestStatusResponseStatus,
) => Promise<T>;
