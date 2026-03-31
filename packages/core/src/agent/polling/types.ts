import type { Certificate } from '../certificate.ts';
import type { Principal } from '#principal';
import type { RequestStatusResponseStatus } from '../agent/http/types.ts';
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

/**
 * The result of polling for a response, including the certificate, reply bytes, and raw certificate bytes.
 */
export interface PollForResponseResult {
  /** The certificate for the request, which can be used to verify the reply. */
  certificate: Certificate;
  /** The reply bytes for the request. */
  reply: Uint8Array;
  /** The raw certificate bytes for the request. */
  rawCertificate: Uint8Array;
}
