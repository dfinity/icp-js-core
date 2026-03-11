import { LookupPathStatus } from '../certificate.ts';
import { CertifiedRejectErrorCode } from '../errors.ts';
import type { RequestId } from '../request_id.ts';
import { readCertifiedReject } from './certificateReject.ts';

const textEncoder = new TextEncoder();

function makeMockCertificate(rejectCode: number, rejectMessage: string, errorCode?: string) {
  return {
    lookup_path(path: (string | Uint8Array)[]) {
      const last = path[path.length - 1];
      const key = typeof last === 'string' ? last : new TextDecoder().decode(last);

      switch (key) {
        case 'reject_code':
          return {
            status: LookupPathStatus.Found,
            value: new Uint8Array([rejectCode]),
          };
        case 'reject_message':
          return {
            status: LookupPathStatus.Found,
            value: textEncoder.encode(rejectMessage),
          };
        case 'error_code':
          if (errorCode) {
            return {
              status: LookupPathStatus.Found,
              value: textEncoder.encode(errorCode),
            };
          }
          return { status: LookupPathStatus.Absent };
        default:
          throw new Error(`Unexpected path key: ${key}`);
      }
    },
  } as Parameters<typeof readCertifiedReject>[0];
}

describe('readCertifiedReject', () => {
  const requestId = new Uint8Array([1, 2, 3]) as RequestId;
  const path = [textEncoder.encode('request_status'), requestId];

  it.each([
    { rejectCode: 4, rejectMessage: 'canister trapped', errorCode: 'IC0503' },
    { rejectCode: 5, rejectMessage: 'canister rejected', errorCode: undefined },
  ])(
    'returns CertifiedRejectErrorCode with code=$rejectCode errorCode=$errorCode',
    ({ rejectCode, rejectMessage, errorCode }) => {
      const cert = makeMockCertificate(rejectCode, rejectMessage, errorCode);

      const result = readCertifiedReject(cert, path, requestId);

      expect(result).toBeInstanceOf(CertifiedRejectErrorCode);
      expect(result.rejectCode).toBe(rejectCode);
      expect(result.rejectMessage).toBe(rejectMessage);
      expect(result.rejectErrorCode).toBe(errorCode);
    },
  );
});
