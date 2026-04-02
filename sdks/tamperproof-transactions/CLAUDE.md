> **Last Updated:** 2025-11-19

# CLAUDE.md - @uniswap/tamperproof-transactions

## Overview

The tamperproof-transactions package provides a TypeScript/JavaScript implementation of [EIP-7754](https://eips.ethereum.org/EIPS/eip-7754) for cryptographically secure transaction signing and verification. This SDK enables applications to create tamper-proof signatures for transactions and verify signatures using multiple distribution methods (direct JSON manifests or DNS-based key lookup).

**Purpose**: Provide cross-platform (browser and Node.js) Web Crypto API abstractions for signing transaction data and verifying signatures against public keys, with support for 10 industry-standard cryptographic algorithms.

**Version**: 2.0.0 (published to npm as `@uniswap/tamperproof-transactions`)

**Primary Use Cases**:
- Unichain block sequencer signature verification
- Transaction attestation and proof-of-work
- MEV-protected transaction submission
- Cross-chain bridge security
- Trusted execution environment (TEE) transaction validation

## Architecture

### High-Level Design

```
┌─────────────────────────────────────────────────────┐
│          User Application Layer                      │
│  (sign/verify transactions, generate key manifests) │
└────────────┬────────────────────────────────────────┘
             │
    ┌────────┴────────┬───────────────┬─────────────┐
    │                 │               │             │
    v                 v               v             v
┌────────────┐  ┌──────────────┐  ┌─────────┐  ┌────────────┐
│ sign.ts    │  │ verify.ts    │  │generate │  │algorithms │
│ (signing   │  │ (verification)   │.ts    │  │.ts        │
│ logic)     │  │                  │       │  │ (algo     │
│            │  │ - verifyAsyncJson│       │  │  configs) │
│            │  │ - verifyAsyncDns │       │  │           │
│            │  │ - verify         │       │  │           │
└────────────┘  └──────────────────┘  └─────────┘  └────────────┘
       │                │                  │              │
       │                │                  │              │
       └────────┬───────┴──────────────────┴──────────────┘
                │
         ┌──────v──────────────────────────┐
         │  Utility Layer                   │
         │  ┌────────────────────────────┐ │
         │  │ canonicalJson.ts           │ │
         │  │ - canonicalStringify()     │ │
         │  │ - serializeRequestPayload()│ │
         │  │ (Deterministic JSON)       │ │
         │  └────────────────────────────┘ │
         │  ┌────────────────────────────┐ │
         │  │ hex.ts                     │ │
         │  │ - fromHex()                │ │
         │  │ - toHex()                  │ │
         │  │ - normalizeHex()           │ │
         │  │ - fromBase64()             │ │
         │  └────────────────────────────┘ │
         │  ┌────────────────────────────┐ │
         │  │ txtRecord.ts               │ │
         │  │ - parseTxtRecord()         │ │
         │  │ - processTxtRecordData()   │ │
         │  └────────────────────────────┘ │
         └──────────────────────────────────┘
                │
         ┌──────v──────────────────────────┐
         │  Crypto Abstraction Layer       │
         │  ┌────────────────────────────┐ │
         │  │ webcrypto.ts               │ │
         │  │ (Node: crypto.webcrypto)   │ │
         │  └────────────────────────────┘ │
         │  ┌────────────────────────────┐ │
         │  │crypto-browser-shim.ts      │ │
         │  │ (Browser: Web Crypto API)  │ │
         │  └────────────────────────────┘ │
         └──────────────────────────────────┘
                │
         ┌──────v──────────────────────────┐
         │  Web Crypto API                 │
         │  (Native browser or Node.js)    │
         └──────────────────────────────────┘
```

### Module Structure

```
src/
├── index.ts                           # Main entry point (re-exports)
├── algorithms.ts                      # Signing algorithm configurations
├── sign.ts                            # Transaction signing logic
├── verify.ts                          # Verification logic + DNS/JSON lookup
├── generate.ts                        # Key manifest generation
├── constants/
│   └── errors.ts                      # Error message factory functions
├── utils/
│   ├── canonicalJson.ts               # Deterministic JSON serialization
│   ├── canonicalJson.test.ts          # Canonical JSON tests
│   ├── hex.ts                         # Hex/Base64 encoding utilities
│   ├── hex.test.ts                    # Hex encoding tests
│   ├── txtRecord.ts                   # RFC 1035 TXT record parsing
│   ├── txtRecord.test.ts              # TXT record tests
│   ├── webcrypto.ts                   # Node.js Web Crypto polyfill
│   └── crypto-browser-shim.ts         # Browser crypto shim (imported via browserify)
├── types/
│   └── dohjs.d.ts                     # TypeScript declarations for dohjs
├── generate.test.ts                   # Key manifest generation tests
├── sign.test.ts                       # Signing tests
└── verify.test.ts                     # Verification tests
```

### Supported Cryptographic Algorithms

The SDK implements 10 standard JWS-style algorithms:

**ECDSA Algorithms** (Elliptic Curve Digital Signature Algorithm):
- `ES256` - ECDSA with P-256 curve and SHA-256 (most common)
- `ES384` - ECDSA with P-384 curve and SHA-384
- `ES512` - ECDSA with P-521 curve and SHA-512
- `EdDSA` - Edwards Curve Digital Signature Algorithm (Ed25519)

**RSA Algorithms**:
- `PS256` - RSA-PSS with SHA-256 salt (RSA Probabilistic Signature Scheme)
- `PS384` - RSA-PSS with SHA-384 salt
- `PS512` - RSA-PSS with SHA-512 salt
- `RS256` - RSASSA-PKCS1-v1_5 with SHA-256
- `RS384` - RSASSA-PKCS1-v1_5 with SHA-384
- `RS512` - RSASSA-PKCS1-v1_5 with SHA-512

**Algorithm Configuration**:
- Each algorithm is pre-configured with correct parameters in `algorithms.ts`
- ECDSA signatures are stored as raw `r || s` byte concatenation (not DER-encoded)
- RSA signatures follow RFC standards with appropriate hash and salt configurations

## API Reference

### Core Functions

#### `sign(data, privateKey, algorithm): Promise<string>`

Signs transaction data using Web Crypto with specified algorithm.

**Parameters**:
- `data` - `string | object` - Transaction data to sign
  - If string: Used directly as UTF-8 bytes
  - If object: Canonicalized to JSON and serialized to bytes (keys sorted, undefined values dropped)
- `privateKey` - `string` - PKCS#8-encoded private key as hex string (with or without `0x` prefix)
- `algorithm` - One of the 10 supported algorithm names

**Returns**: `Promise<string>` - Hex string signature prefixed with `0x`
- For ECDSA: Raw `r || s` bytes (no DER encoding)
- For RSA: Standard RFC-compliant signature bytes

**Throws**: `Error` if algorithm not supported or key format invalid

**Example**:
```typescript
import { sign } from '@uniswap/tamperproof-transactions'

const data = { method: 'eth_sendTransaction', params: { to: '0xabc...', value: '0x1' } }
const privateKeyHex = '0x...' // PKCS#8 private key
const signature = await sign(data, privateKeyHex, 'ES256')
// Returns: '0x...' (hex-encoded signature)
```

---

#### `verify(calldata, signature, publicKey, algorithm): Promise<boolean>`

Low-level signature verification against a CryptoKey object.

**Parameters**:
- `calldata` - `string` - The original data that was signed (used as UTF-8 bytes)
- `signature` - `string` - Hex-encoded signature (with or without `0x`)
- `publicKey` - `CryptoKey` - Web Crypto public key object (already imported)
- `algorithm` - Signing algorithm name matching the key type

**Returns**: `Promise<boolean>` - True if signature is valid, false otherwise

**Throws**: `Error` if algorithm not supported or signature format invalid for ECDSA

**Usage Pattern**: Use this when you already have a CryptoKey object (e.g., imported from other sources). For manifest-based verification, use `verifyAsyncJson()` or `verifyAsyncDns()` instead.

**Example**:
```typescript
import { verify } from '@uniswap/tamperproof-transactions'

const ok = await verify('hello', '0x...', publicKeyObject, 'ES256')
// Returns: true if valid, false otherwise
```

---

#### `verifyAsyncJson(calldata, signatureHex, url, id): Promise<boolean>`

Verifies signature by fetching a JSON manifest of public keys over HTTPS.

**Parameters**:
- `calldata` - `string | object` - The original data (same as `sign` data parameter)
  - If object: Canonicalized using same algorithm as signing
- `signatureHex` - `string` - Hex-encoded signature (with or without `0x`)
- `url` - `URL` - HTTPS URL pointing to the public key manifest
  - Must use `https:` protocol (HTTP rejected)
  - Must return `application/json` Content-Type
  - Response limited to 64KB
  - Response must follow manifest format (see below)
- `id` - `string` - Key identifier within manifest to verify against (1-indexed per EIP-7754)

**Returns**: `Promise<boolean>` - True if signature matches the public key with given ID

**Throws**: `Error` for various failure modes:
- Invalid URL protocol (non-HTTPS)
- Network fetch failure
- Invalid Content-Type
- Manifest too large (>64KB)
- Fetch timeout (1 second)
- Key ID not found in manifest
- Duplicate key IDs (should never occur)
- Algorithm mismatch

**Manifest Format** (expected JSON response):
```json
{
  "publicKeys": [
    { "id": "1", "alg": "ES256", "publicKey": "0x..." },
    { "id": "2", "alg": "RS256", "publicKey": "0x..." }
  ]
}
```

**Example**:
```typescript
import { verifyAsyncJson } from '@uniswap/tamperproof-transactions'

const url = new URL('https://example.com/.well-known/keys.json')
const ok = await verifyAsyncJson(
  { method: 'eth_sendTransaction', params: { to: '0xabc...' } },
  '0x...',
  url,
  '1'
)
```

**Security Considerations**:
- Always use HTTPS URLs
- Manifest fetch must succeed within 1 second timeout
- The implementation prevents redirect attacks (redirect: "error")
- Manifests larger than 64KB are rejected to prevent DOS

---

#### `verifyAsyncDns(calldata, signatureHex, host, id): Promise<boolean>`

Verifies signature by resolving DNS TXT records for `host` and fetching the manifest from the resolved path.

**Parameters**:
- `calldata` - `string` - The original data (must be string for DNS mode)
- `signatureHex` - `string` - Hex-encoded signature
- `host` - `string` - Domain name to query for TXT record
  - DNS query looks for TXT record containing `TWIST=` prefix
  - Expected format: `TWIST=/path/to/manifest`
  - Path can be URL-encoded
- `id` - `string` - Key identifier within the manifest

**Returns**: `Promise<boolean>` - True if signature verifies against key from DNS-resolved manifest

**Throws**: `Error` for various failures:
- No TXT records found for host
- Multiple TXT records with `TWIST=` prefix (ambiguous)
- No TXT record containing `TWIST=` prefix
- TWIST path exceeds 1024 characters
- DNS query timeout (1 second)
- Manifest fetch failures (same as `verifyAsyncJson`)

**Process Flow**:
1. Query DNS TXT records for `host` using DNS-over-HTTPS (DoH)
2. Find exactly one TXT record starting with `TWIST=`
3. Extract and normalize path (remove leading slashes, URL-decode)
4. Construct HTTPS URL: `https://{host}/{path}`
5. Call `verifyAsyncJson()` with constructed URL and ID
6. Return verification result

**DNS Configuration**:
- Uses Cloudflare DoH resolver (`1.1.1.1/dns-query`) by default
- Configurable resolver via optional parameter
- All queries over HTTPS (DNS-over-HTTPS for privacy)

**Example**:
```typescript
import { verifyAsyncDns } from '@uniswap/tamperproof-transactions'

const ok = await verifyAsyncDns('hello', '0x...', 'example.com', '1')

// Expected DNS setup:
// example.com TXT record: "TWIST=/.well-known/keys.json"
// Resolves to: https://example.com/.well-known/keys.json
```

**Security Considerations**:
- DNS resolution uses DNS-over-HTTPS (DoH) to prevent DNS spoofing
- Single TXT record requirement prevents ambiguity
- TWIST path length limited to 1024 characters to prevent DOS
- Falls back to HTTPS fetch with standard security checks

---

#### `generate(...publicKeys): string`

Generates a JSON manifest string containing an array of public keys.

**Parameters**:
- `...publicKeys` - Variable number of `PublicKey` objects

**PublicKey Type**:
```typescript
type PublicKey = {
  key: string                    // SPKI-encoded public key as hex (with or without 0x)
  algorithm: keyof typeof SIGNING_ALGORITHM_CONFIG  // Algorithm name
}
```

**Returns**: `string` - Stringified JSON matching manifest format

**Generated Manifest Format**:
```json
{
  "publicKeys": [
    { "id": "1", "alg": "ES256", "publicKey": "0x..." },
    { "id": "2", "alg": "RS256", "publicKey": "0x..." }
  ]
}
```

**ID Assignment**: Auto-incremented from 1 (1-indexed, as per EIP-7754 spec)

**Throws**: `Error` if any public key has unsupported algorithm

**Example**:
```typescript
import { generate } from '@uniswap/tamperproof-transactions'

const json = generate(
  { key: '0xabcd...', algorithm: 'ES256' },
  { key: '0x1234...', algorithm: 'RS256' }
)

// Output:
// {
//   "publicKeys": [
//     { "id": "1", "alg": "ES256", "publicKey": "0xabcd..." },
//     { "id": "2", "alg": "RS256", "publicKey": "0x1234..." }
//   ]
// }
```

---

### Utility Functions

#### `canonicalStringify(value: unknown): string`

Deterministically serializes JSON by sorting keys and dropping undefined values.

**Purpose**: Ensures the same object always produces the same JSON bytes, enabling deterministic signatures.

**Behavior**:
- Sorts object keys lexicographically
- Drops properties with `undefined` values
- Recursively processes nested objects and arrays (preserving array order)
- Returns canonical JSON string

**Example**:
```typescript
import { canonicalStringify } from '@uniswap/tamperproof-transactions'

canonicalStringify({ b: 1, a: 2 })
// Returns: '{"a":2,"b":1}'

canonicalStringify({ x: undefined, y: 1 })
// Returns: '{"y":1}'  (x dropped)
```

---

#### `serializeRequestPayload<T>(value: T): Uint8Array`

Canonicalizes and encodes an object to UTF-8 bytes.

**Purpose**: Convert object to deterministic byte sequence for signing.

**Process**:
1. Canonicalizes object using `canonicalStringify()`
2. Encodes canonical JSON to UTF-8 bytes
3. Returns `Uint8Array`

**Example**:
```typescript
import { serializeRequestPayload } from '@uniswap/tamperproof-transactions'

const payload = { method: 'eth_sendTransaction', params: { to: '0xabc...' } }
const bytes = serializeRequestPayload(payload)
// Returns: Uint8Array of deterministic bytes
```

---

### Encoding/Decoding Utilities (Internal)

These utilities are exported for advanced use cases:

#### `fromHex(hex: string): Uint8Array`

Decodes hex string to bytes.

**Behavior**:
- Accepts `0x` prefix (optional, case-insensitive)
- Strips whitespace
- Requires even length and valid hex characters
- Returns `Uint8Array`

---

#### `toHex(buffer: ArrayBuffer | Uint8Array): string`

Encodes bytes to lowercase hex string (no `0x` prefix).

---

#### `normalizeHex(input: string, with0x?: boolean): string`

Normalizes hex string to canonical form.

**Behavior**:
- Strips `0x` prefix and whitespace
- Pads odd-length strings with leading zero
- Validates by round-trip through `fromHex`/`toHex`
- Returns lowercase hex with optional `0x` prefix

---

## Key Components

### 1. Algorithm Configuration (`algorithms.ts`)

Defines all 10 supported algorithms with Web Crypto parameters.

**Structure**:
```typescript
SIGNING_ALGORITHM_IMPORT_PARAMS  // For Key.import() operations
SIGNING_ALGORITHM_CONFIG         // For sign/verify operations
```

**Example for ES256**:
```typescript
ES256: {
  name: "ECDSA",
  hash: { name: "SHA-256" },
  namedCurve: "P-256",
  ecdsaCoordinateLength: 32,  // Raw r||s = 32+32 = 64 bytes
}
```

**ECDSA Specifics**:
- Signatures stored as raw `r || s` concatenation
- Coordinate length varies by curve (P-256: 32, P-384: 48, P-521: 66 bytes)
- Verification enforces exact length matching

---

### 2. Canonical JSON Serialization (`canonicalJson.ts`)

Implements deterministic JSON encoding per RFC 8949 (CBOR specification) principles applied to JSON.

**Algorithm**:
1. Recursively traverse value
2. For objects: Sort keys, drop undefined values
3. For arrays: Preserve order
4. For primitives: Return unchanged

**Critical for Signatures**:
```typescript
// Both produce identical canonical form
{ a: 1, b: 2 }
{ b: 2, a: 1 }
// Canonical: {"a":1,"b":2}
// Same signature can verify both
```

---

### 3. Hex Encoding (`hex.ts`)

Multi-purpose hex/base64 utilities with environment awareness.

**Key Features**:
- Flexible input (with/without `0x`, with/without whitespace)
- Base64 decoding with environment detection (browser atob vs Node Buffer)
- Round-trip validation for normalization

---

### 4. DNS TXT Record Parsing (`txtRecord.ts`)

RFC 1035-compliant DNS TXT record wire format decoder.

**TXT Record Format**:
- Sequence of length-prefixed strings
- Each string: 1-byte length + N bytes of data
- Decoder concatenates all chunks

**Example**:
```
Buffer: [10, ...10 bytes..., 5, ...5 bytes...]
Result: "...10 chars......5 chars..."
```

---

### 5. Web Crypto Abstraction (`webcrypto.ts` and `crypto-browser-shim.ts`)

Provides unified Web Crypto API access across environments.

**Node.js** (`webcrypto.ts`):
- Imports Web Crypto from Node.js `crypto` module
- Available in Node 15+

**Browser** (`crypto-browser-shim.ts`):
- Uses native `globalThis.crypto`
- Shimmed via browserify for browser builds
- Uses `crypto-js` or similar for older browsers (if bundled)

**Browserify Configuration** (`package.json`):
```json
"browser": {
  "./lib/utils/webcrypto.js": "./lib/utils/crypto-browser-shim.js"
}
```

This ensures browserify replaces Node-specific import with browser-safe version.

---

### 6. Error Handling (`constants/errors.ts`)

Comprehensive error messages with context, using factory functions for parameterization.

**Pattern**:
```typescript
export const ERROR_ALGORITHM_NOT_SUPPORTED = (alg: unknown): string =>
  `Algorithm is not supported: ${String(alg)}`
```

**Benefits**:
- Single source of truth for error messages
- Consistent error formatting
- Easier localization/translations

---

## Integration with Uniswap SDK Ecosystem

### Relationship to Other SDKs

**Direct Integration**:
- **No direct dependencies** on other Uniswap SDKs
- Standalone crypto utility package
- Used by higher-level packages that need signature verification

**Potential Consumers**:
- `smart-wallet-sdk` - May use for transaction attestation
- `flashtestations-sdk` - May use for signature verification
- Custom applications building on Unichain - For sequencer verification
- MEV protection infrastructure - For transaction validation

### Usage Patterns

**Pattern 1: Sign transaction with private key**
```typescript
import { sign } from '@uniswap/tamperproof-transactions'

const transaction = { to: '0xabc...', value: '0x1' }
const signature = await sign(transaction, privateKeyHex, 'ES256')
// Submit signature with transaction to network
```

**Pattern 2: Verify against manifest**
```typescript
import { verifyAsyncJson } from '@uniswap/tamperproof-transactions'

const url = new URL('https://sequencer.example.com/keys.json')
const isValid = await verifyAsyncJson(transaction, signature, url, '1')
// Check result before accepting transaction
```

**Pattern 3: Verify via DNS**
```typescript
import { verifyAsyncDns } from '@uniswap/tamperproof-transactions'

// Requires DNS: sequencer.example.com TXT "TWIST=/.well-known/keys.json"
const isValid = await verifyAsyncDns(txString, signature, 'sequencer.example.com', '1')
```

**Pattern 4: Generate key manifest**
```typescript
import { generate } from '@uniswap/tamperproof-transactions'

const manifest = generate(
  { key: publicKeyHex1, algorithm: 'ES256' },
  { key: publicKeyHex2, algorithm: 'RS256' }
)
// Serve manifest at HTTPS endpoint for verification
// Or reference via DNS TWIST record
```

---

## Implementation Details

### Signing Process

**Flow**:
1. Validate algorithm name against supported list
2. Convert data to bytes:
   - String: UTF-8 encode directly
   - Object: Canonically stringify, then UTF-8 encode
3. Import private key as PKCS#8
4. Sign using Web Crypto with algorithm params
5. Convert signature bytes to `0x`-prefixed hex string

**Key Format**: PKCS#8-encoded private keys are the standard format for Web Crypto API.

### Verification Process

**For Direct Verification** (`verify()`):
1. Validate algorithm
2. Encode calldata as UTF-8 bytes
3. Decode signature hex to bytes
4. For ECDSA: Validate signature length equals `2 * coordinateLength`
5. Use Web Crypto to verify with provided public key
6. Return boolean result

**For JSON Manifest** (`verifyAsyncJson()`):
1. Fetch manifest JSON from HTTPS URL
2. Validate: HTTPS protocol, JSON Content-Type, ≤64KB size
3. Parse JSON and find public key with matching ID
4. Validate algorithm supported
5. Import public key from SPKI-encoded hex
6. Call `verify()` with imported key

**For DNS Manifest** (`verifyAsyncDns()`):
1. Query DNS TXT records via DoH (Cloudflare 1.1.1.1)
2. Find exactly one TXT record with `TWIST=` prefix
3. Extract path, normalize, and bound length (≤1024 chars)
4. Construct HTTPS URL
5. Call `verifyAsyncJson()` with constructed URL

### ECDSA Signature Format

**Raw Format** (used by this library):
- Concatenated `r || s` bytes
- No DER encoding
- Length = `2 * coordinateLength`

**Rationale**:
- Simpler encoding than DER
- Matches EIP-7754 specification
- More efficient for on-chain verification

**Example (ES256)**:
- r (32 bytes) + s (32 bytes) = 64 bytes total
- Encoding: `0x` + 128 hex characters

---

## Testing

### Test Coverage

The package includes 6 test files covering all major functionality:

**Unit Tests**:
- `sign.test.ts` - Signing with all algorithms, error cases
- `verify.test.ts` - Verification flows, manifest handling, DNS resolution
- `generate.test.ts` - Key manifest generation
- `utils/canonicalJson.test.ts` - JSON canonicalization edge cases
- `utils/hex.test.ts` - Hex/base64 encoding edge cases
- `utils/txtRecord.test.ts` - DNS TXT record parsing

### Test Execution

```bash
# Run all tests
yarn test

# Run specific test file
yarn test sign.test.ts

# Watch mode
yarn test --watch
```

### Testing Strategy

**Jest Configuration** (`jest.config.cjs`):
- ts-jest transformer for TypeScript
- Test environment: node (default)
- ESM module support via ts-jest

**Key Test Patterns**:
- Algorithm round-trips (sign → verify)
- Error condition validation
- Edge cases (empty strings, large objects)
- Cross-algorithm verification (sign with one, verify with another? - should fail)
- DNS resolution mocking (mock dohjs resolver)

---

## Build System

### Build Targets

**CommonJS** (`build:cjs`)
```bash
tsc -p tsconfig.browserify.json
```
- Outputs to `lib/` directory
- Used by Node.js consumers
- Browser shim included via browserify mapping

**ES Modules** (`build:esm`)
```bash
tsc -p tsconfig.json
```
- Outputs to `dist/` directory
- TypeScript declarations (`dist/index.d.ts`)
- Used by modern bundlers and ESM consumers

**Browser Bundle** (`build:browser`)
```bash
browserify lib/index.js --standalone twist -o dist/twist.js
terser dist/twist.js --compress --mangle --output=dist/twist.min.js
```
- Creates UMD bundles for browser
- Browserify applies crypto-browser-shim mapping
- Terser minifies output
- Standalone mode exports as `twist` global variable

**Full Build**:
```bash
yarn build
# Runs: build:cjs && build:esm && build:browser
```

### TypeScript Configuration

**tsconfig.json** (ESM):
- Target: ES2020
- Module: ESNext
- Strict mode enabled
- Declaration files generated

**tsconfig.browserify.json** (CJS):
- Target: ES2020
- Module: commonjs
- Used for browser-compatible CJS output

**tsconfig.test.json**:
- Jest-specific configuration
- Allows `.test.ts` files

---

## Development Workflow

### Setup

```bash
# Install dependencies
yarn install

# Build the package
yarn build

# Verify build outputs exist
ls -la lib/          # CJS build
ls -la dist/         # ESM build
```

### Development

```bash
# Start in watch mode (if supported)
# Note: TSDX not used; manual watch via IDE

# Lint source code
yarn lint

# Fix linting issues
yarn lint:fix

# Format code
yarn format
```

### Release

```bash
# Semantic release (automated)
# Triggered on merge to main branch

# Manual test before release
yarn test
yarn build

# Commit and push to trigger release
git add .
git commit -m "feat: new feature"
git push origin main
```

**Release Configuration** (`package.json`):
- Uses `semantic-release-monorepo` for independent versioning
- Analyzes commits in `sdks/tamperproof-transactions/` directory
- Bumps version based on commit types
- Auto-generates changelog
- Publishes to npm with provenance
- Creates GitHub release

---

## Performance Considerations

### Optimization Points

**Signing Performance**:
- Web Crypto operations are native (hardware-accelerated when available)
- Key import is one-time cost per sign operation
- JSON canonicalization is O(n) where n = total keys in object

**Verification Performance**:
- Direct `verify()`: Fast (no network)
- `verifyAsyncJson()`: Adds HTTPS fetch (typically 100-500ms)
- `verifyAsyncDns()`: Adds DoH query (typically 200-800ms)

**Manifest Caching**:
- The SDK doesn't cache manifests (delegated to HTTP caching headers)
- Consumers should implement caching strategy in their applications
- Example: Cache manifest for 5-15 minutes

**DNS Caching**:
- DNS results cached by the DoH resolver
- Cloudflare DoH caches responses
- Consider DNS propagation time when updating TXT records

---

## Browser Compatibility

### Supported Environments

**Node.js**: 14+
- Uses native Web Crypto API from `crypto` module
- Available in Node 15+, stabilized in later versions

**Browser**:
- Chrome 37+ (Web Crypto API support)
- Firefox 34+
- Safari 11+
- Edge 79+

**Important**: Browser builds require browserify to apply `crypto-browser-shim` mapping.

### Browser-Specific Issues

**Polyfills Not Included**:
- No automatic polyfills for older browsers
- No dependency on crypto-js or other polyfill libraries
- Assumes native Web Crypto available or shimmed by consumer

**GlobalThis Usage**:
- Uses `globalThis` for universal environment detection
- Assumes `atob` available in browsers or `Buffer` in Node

---

## Security Considerations

### Threat Model

**Signature Verification**:
- Protects against tampering of signed data
- Assumes public keys are authentic
- Does NOT verify key ownership or identity (application responsibility)

**Manifest Fetching**:
- HTTPS required (no HTTP fallback)
- Redirects prevented (redirect: "error")
- Content-Type validated
- Size-limited (≤64KB)

**DNS Verification**:
- Uses DNS-over-HTTPS to prevent DNS spoofing
- Cloudflare resolver used (or configurable)
- Single TXT record requirement prevents ambiguity

### Recommendations for Users

1. **Key Management**:
   - Store private keys securely (HSM, sealed storage)
   - Rotate keys regularly
   - Never expose private keys in logs or errors

2. **Manifest Distribution**:
   - Serve manifests over HTTPS with valid certificates
   - Set Cache-Control headers appropriately (e.g., max-age=300)
   - Monitor DNS TXT records for tampering
   - Use DNS DNSSEC for additional protection

3. **Verification Integration**:
   - Always verify signatures before accepting transactions
   - Implement timeout/retry logic for network failures
   - Cache manifests but respect TTLs
   - Monitor verification failures for attack detection

4. **Algorithm Selection**:
   - ES256 recommended for most cases (good balance of performance/security)
   - RS256 for RSA-based infrastructure
   - EdDSA for highest security
   - Avoid RS512 unless required (slower, overkill for most use cases)

---

## Common Integration Examples

### Example 1: Unichain Sequencer Verification

```typescript
import { verifyAsyncJson } from '@uniswap/tamperproof-transactions'

async function verifyUniswapTransaction(txData: object, signature: string) {
  const keysUrl = new URL('https://sequencer.unichain.org/.well-known/keys.json')

  try {
    const isValid = await verifyAsyncJson(txData, signature, keysUrl, '1')
    if (!isValid) {
      console.error('Signature verification failed')
      return false
    }
    console.log('Transaction signature verified')
    return true
  } catch (error) {
    console.error('Verification error:', error.message)
    return false
  }
}
```

### Example 2: Off-Chain Order Signing

```typescript
import { sign, canonicalStringify } from '@uniswap/tamperproof-transactions'

async function signOrder(order: object, privateKeyHex: string) {
  // Canonical form ensures order can be verified
  const canonical = canonicalStringify(order)

  const signature = await sign(canonical, privateKeyHex, 'ES256')

  return {
    order,
    signature,
    algorithm: 'ES256',
    canonical,
  }
}
```

### Example 3: Multi-Signer Setup

```typescript
import { generate } from '@uniswap/tamperproof-transactions'

function createMultiSignerManifest(signers: Array<{ key: string; algorithm: string }>) {
  const manifest = generate(
    ...signers.map((signer) => ({
      key: signer.key,
      algorithm: signer.algorithm as any,
    }))
  )

  // Serve manifest at HTTPS endpoint
  return JSON.parse(manifest)
}

// Usage:
const manifest = createMultiSignerManifest([
  { key: publicKey1, algorithm: 'ES256' },
  { key: publicKey2, algorithm: 'ES384' },
  { key: publicKey3, algorithm: 'RS256' },
])
```

### Example 4: DNS-Based Key Discovery

```typescript
import { verifyAsyncDns } from '@uniswap/tamperproof-transactions'

async function verifyWithDnsDiscovery(
  txData: string,
  signature: string,
  sequencerHost: string
) {
  // Requires DNS setup:
  // sequencer.example.com TXT "TWIST=/.well-known/keys.json"

  try {
    const isValid = await verifyAsyncDns(txData, signature, sequencerHost, '1')
    return isValid
  } catch (error) {
    if (error.message.includes('No TXT records')) {
      console.error(`No TWIST record found for ${sequencerHost}`)
    }
    throw error
  }
}
```

---

## Conventions and Patterns

### Naming Conventions

**Exported Functions**: Lowercase, descriptive
- `sign()`, `verify()`, `generate()`
- `verifyAsyncJson()`, `verifyAsyncDns()`
- `canonicalStringify()`, `serializeRequestPayload()`

**Types**: PascalCase, descriptive
- `PublicKey`, `SigningAlgorithmConfig`

**Constants**: UPPER_SNAKE_CASE
- `PREFIX`, `TIMEOUT`, `MAX_MANIFEST_BYTES`

**Error Messages**: Clear context with parameters
- Factory functions in `errors.ts`
- Always include relevant context (algorithm, host, ID, etc.)

### Hex String Handling

**Consistency**:
- Input: Accept with or without `0x` prefix
- Output: Always prefix with `0x`
- Normalization: Use `normalizeHex()` for consistent format

**Example**:
```typescript
const input1 = '0xabcd'
const input2 = 'abcd'
const input3 = '0xABCD'

// All normalize to same form
normalizeHex(input1) === normalizeHex(input2) === normalizeHex(input3)
// true
```

### Error Handling

**Validation Errors**: Throw immediately with clear messages
```typescript
if (!Object.prototype.hasOwnProperty.call(SIGNING_ALGORITHM_CONFIG, algorithm)) {
  throw new Error(ERROR_ALGORITHM_NOT_SUPPORTED(algorithm))
}
```

**Network Errors**: Propagate with context
```typescript
try {
  const response = await fetch(url, { signal: controller.signal })
} catch (error) {
  throw new Error(ERROR_MANIFEST_FETCH_FAILED(500))
}
```

**Async Operations**: Always use try-catch or `.catch()`

---

## Troubleshooting

### Common Issues

**"Algorithm is not supported"**
- Cause: Typo in algorithm name or unsupported algorithm
- Solution: Check algorithm name against supported list (ES256, ES384, ES512, EdDSA, PS256, PS384, PS512, RS256, RS384, RS512)

**"Manifest must be fetched over HTTPS"**
- Cause: URL protocol is HTTP instead of HTTPS
- Solution: Update manifest URL to use HTTPS
- Example: `https://` not `http://`

**"Signature verification failed"**
- Cause: Signature doesn't match public key or data was tampered
- Solution:
  - Verify signature is for same data (including whitespace/encoding)
  - Ensure correct algorithm used
  - Check public key is correct/not rotated

**"No TXT records found for host"**
- Cause: DNS lookup returned no TXT records
- Solution:
  - Verify domain name is correct
  - Ensure TXT record exists in DNS
  - Check DNS propagation with `dig` or online tools
  - Example: `dig example.com TXT`

**"No TXT record found with prefix TWIST="**
- Cause: TXT records exist but none have `TWIST=` prefix
- Solution:
  - Add TXT record with `TWIST=/path` value
  - Format: `"TWIST=/.well-known/keys.json"`
  - Verify no typos in prefix

**"Signature length invalid for ECDSA"**
- Cause: ECDSA signature wrong length
- Solution:
  - Ensure signature is raw r||s format (not DER)
  - ES256: 64 bytes (128 hex chars)
  - ES384: 96 bytes (192 hex chars)
  - ES512: 132 bytes (264 hex chars)

### Debugging

**Enable Verbose Logging**:
```typescript
import { verify } from '@uniswap/tamperproof-transactions'

try {
  const result = await verify(data, sig, pubKey, alg)
  console.log('Verification result:', result)
} catch (error) {
  console.error('Verification error:', error.message)
  console.error('Stack:', error.stack)
}
```

**Inspect Canonical Form**:
```typescript
import { canonicalStringify } from '@uniswap/tamperproof-transactions'

const obj = { b: 1, a: 2, c: undefined }
console.log('Canonical:', canonicalStringify(obj))
// Output: {"a":2,"b":1}
```

**Verify Manifest Format**:
```typescript
const response = await fetch('https://example.com/keys.json')
const manifest = await response.json()
console.log('Manifest keys:', manifest.publicKeys.map(pk => pk.id))
// Should show: ["1", "2", "3", ...]
```

---

## Dependencies

### Production Dependencies

- **dohjs** (^0.3.3) - DNS-over-HTTPS resolver for DNS TXT queries
  - Used by `verifyAsyncDns()` for DNS lookups
  - Wraps Cloudflare DoH endpoint

### Development Dependencies

- **TypeScript** (^4.3.3) - Language and compilation
- **Jest** (25.5.0) - Testing framework
- **ts-jest** (^25.5.1) - TypeScript transformer for Jest
- **Browserify** (^17.0.1) - Module bundler for browser builds
- **Terser** (^5.44.0) - JavaScript minifier
- **ESLint** + **Prettier** - Linting and formatting

### No Runtime Dependencies on Other SDKs

This package is intentionally isolated with minimal dependencies. It does not import from any other Uniswap SDK packages.

---

## Publishing

### Release Process

Releases are automated via semantic-release-monorepo:

1. **Trigger**: Merge PR to `main` with conventional commit messages
2. **Analysis**: semantic-release analyzes commits in `sdks/tamperproof-transactions/`
3. **Version**: Bumps version based on commit types:
   - `fix()` → Patch (0.0.X)
   - `feat()` → Minor (0.X.0)
   - `feat(breaking)` → Major (X.0.0)
4. **Changelog**: Auto-generates changelog from commits
5. **Build**: Runs `yarn build` to generate dist
6. **Publish**: Publishes to npm with provenance
7. **Release**: Creates GitHub release with notes

### Manual Release (if needed)

```bash
# Build all outputs
yarn build

# Version bump and changelog
npm version minor  # or patch, major

# Publish to npm
npm publish

# Create GitHub release
gh release create v2.1.0 --title "tamperproof-transactions v2.1.0"
```

### NPM Configuration

**Package Name**: `@uniswap/tamperproof-transactions`
**Scope**: Public (org-scoped package)
**Provenance**: Enabled for supply chain security
**Registry**: npmjs.com (default)

---

## Future Enhancements

### Potential Improvements

1. **Algorithm Additions**:
   - HS256/HS384/HS512 (HMAC-based, for symmetric keys)
   - Additional EdDSA curves

2. **Performance**:
   - Optional signature caching
   - Parallel verification for multiple signatures
   - Batch manifest fetching

3. **Features**:
   - JWS/JWT compatibility layer
   - X.509 certificate support
   - Hardware security module (HSM) integration

4. **Developer Experience**:
   - Request/response builders for common patterns
   - Error recovery helpers
   - Verification retry logic with backoff

---

<!-- CUSTOM:START -->
<!-- User additions preserved during updates -->
<!-- CUSTOM:END -->
