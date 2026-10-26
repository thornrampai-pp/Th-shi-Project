import nacl from 'tweetnacl';

/**
 * Verifies that an incoming HTTP request really came from Discord, per their
 * Interactions Endpoint spec (Ed25519 signature over timestamp + raw body).
 * Must run against the RAW request body — parsing it as JSON first and
 * re-serializing would not reproduce the exact bytes Discord signed.
 */
export function verifyDiscordSignature(params: {
  signature: string;
  timestamp: string;
  rawBody: Buffer;
  publicKey: string;
}): boolean {
  try {
    return nacl.sign.detached.verify(
      Buffer.concat([Buffer.from(params.timestamp, 'utf8'), params.rawBody]),
      Buffer.from(params.signature, 'hex'),
      Buffer.from(params.publicKey, 'hex'),
    );
  } catch {
    return false;
  }
}
