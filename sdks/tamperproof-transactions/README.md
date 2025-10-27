# tamperproof-transactions

[![npm version](https://img.shields.io/npm/v/@uniswap/tamperproof-transactions.svg)](https://www.npmjs.com/package/@uniswap/tamperproof-transactions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Implementation of [EIP-7754](https://eips.ethereum.org/EIPS/eip-7754)

**Repository:** [https://github.com/Uniswap/sdks](https://github.com/Uniswap/sdks)

## Installation

```bash
yarn add @uniswap/tamperproof-transactions
# or
npm install @uniswap/tamperproof-transactions
```

## API

### Supported algorithms

Algorithms are specified using standard JWS-style names. The library currently supports:

```ts
'ES256' | 'ES384' | 'ES512' | 'EdDSA' | 'PS256' | 'PS384' | 'PS512' | 'RS256' | 'RS384' | 'RS512'
```

---

### `sign(data, privateKeyHex, algorithm): Promise<string>`

Signs input using Web Crypto with the given algorithm.

- **data**: `string | object`. If an object is provided, it is serialized to bytes using canonical JSON (sorted keys, `undefined` dropped).
- **privateKeyHex**: PKCS#8-encoded private key as a hex string (with or without `0x`).
- **algorithm**: one of the supported algorithm names listed above.
- Returns a `Promise<string>` resolving to a hex string signature prefixed with `0x`. For ECDSA algorithms, the signature is raw `r || s` bytes.

#### Example

```ts
import { sign } from '@uniswap/tamperproof-transactions';

const data = { method: 'eth_sendTransaction', params: { to: '0xabc...', value: '0x1' } };
const privateKeyHex = '0x...'; // PKCS#8 private key, hex-encoded
const signature = await sign(data, privateKeyHex, 'RS256');
```

---

### `verifyAsyncJson(calldata, signatureHex, url, id): Promise<boolean>`

Verifies a signature by fetching a manifest of public keys (over HTTPS) and selecting the key with matching `id`.

- **calldata**: `string | object` (object is canonicalized the same way as in `sign`).
- **signatureHex**: hex string signature (with or without `0x`).
- **url**: a `URL` instance pointing to the manifest (must be `https:`).
- **id**: string identifier of the public key within the manifest.

#### Example

```ts
import { verifyAsyncJson } from '@uniswap/tamperproof-transactions';

const url = new URL('https://example.com/keys.json');
const ok = await verifyAsyncJson({ foo: 'bar' }, '0x...', url, '1');
```

---

### `verifyAsyncDns(calldata, signatureHex, host, id): Promise<boolean>`

Resolves a DNS TXT record for `host` using DNS-over-HTTPS, extracts a `TWIST=` path, fetches the manifest over HTTPS, and verifies the signature using the key with the provided `id`.

- **calldata**: `string`.
- **signatureHex**: hex string signature (with or without `0x`).
- **host**: domain name to query for a TXT record containing `TWIST=`.
- **id**: string identifier of the public key within the manifest.

#### Example

```ts
import { verifyAsyncDns } from '@uniswap/tamperproof-transactions';

const ok = await verifyAsyncDns('hello', '0x...', 'example.com', '1');
```

---

### `verify(calldata, signatureHex, publicKey, algorithm): Promise<boolean>`

Lower-level verification helper if you already have a `CryptoKey` public key object.

- **publicKey**: a Web Crypto `CryptoKey` imported for verification.
- **algorithm**: one of the supported algorithm names listed above.

---

### `generate(...publicKeys): string`

Generates a JSON manifest string containing an array of public keys.

#### Types

```ts
type PublicKey = {
  key: string; // SPKI-encoded public key as hex (with or without 0x)
  algorithm: 'ES256' | 'ES384' | 'ES512' | 'EdDSA' | 'PS256' | 'PS384' | 'PS512' | 'RS256' | 'RS384' | 'RS512';
};
```

The returned JSON has the shape:

```json
{
  "publicKeys": [
    { "id": "1", "alg": "RS256", "publicKey": "0x..." }
  ]
}
```

#### Example

```ts
import { generate } from '@uniswap/tamperproof-transactions';

const json = generate({ key: '0x...', algorithm: 'RS256' });
```

---

### Utilities

The following helpers are also exported:

- `canonicalStringify(value: unknown): string`
- `serializeRequestPayload<T>(value: T): Uint8Array`

These are used internally to canonicalize objects before signing/verifying.

---

## License

MIT
