import { pemToSecretKey } from './pem.ts';
import { Secp256k1KeyIdentity } from './secp256k1.ts';

const pem = `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIGfKHuyoCCCbEXb0789MIdWiCIpZo1LaKApv95SSIaWPoAcGBSuBBAAK
oUQDQgAEahC99Avid7r8D6kIeLjjxJ8kwdJRy5nPrN9o18P7xHT95i0JPr5ivc9v
CB8vG2s97NB0re2MhqvdWgradJZ8Ow==
-----END EC PRIVATE KEY-----
`;
describe('pemToSecretKey', () => {
  it('should parse a PEM-encoded key', () => {
    const key = pemToSecretKey(pem);
    expect(key).toBeDefined();
  });
  it('should resolve an expected principal', () => {
    const expected = '42gbo-uiwfn-oq452-ql6yp-4jsqn-a6bxk-n7l4z-ni7os-yptq6-3htob-vqe';

    const key = pemToSecretKey(pem);
    const identity = Secp256k1KeyIdentity.fromSecretKey(key);
    const principal = identity.getPrincipal();
    expect(principal.toString()).toEqual(expected);
  });
  it('should throw errors for invalid PEMs', () => {
    const invalidPems = [
      // no header
      `EC PRIVATE KEY-----
MHQCAQEEIGfKHuyoCCCbEXb0789MIdWiCIpZo1LaKApv95SSIaWPoAcGBSuBBAAK
oUQDQgAEahC99Avid7r8D6kIeLjjxJ8kwdJRy5nPrN9o18P7xHT95i0JPr5ivc9v
CB8vG2s97NB0re2MhqvdWgradJZ8Ow==
`,
      // no footer
      `-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIGfKHuyoCCCbEXb0789MIdWiCIpZo1LaKApv95SSIaWPoAcGBSuBBAAK
oUQDQgAEahC99Avid7r8D6kIeLjjxJ8kwdJRy5nPrN9o18P7xHT95i0JPr5ivc9v
CB8vG2s97NB0re2MhqvdWgradJZ8Ow==`,
      // no body
      `-----BEGIN EC PRIVATE KEY-----
    -----END PRIVATE KEY-----`,
      // no newlines
      `-----BEGIN EC PRIVATE KEY-----MHQCAQEEIGfKHuyoCCCbEXb0789MIdWiCIpZo1LaKApv95SSIaWPoAcGBSuBBAAKoUQDQgAEahC99Avid7r8D6kIeLjjxJ8kwdJRy5nPrN9o18P7xHT95i0JPr5ivc9vCB8vG2s97NB0re2MhqvdWgradJZ8Ow==-----END EC PRIVATE KEY-----`,

      // too long
      `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCvQz0EmoKHRxj4
oAD/n+u2GXjxTH4DrXBaUkoZ48BTXon53M05xh1Nq9rJ/efT8q9W8d8cfgKp+GAn
DcpJxHt35vXuB/rCVeZOhnSYiKmqvlWH7qTEoGdwNjPpQ7/RqRpzn168xCiU2lP1
6YGF4ThNi+FH5OxC5CDv2Ms46A+Y1uc5qLJH0RZO9hWs93WhN9el7VENF9D/XG/U
Mwy4cUc+qn1ER+HcpmjAFAnGxtnVitLAsNVxv08PWCX5c7rF+b1hZ4cCbxeWBZAu
khPvsK/r75NDign7Fp8zJuRdfgFy2PnMw5S2fuj+VcLPPYAjBgMzU1C7hSCq48JF
cAP2Ryx7AgMBAAECggEAL2YDzobq3iMAQd0j5/4cBTeGWdvSCLSTOhofKDlL/kAH
GKf6aLGHo0Xi+dXNKKjtepoXOOFrXwRpHKbCGokkyxyPTjyiOIR6sKn0RnxPRnoL
L6P+s56d2t8N0vwbmFwfZz2mpW53eypAorTv7oEmdPJrjsH+k2iW78a1z0ITVcX2
VkSXMFuDCjoD9cqgO3SIjw2ZA3q+C78Sqk3qije8/oC3SJZckt6RlHgh0FBAiJ0Z
lAjQ7KK+bNupEjNK1YLDzQxkcFLol8EpF1kmxtsbnRMurnRnJqWfrJO4Xn/2uB8Z
zNcCBLj4ZTyOHciLuvSGDbhQ4EMhHkWr2JTXRYuRoQKBgQDWbymEzs+RiShwC/b0
MiQpPLmjj5UunZNLKK8xWhEhqKZ06tmCJT/kY8sEDAX6DVBGMYK8A7KNLzh4BC4h
KC/C7UjWD7xUWW8nEplVnslqIfpOsvbM7+lRLFsmT7eu4MRheVmO+lOQxoBM5nqV
gDcLJu4kclKS9/MRcSh2in6ClQKBgQDRPEVS9G59lV9wXQWAteXO1Byf5cwaDiti
H1hXHspZJYDqdgGCa9fsI0tqe3XP/0O0Hl6AMLKkaoWfxsIIL4gYnV5HnUJDDcPA
ZkuemPqmNlxmOUprRvZxaSMkV0Jntweu+XJ5WKNTnzyn2cJf7QueLR6I4/nbRS+E
40qARY2+zwKBgEUwVPsvJ7ZTxSJyGdqtGxHbMCLgP0htO4tysyR/ZSuxGRR8enYN
wtHUiTrjDkKibRZY/0/e+YuogtXms2Orbc29dlTret7UhJLc43DG7UI7eGJQSGXT
uzqfz0FLU38vsu2olAcYKkJ6agdmDoOSfTAx/YDxCke1jU5Bbsbg5PUJAoGBAJW0
pPlMsL2kIaw4slY8T5gjxfNWLSm7V6kWOlPjUO5l2g5nrn7NgKmRO0WN3mabAqse
S4k2zqq7GK6QPIY01BCgkDN3PlDRyWyhBJwOYtCH9qaheTC2jl/o1N8MnBOvLo0w
J4rRM9MCDRkfwmZ2KajcKYvSahRMNUrEgaqzmU6bAoGATJe1+dPiylfpOjPeLi+b
XUbrtdhkX98LWviI+xdFmM9aEIBNHRsXYlZ08jkZKg+tdDYbyYN1FulaeoBjO59Q
oKzGLP8ZY3TSs7tPHvYkMtJ8XAXdc+P1Pc9Gfb0LEUozLtBNJu/o0Ku0U6aiYSJH
AxFAcv7NorJ3jnKxFqeuL58=
-----END PRIVATE KEY-----
`,
    ];
    invalidPems.forEach(pem => {
      expect(() => pemToSecretKey(pem)).toThrow();
    });
  });
});
