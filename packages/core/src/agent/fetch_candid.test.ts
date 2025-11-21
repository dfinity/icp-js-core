import { fetchCandid, HttpAgent } from './index.ts';
import { IDL } from '#candid';
import * as cbor from './cbor.ts';

test('simulate fetching a Candid interface', async () => {
  jest.useRealTimers();
  const mockFetch = jest.fn().mockImplementation((/*resource, init*/) => {
    return Promise.resolve(
      new Response(
        cbor.encode({
          status: 'replied',
          reply: {
            arg: IDL.encode([IDL.Text], ['service {}']),
          },
        }),
        {
          status: 200,
        },
      ),
    );
  });

  const agent = new HttpAgent({
    fetch: mockFetch,
    host: 'http://127.0.0.1',
    verifyQuerySignatures: false,
    backoffStrategy: () => {
      return {
        next: () => 0,
      };
    },
  });

  const candid = await fetchCandid('ryjl3-tyaaa-aaaaa-aaaba-cai', agent);

  expect(candid).toMatch(/service/);
});
