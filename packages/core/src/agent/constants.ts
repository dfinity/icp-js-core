// Default delta for ingress expiry is 5 minutes.
export const DEFAULT_INGRESS_EXPIRY_DELTA_IN_MSECS = 5 * 60 * 1000;

/**
 * The `\x0Aic-request` domain separator used in the signature of IC requests.
 */
export const IC_REQUEST_DOMAIN_SEPARATOR = new TextEncoder().encode('\x0Aic-request');

/**
 * The `\x0Bic-response` domain separator used in the signature of IC responses.
 */
export const IC_RESPONSE_DOMAIN_SEPARATOR = new TextEncoder().encode('\x0Bic-response');

/**
 * The `\x1Aic-request-auth-delegation` domain separator used in the signature of delegations.
 */
export const IC_REQUEST_AUTH_DELEGATION_DOMAIN_SEPARATOR = new TextEncoder().encode(
  '\x1Aic-request-auth-delegation',
);
