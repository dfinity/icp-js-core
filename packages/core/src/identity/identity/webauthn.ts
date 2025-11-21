import {
  type DerEncodedPublicKey,
  type PublicKey,
  type Signature,
  SignIdentity,
  wrapDER,
  DER_COSE_OID,
  Cbor,
} from '#agent';
import { bytesToHex, hexToBytes, randomBytes, bytesToUtf8 } from '@noble/hashes/utils';
import { uint8FromBufLike } from '#candid';

function _coseToDerEncodedBlob(cose: Uint8Array): DerEncodedPublicKey {
  return wrapDER(cose, DER_COSE_OID) as DerEncodedPublicKey;
}

type PublicKeyCredentialWithAttachment = PublicKeyCredential & {
  // Extends `PublicKeyCredential` with an optional field introduced in the WebAuthn level 3 spec:
  // https://w3c.github.io/webauthn/#dom-publickeycredential-authenticatorattachment
  // Already supported by Chrome, Safari and Edge
  // Note: `null` is included here as a possible value because Edge set this value to null in the
  // past.
  authenticatorAttachment: AuthenticatorAttachment | undefined | null;
  // Explicitly including toJSON method from the base PublicKeyCredential interface
  toJSON: () => Record<string, unknown>;
};

/**
 * From the documentation;
 * The authData is a byte array described in the spec. Parsing it will involve slicing bytes from
 * the array and converting them into usable objects.
 *
 * See https://webauthn.guide/#registration (subsection "Example: Parsing the authenticator data").
 * @param authData The authData field of the attestation response.
 * @returns The COSE key of the authData.
 */
function _authDataToCose(authData: Uint8Array): Uint8Array {
  const dataView = new DataView(new ArrayBuffer(2));
  const idLenBytes = authData.slice(53, 55);
  [...new Uint8Array(idLenBytes)].forEach((v, i) => dataView.setUint8(i, v));
  const credentialIdLength = dataView.getUint16(0);

  // Get the public key object.
  return authData.slice(55 + credentialIdLength);
}

export class CosePublicKey implements PublicKey {
  protected _encodedKey: DerEncodedPublicKey;

  public constructor(protected _cose: Uint8Array) {
    this._encodedKey = _coseToDerEncodedBlob(_cose);
  }

  public toDer(): DerEncodedPublicKey {
    return this._encodedKey;
  }

  public getCose(): Uint8Array {
    return this._cose;
  }
}

/**
 * Create a challenge from a string or array. The default challenge is always the same
 * because we don't need to verify the authenticity of the key on the server (we don't
 * register our keys with the IC). Any challenge would do, even one per key, randomly
 * generated.
 * @param challenge The challenge to transform into a byte array. By default a hard
 *        coded string.
 */
function _createChallengeBuffer(challenge: string | Uint8Array = '<ic0.app>'): Uint8Array {
  if (typeof challenge === 'string') {
    return Uint8Array.from(challenge, c => c.charCodeAt(0));
  } else {
    return challenge;
  }
}

/**
 * Create a credentials to authenticate with a server. This is necessary in order in
 * WebAuthn to get credentials IDs (which give us the public key and allow us to
 * sign), but in the case of the Internet Computer, we don't actually need to register
 * it, so we don't.
 * @param credentialCreationOptions an optional CredentialCreationOptions object
 */
async function _createCredential(
  credentialCreationOptions?: CredentialCreationOptions,
): Promise<PublicKeyCredentialWithAttachment | null> {
  const creds = (await navigator.credentials.create(
    credentialCreationOptions ?? {
      publicKey: {
        authenticatorSelection: {
          userVerification: 'preferred',
        },
        attestation: 'direct',
        challenge: _createChallengeBuffer(),
        pubKeyCredParams: [{ type: 'public-key', alg: PubKeyCoseAlgo.ECDSA_WITH_SHA256 }],
        rp: {
          name: 'Internet Identity Service',
        },
        user: {
          id: randomBytes(16),
          name: 'Internet Identity',
          displayName: 'Internet Identity',
        },
      },
    },
  )) as PublicKeyCredentialWithAttachment | null;

  if (creds === null) {
    return null;
  }

  return {
    // do _not_ use ...creds here, as creds is not enumerable in all cases
    id: creds.id,
    response: creds.response,
    type: creds.type,
    authenticatorAttachment: creds.authenticatorAttachment,
    getClientExtensionResults: creds.getClientExtensionResults,
    // Some password managers will return a Uint8Array, so we ensure we return an ArrayBuffer.
    rawId: creds.rawId,
    toJSON: creds.toJSON.bind(creds), // Ensure the toJSON method is included
  };
}

// See https://www.iana.org/assignments/cose/cose.xhtml#algorithms for a complete
// list of these algorithms. We only list the ones we support here.
enum PubKeyCoseAlgo {
  ECDSA_WITH_SHA256 = -7,
}

/**
 * A SignIdentity that uses `navigator.credentials`. See https://webauthn.guide/ for
 * more information about WebAuthentication.
 */
export class WebAuthnIdentity extends SignIdentity {
  /**
   * Create an identity from a JSON serialization.
   * @param json - json to parse
   */
  public static fromJSON(json: string): WebAuthnIdentity {
    const { publicKey, rawId } = JSON.parse(json);

    if (typeof publicKey !== 'string' || typeof rawId !== 'string') {
      throw new Error('Invalid JSON string.');
    }

    return new this(hexToBytes(rawId), hexToBytes(publicKey), undefined);
  }

  /**
   * Create an identity.
   * @param credentialCreationOptions an optional CredentialCreationOptions Challenge
   */
  public static async create(
    credentialCreationOptions?: CredentialCreationOptions,
  ): Promise<WebAuthnIdentity> {
    const creds = await _createCredential(credentialCreationOptions);

    if (!creds || creds.type !== 'public-key') {
      throw new Error('Could not create credentials.');
    }

    const response = creds.response as AuthenticatorAttestationResponse;
    if (response.attestationObject === undefined) {
      throw new Error('Was expecting an attestation response.');
    }

    // Parse the attestationObject as CBOR.
    const attObject = Cbor.decode<{ authData: Uint8Array }>(
      new Uint8Array(response.attestationObject),
    );

    return new this(
      uint8FromBufLike(creds.rawId),
      _authDataToCose(attObject.authData),
      creds.authenticatorAttachment ?? undefined,
    );
  }

  protected _publicKey: CosePublicKey;

  public constructor(
    public readonly rawId: Uint8Array,
    cose: Uint8Array,
    protected authenticatorAttachment: AuthenticatorAttachment | undefined,
  ) {
    super();
    this._publicKey = new CosePublicKey(cose);
  }

  public getPublicKey(): PublicKey {
    return this._publicKey;
  }

  /**
   * WebAuthn level 3 spec introduces a new attribute on successful WebAuthn interactions,
   * see https://w3c.github.io/webauthn/#dom-publickeycredential-authenticatorattachment.
   * This attribute is already implemented for Chrome, Safari and Edge.
   *
   * Given the attribute is only available after a successful interaction, the information is
   * provided opportunistically and might also be `undefined`.
   */
  public getAuthenticatorAttachment(): AuthenticatorAttachment | undefined {
    return this.authenticatorAttachment;
  }

  public async sign(blob: Uint8Array): Promise<Signature> {
    const result = (await navigator.credentials.get({
      publicKey: {
        allowCredentials: [
          {
            type: 'public-key',
            id: this.rawId,
          },
        ],
        challenge: blob,
        userVerification: 'preferred',
      },
    })) as PublicKeyCredentialWithAttachment;

    if (result.authenticatorAttachment !== null) {
      this.authenticatorAttachment = result.authenticatorAttachment;
    }

    const response = result.response as AuthenticatorAssertionResponse;

    const encoded = Cbor.encode({
      authenticator_data: response.authenticatorData,
      client_data_json: bytesToUtf8(new Uint8Array(response.clientDataJSON)),
      signature: response.signature,
    });

    if (!encoded) {
      throw new Error('failed to encode cbor');
    }

    Object.assign(encoded, {
      __signature__: undefined,
    });

    return encoded as Signature;
  }

  /**
   * Allow for JSON serialization of all information needed to reuse this identity.
   */
  public toJSON(): JsonnableWebAuthnIdentity {
    return {
      publicKey: bytesToHex(this._publicKey.getCose()),
      rawId: bytesToHex(this.rawId),
    };
  }
}

/**
 * ReturnType<WebAuthnIdentity.toJSON>
 */
export interface JsonnableWebAuthnIdentity {
  // The hexadecimal representation of the DER encoded public key.
  publicKey: string;
  // The string representation of the local WebAuthn Credential.id (base64url encoded).
  rawId: string;
}
