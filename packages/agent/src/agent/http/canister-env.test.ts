import { bytesToHex } from '@noble/hashes/utils';
import { getCanisterEnv, safeGetCanisterEnv } from './canister-env.ts';
import { InputError, InvalidRootKeyErrorCode, MissingRootKeyErrorCode } from '../../errors.ts';
import { JSDOM } from 'jsdom';

const mockRootKeyHex = 'a'.repeat(266); // 133 bytes

describe('getCanisterEnv', () => {
  describe('with document available (browser environment)', () => {
    beforeAll(() => {
      const jsdom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'https://example.com',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).document = jsdom.window.document;
    });

    afterAll(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).document;
    });

    beforeEach(() => {
      // Reset document.cookie before each test
      Object.defineProperty(globalThis.document, 'cookie', {
        writable: true,
        value: '',
      });
    });

    describe('successful parsing', () => {
      test('should parse cookie with IC_ROOT_KEY', () => {
        const cookieValue = `ic_root_key=${mockRootKeyHex}`;
        setCookie(cookieValue);

        const env = getCanisterEnv()!;

        expect(env.IC_ROOT_KEY).toBeDefined();
        expect(env.IC_ROOT_KEY).toBeInstanceOf(Uint8Array);
        expect(bytesToHex(env.IC_ROOT_KEY)).toBe(mockRootKeyHex);
      });

      test('should parse cookie with IC_ROOT_KEY and additional env vars', () => {
        type TestCanisterEnv = {
          readonly ['PUBLIC_CANISTER_ID:backend']: string;
          readonly PUBLIC_API_URL: string;
        };

        const cookieValue = `ic_root_key=${mockRootKeyHex}&PUBLIC_CANISTER_ID:backend=rrkah-fqaaa-aaaaa-aaaaq-cai&PUBLIC_API_URL=https://api.example.com`;
        setCookie(cookieValue);

        const env = getCanisterEnv<TestCanisterEnv>()!;

        expect(env.IC_ROOT_KEY).toBeInstanceOf(Uint8Array);
        expect(bytesToHex(env.IC_ROOT_KEY)).toBe(mockRootKeyHex);
        expect(env['PUBLIC_CANISTER_ID:backend']).toBe('rrkah-fqaaa-aaaaa-aaaaq-cai');
        expect(env.PUBLIC_API_URL).toBe('https://api.example.com');
      });

      test('should parse cookie with env vars containing = in values', () => {
        type TestCanisterEnv = {
          readonly IC_ROOT_KEY: Uint8Array;
          readonly PUBLIC_SECRET: string;
        };

        const valueWithEquals = 'base64value==';
        const cookieValue = `ic_root_key=${mockRootKeyHex}&PUBLIC_SECRET=${valueWithEquals}`;
        setCookie(cookieValue);

        const env = getCanisterEnv<TestCanisterEnv>()!;

        expect(env.PUBLIC_SECRET).toBe(valueWithEquals);
      });

      test('should handle cookie with custom name', () => {
        const cookieValue = `ic_root_key=${mockRootKeyHex}`;
        const customCookieName = 'custom_env';
        setCookie(cookieValue, customCookieName);

        const env = getCanisterEnv({ cookieName: customCookieName })!;

        expect(env.IC_ROOT_KEY).toBeInstanceOf(Uint8Array);
        expect(bytesToHex(env.IC_ROOT_KEY)).toBe(mockRootKeyHex);
      });

      test('should handle multiple cookies with ic_env cookie in different positions', () => {
        type TestCanisterEnv = {
          readonly IC_ROOT_KEY: Uint8Array;
          readonly PUBLIC_API_URL: string;
        };

        const cookieValue = `ic_root_key=${mockRootKeyHex}&PUBLIC_API_URL=https://api.example.com`;

        Object.defineProperty(globalThis.document, 'cookie', {
          writable: true,
          value: `ic_env=${encodeURIComponent(cookieValue)}; session=xyz; lang=en`,
        });

        const env1 = getCanisterEnv<TestCanisterEnv>()!;
        expect(env1.IC_ROOT_KEY).toBeInstanceOf(Uint8Array);
        expect(env1.PUBLIC_API_URL).toBe('https://api.example.com');

        Object.defineProperty(globalThis.document, 'cookie', {
          writable: true,
          value: `theme=light; ic_env=${encodeURIComponent(cookieValue)}; user_id=456`,
        });

        const env2 = getCanisterEnv<TestCanisterEnv>()!;
        expect(env2.IC_ROOT_KEY).toBeInstanceOf(Uint8Array);
        expect(env2.PUBLIC_API_URL).toBe('https://api.example.com');

        Object.defineProperty(globalThis.document, 'cookie', {
          writable: true,
          value: `auth=token123; preferences=setting1; ic_env=${encodeURIComponent(cookieValue)}`,
        });

        const env3 = getCanisterEnv<TestCanisterEnv>()!;
        expect(env3.IC_ROOT_KEY).toBeInstanceOf(Uint8Array);
        expect(env3.PUBLIC_API_URL).toBe('https://api.example.com');
      });

      test('should handle cookie with spaces around name', () => {
        const cookieValue = `ic_root_key=${mockRootKeyHex}`;
        Object.defineProperty(globalThis.document, 'cookie', {
          writable: true,
          value: `  ic_env=${encodeURIComponent(cookieValue)}`,
        });

        const env = getCanisterEnv()!;

        expect(env.IC_ROOT_KEY).toBeInstanceOf(Uint8Array);
        expect(bytesToHex(env.IC_ROOT_KEY)).toBe(mockRootKeyHex);
      });

      test('should properly decode URI-encoded cookie values', () => {
        type TestCanisterEnv = {
          readonly IC_ROOT_KEY: Uint8Array;
          readonly PUBLIC_MESSAGE: string;
        };

        const specialChars = 'Hello World!@#$%';
        const cookieValue = `ic_root_key=${mockRootKeyHex}&PUBLIC_MESSAGE=${specialChars}`;
        setCookie(cookieValue);

        const env = getCanisterEnv<TestCanisterEnv>()!;

        expect(env.PUBLIC_MESSAGE).toBe(specialChars);
      });
    });

    describe('no cookie', () => {
      test('should return undefined when cookie is not present', () => {
        setCookie('value', 'other_cookie');

        expect(getCanisterEnv()).toBeUndefined();
      });

      test('should return undefined when document.cookie is empty', () => {
        Object.defineProperty(globalThis.document, 'cookie', {
          writable: true,
          value: '',
        });

        expect(getCanisterEnv()).toBeUndefined();
      });

      test('should return undefined when custom cookie name is not found', () => {
        setCookie('something');

        expect(getCanisterEnv({ cookieName: 'custom_env' })).toBeUndefined();
      });
    });

    describe('IC_ROOT_KEY validation', () => {
      test('should handle empty hex string', () => {
        const cookieValue = `ic_root_key=`;
        setCookie(cookieValue);

        expect.assertions(3);
        try {
          getCanisterEnv();
        } catch (error) {
          expect(error).toBeInstanceOf(InputError);
          expect((error as InputError).code).toBeInstanceOf(InvalidRootKeyErrorCode);
          expect((error as InputError).message).toEqual(
            'Invalid root key. Expected length: 133, actual length: 0',
          );
        }
      });

      test('should handle long hex strings', () => {
        // 96 bytes (192 hex characters)
        const longHex = 'a'.repeat(192);
        const cookieValue = `ic_root_key=${longHex}`;
        setCookie(cookieValue);

        expect.assertions(3);
        try {
          getCanisterEnv();
        } catch (error) {
          expect(error).toBeInstanceOf(InputError);
          expect((error as InputError).code).toBeInstanceOf(InvalidRootKeyErrorCode);
          expect((error as InputError).message).toEqual(
            'Invalid root key. Expected length: 133, actual length: 96',
          );
        }
      });

      test('should handle missing root key', () => {
        const cookieValue = `PUBLIC_CANISTER_ID:backend=rrkah-fqaaa-aaaaa-aaaaq-cai`;
        setCookie(cookieValue);

        expect.assertions(2);
        try {
          getCanisterEnv();
        } catch (error) {
          expect(error).toBeInstanceOf(InputError);
          expect((error as InputError).code).toBeInstanceOf(MissingRootKeyErrorCode);
        }
      });
    });
  });

  describe('without document (Node.js environment)', () => {
    beforeAll(() => {
      // Remove document to simulate Node.js environment
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).document;
    });

    test('should throw TypeError when trying to access document', () => {
      expect(() => {
        getCanisterEnv();
      }).toThrow(TypeError);
    });
  });
});

describe('safeGetCanisterEnv', () => {
  describe('with document available (browser environment)', () => {
    beforeAll(() => {
      const jsdom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: 'https://example.com',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).document = jsdom.window.document;
    });

    afterAll(() => {
      // Clean up JSDOM
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).document;
    });

    beforeEach(() => {
      Object.defineProperty(globalThis.document, 'cookie', {
        writable: true,
        value: '',
      });
    });

    test('should work like getCanisterEnv when document exists', () => {
      const cookieValue = `ic_root_key=${mockRootKeyHex}`;
      setCookie(cookieValue);

      const env = safeGetCanisterEnv()!;

      expect(env.IC_ROOT_KEY).toBeDefined();
      expect(env.IC_ROOT_KEY).toBeInstanceOf(Uint8Array);
      expect(bytesToHex(env.IC_ROOT_KEY)).toBe(mockRootKeyHex);
    });

    test('should return undefined when cookie is not present', () => {
      setCookie('value', 'other_cookie');

      expect(safeGetCanisterEnv()).toBeUndefined();
    });

    test('should handle custom cookie name', () => {
      const customCookieName = 'custom_env';
      const cookieValue = `ic_root_key=${mockRootKeyHex}`;
      setCookie(cookieValue, customCookieName);

      const env = safeGetCanisterEnv({ cookieName: customCookieName })!;

      expect(env.IC_ROOT_KEY).toBeInstanceOf(Uint8Array);
      expect(bytesToHex(env.IC_ROOT_KEY)).toBe(mockRootKeyHex);
    });
  });

  describe('without document available (Node.js environment)', () => {
    beforeAll(() => {
      // Ensure document is not available
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).document;
    });

    test('should return undefined in Node.js environment', () => {
      expect(safeGetCanisterEnv()).toBeUndefined();
    });

    test('should return undefined even with custom cookie name', () => {
      expect(safeGetCanisterEnv({ cookieName: 'custom_env' })).toBeUndefined();
    });
  });
});

function setCookie(value: string, name: string = 'ic_env') {
  Object.defineProperty(globalThis.document, 'cookie', {
    writable: true,
    value: `${name}=${encodeURIComponent(value)}`,
  });
}
