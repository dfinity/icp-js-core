import { type Certificate, type NodePath, lookupResultToBuffer } from '../certificate.ts';
import { CertifiedRejectErrorCode } from '../errors.ts';
import type { RequestId } from '../request_id.ts';

/**
 * Read certified reject details from a certificate at the given request status path.
 * @param certificate The certificate to read reject details from.
 * @param path The lookup path prefix (e.g. `['request_status', requestId]`).
 * @param requestId The request ID associated with the rejection.
 */
export function readCertifiedReject(
  certificate: Certificate,
  path: NodePath,
  requestId: RequestId,
): CertifiedRejectErrorCode {
  const rejectCode = new Uint8Array(
    lookupResultToBuffer(certificate.lookup_path([...path, 'reject_code']))!,
  )[0];
  const rejectMessage = new TextDecoder().decode(
    lookupResultToBuffer(certificate.lookup_path([...path, 'reject_message']))!,
  );
  const errorCodeBuf = lookupResultToBuffer(certificate.lookup_path([...path, 'error_code']));
  const errorCode = errorCodeBuf ? new TextDecoder().decode(errorCodeBuf) : undefined;
  return new CertifiedRejectErrorCode(requestId, rejectCode, rejectMessage, errorCode);
}
