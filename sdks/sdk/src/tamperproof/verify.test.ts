import { vi, Mock } from 'vitest'

// Hoist the mock function so it's available before vi.mock runs
const mockQuery = vi.hoisted(() => vi.fn());

vi.mock("dohjs", () => ({
  default: {
    DohResolver: vi.fn().mockImplementation(() => ({
      query: mockQuery,
    })),
  },
}));

import { verify, verifyAsyncDns, verifyAsyncJson, PREFIX } from "./verify";
import { canonicalStringify } from "./utils/canonicalJson";
import { toHex } from "./utils/hex";
import { SIGNING_ALGORITHM_CONFIG } from "./algorithms";
import { webcrypto } from "./utils/webcrypto";

const data = "data";
let ecdsaKeyPair: CryptoKeyPair;
let ecdsa384KeyPair: CryptoKeyPair;
let ecdsa521KeyPair: CryptoKeyPair;
let ed25519KeyPair: CryptoKeyPair;
let rsaSSAKeyPair: CryptoKeyPair;
let rsaSSA384KeyPair: CryptoKeyPair;
let rsaSSA512KeyPair: CryptoKeyPair;
let rsaPSSKeyPair: CryptoKeyPair;
let rsaPSS384KeyPair: CryptoKeyPair;
let rsaPSS512KeyPair: CryptoKeyPair;

describe("verify.ts", () => {
  describe("Test failure cases for verifyAsyncDns", () => {
    beforeEach(() => {
      // Clear mock between tests
      mockQuery.mockClear();
    });

    it("throws error if DNS resolution fails", async () => {
      mockQuery.mockRejectedValue(new Error("DNS resolution failed"));

      await expect(
        verifyAsyncDns("data", "signature", "example.com", "1")
      ).rejects.toThrow("DNS resolution failed");
    });

    it("throws error if no TXT records are found", async () => {
      mockQuery.mockResolvedValue({ answers: [] });

      await expect(
        verifyAsyncDns("data", "signature", "example.com", "1")
      ).rejects.toThrow("No TXT records found for host example.com");
    });

    it("throws error if no record with PREFIX is found", async () => {
      mockQuery.mockResolvedValue({
        answers: [{ data: "WRONG_PREFIX=somedata" }],
      });

      await expect(
        verifyAsyncDns("data", "signature", "example.com", "1")
      ).rejects.toThrow(
        `No TXT record found with prefix ${PREFIX} for host example.com`
      );
    });
  });

  describe("TXT record parsing for verifyAsyncDns", () => {
    beforeEach(() => {
      // Clear mock between tests
      mockQuery.mockClear();
    });

    it("should handle single substring TXT records as string", async () => {
      mockQuery.mockResolvedValue({
        answers: [{ data: "TWIST=test-endpoint" }],
      });

      // Mock the JSON fetch to avoid making real HTTP requests
      global.fetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            publicKeys: [
              {
                id: "1",
                alg: "ES256",
                publicKey: "0x123456789abcdef",
              },
            ],
          }),
      });

      await expect(
        verifyAsyncDns("data", "signature", "example.com", "1")
      ).rejects.toThrow(); // Will fail at crypto step, but parsing succeeded
    });

    it("should handle multiple substring TXT records in Buffer format", async () => {
      // Create a Buffer that represents a TXT record with multiple substrings
      // Format: length1 + string1 + length2 + string2
      // "TWIST=" (6 bytes) + "test-end" (8 bytes) + "point" (5 bytes)
      const buffer = Buffer.concat([
        Buffer.from([6]), // length of "TWIST="
        Buffer.from("TWIST="),
        Buffer.from([8]), // length of "test-end"
        Buffer.from("test-end"),
        Buffer.from([5]), // length of "point"
        Buffer.from("point"),
      ]);

      mockQuery.mockResolvedValue({
        answers: [{ data: buffer }],
      });

      // Mock the JSON fetch
      global.fetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            publicKeys: [
              {
                id: "1",
                alg: "ES256",
                publicKey: "0x123456789abcdef",
              },
            ],
          }),
      });

      // Should parse buffer as "TWIST=test-endpoint" and continue processing
      await expect(
        verifyAsyncDns("data", "signature", "example.com", "1")
      ).rejects.toThrow(); // Will fail at crypto step, but parsing succeeded
    });

    it("should handle empty substring in TXT record Buffer", async () => {
      // Create a Buffer with an empty substring: "TWIST=" + "" + "data"
      const buffer = Buffer.concat([
        Buffer.from([6]), // length of "TWIST="
        Buffer.from("TWIST="),
        Buffer.from([0]), // empty string
        Buffer.from([4]), // length of "data"
        Buffer.from("data"),
      ]);

      mockQuery.mockResolvedValue({
        answers: [{ data: buffer }],
      });

      global.fetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            publicKeys: [
              {
                id: "1",
                alg: "ES256",
                publicKey: "0x123456789abcdef",
              },
            ],
          }),
      });

      // Should parse as "TWIST=data"
      await expect(
        verifyAsyncDns("data", "signature", "example.com", "1")
      ).rejects.toThrow(); // Will fail at crypto step, but parsing succeeded
    });

    it("should throw error for malformed TXT record Buffer", async () => {
      // Create a malformed buffer where length exceeds available data
      const buffer = Buffer.concat([
        Buffer.from([6]), // length of "TWIST="
        Buffer.from("TWIST="),
        Buffer.from([10]), // claims 10 bytes but only 4 available
        Buffer.from("test"),
      ]);

      mockQuery.mockResolvedValue({
        answers: [{ data: buffer }],
      });

      await expect(
        verifyAsyncDns("data", "signature", "example.com", "1")
      ).rejects.toThrow(
        "Invalid TXT record format: length exceeds buffer size"
      );
    });

    it("should handle mixed record types selecting the first TWIST record only", async () => {
      // First record without prefix, second record with prefix in Buffer format; third without TWIST
      const buffer = Buffer.concat([
        Buffer.from([6]), // length of "TWIST="
        Buffer.from("TWIST="),
        Buffer.from([5]), // length of "valid"
        Buffer.from("valid"),
      ]);

      mockQuery.mockResolvedValue({
        answers: [
          { data: "OTHER_PREFIX=ignore-this" },
          { data: buffer }, // Should find this one
          { data: "IGNORED=backup" }, // Not TWIST
        ],
      });

      global.fetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            publicKeys: [
              {
                id: "1",
                alg: "ES256",
                publicKey: "0x123456789abcdef",
              },
            ],
          }),
      });

      await expect(
        verifyAsyncDns("data", "signature", "example.com", "1")
      ).rejects.toThrow(); // Will fail at crypto step, but parsing succeeded
    });

    it("throws when multiple TWIST records are present", async () => {
      mockQuery.mockResolvedValue({
        answers: [{ data: "TWIST=one" }, { data: "TWIST=two" }],
      });

      await expect(
        verifyAsyncDns("data", "signature", "example.com", "1")
      ).rejects.toThrow(
        `Multiple TXT records found with prefix ${PREFIX} for host example.com. Only one is allowed.`
      );
    });

    it("sanitizes leading slashes and encodes TWIST path segments", async () => {
      mockQuery.mockResolvedValue({
        answers: [{ data: `${PREFIX}//api v1/ƙeys?bad#frag` }],
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name === "content-type" ? "application/json" : "0",
        },
        json: () =>
          Promise.resolve({
            publicKeys: [{ id: "1", alg: "RS256", publicKey: "00" }],
          }),
      });

      await expect(
        verifyAsyncDns("data", "signature", "example.com", "1")
      ).rejects.toThrow();

      expect(global.fetch).toHaveBeenCalled();
      const call = (global.fetch as Mock).mock.calls[0] as unknown[];
      const urlArg = call[0] as URL;
      expect(urlArg).toBeInstanceOf(URL);
      // Leading slashes removed, segments encoded
      expect(urlArg.href).toBe(
        "https://example.com/api%20v1/%C6%99eys%3Fbad%23frag"
      );
    });

    it("rejects when TWIST path exceeds maximum length", async () => {
      const longPath = "a".repeat(1025);
      mockQuery.mockResolvedValue({
        answers: [{ data: `${PREFIX}${longPath}` }],
      });

      global.fetch = vi.fn();

      await expect(
        verifyAsyncDns("data", "signature", "example.com", "1")
      ).rejects.toThrow("TWIST path too long");

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("verifyAsyncJson", () => {
    const httpsUrl = new URL("https://example.com/manifest.json");
    let localRsaSSAKeyPair: CryptoKeyPair;

    beforeAll(async () => {
      localRsaSSAKeyPair = await webcrypto.subtle.generateKey(
        {
          name: "RSASSA-PKCS1-v1_5",
          hash: { name: "SHA-256" },
          publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
          modulusLength: 2048,
        },
        false,
        ["sign", "verify"]
      );
    }, 10000); // Increase timeout to 10 seconds for RSA key generation

    it("throws if URL is not HTTPS", async () => {
      const httpUrl = new URL("http://example.com/manifest.json");
      await expect(
        verifyAsyncJson("data", "signature", httpUrl, "1")
      ).rejects.toThrow("Manifest must be fetched over HTTPS");
    });

    it("throws if HTTP status is not ok", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => null },
        json: () => Promise.resolve({ publicKeys: [] }),
      });

      await expect(
        verifyAsyncJson("data", "signature", httpsUrl, "1")
      ).rejects.toThrow("Failed to fetch manifest: HTTP 404");
    });

    it("throws if Content-Type is not application/json", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => "text/plain" },
        json: () => Promise.resolve({ publicKeys: [] }),
      });

      await expect(
        verifyAsyncJson("data", "signature", httpsUrl, "1")
      ).rejects.toThrow("Manifest Content-Type must be application/json");
    });

    it("throws if key id is not found", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name === "content-type"
              ? "application/json"
              : name === "content-length"
              ? "0"
              : null,
        },
        json: () => Promise.resolve({ publicKeys: [] }),
      });

      await expect(
        verifyAsyncJson("data", "signature", httpsUrl, "1")
      ).rejects.toThrow("Public key with id 1 not found");
    });

    it("throws if duplicate key ids are found", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name === "content-type"
              ? "application/json"
              : name === "content-length"
              ? "0"
              : null,
        },
        json: () =>
          Promise.resolve({
            publicKeys: [
              { id: "1", alg: "RS256", publicKey: "00" },
              { id: "1", alg: "RS256", publicKey: "00" },
            ],
          }),
      });

      await expect(
        verifyAsyncJson("data", "signature", httpsUrl, "1")
      ).rejects.toThrow(
        "Multiple public keys found with id 1. Key IDs must be unique."
      );
    });

    it("throws if algorithm is unsupported", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name === "content-type"
              ? "application/json"
              : name === "content-length"
              ? "0"
              : null,
        },
        json: () =>
          Promise.resolve({
            publicKeys: [{ id: "1", alg: "UNSUPPORTED", publicKey: "00" }],
          }),
      });

      await expect(
        verifyAsyncJson("data", "signature", httpsUrl, "1")
      ).rejects.toThrow("Algorithm is not supported: UNSUPPORTED");
    });

    it("returns true when signature verifies for RS256", async () => {
      const privateKey = localRsaSSAKeyPair.privateKey;
      const publicKey = localRsaSSAKeyPair.publicKey;

      const signature = await webcrypto.subtle.sign(
        SIGNING_ALGORITHM_CONFIG.RS256,
        privateKey,
        new TextEncoder().encode(data)
      );

      const signatureHex = toHex(signature);

      const spki = await webcrypto.subtle.exportKey("spki", publicKey);
      const spkiHex = toHex(spki);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name === "content-type"
              ? "application/json"
              : name === "content-length"
              ? "0"
              : null,
        },
        json: () =>
          Promise.resolve({
            publicKeys: [{ id: "1", alg: "RS256", publicKey: spkiHex }],
          }),
      });

      await expect(
        verifyAsyncJson(data, signatureHex, httpsUrl, "1")
      ).resolves.toBe(true);
    });

    it("accepts Content-Type with charset parameter", async () => {
      const privateKey = localRsaSSAKeyPair.privateKey;
      const publicKey = localRsaSSAKeyPair.publicKey;

      const signature = await webcrypto.subtle.sign(
        SIGNING_ALGORITHM_CONFIG.RS256,
        privateKey,
        new TextEncoder().encode(data)
      );

      const signatureHex = toHex(signature);

      const spki = await webcrypto.subtle.exportKey("spki", publicKey);
      const spkiHex = toHex(spki);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name === "content-type" ? "application/json; charset=utf-8" : "0",
        },
        json: () =>
          Promise.resolve({
            publicKeys: [{ id: "1", alg: "RS256", publicKey: spkiHex }],
          }),
      });

      await expect(
        verifyAsyncJson(data, signatureHex, httpsUrl, "1")
      ).resolves.toBe(true);
    });

    it("throws if manifest exceeds maximum size", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name === "content-type"
              ? "application/json"
              : name === "content-length"
              ? String(64 * 1024 + 1)
              : null,
        },
        json: () => Promise.resolve({ publicKeys: [] }),
      });

      await expect(
        verifyAsyncJson("data", "signature", httpsUrl, "1")
      ).rejects.toThrow("Manifest too large");
    });

    it("uses strict fetch options", async () => {
      const publicKey = localRsaSSAKeyPair.publicKey;
      const spki = await webcrypto.subtle.exportKey("spki", publicKey);
      const spkiHex = toHex(spki);
      const signature = await webcrypto.subtle.sign(
        SIGNING_ALGORITHM_CONFIG.RS256,
        localRsaSSAKeyPair.privateKey,
        new TextEncoder().encode(data)
      );
      const signatureHex = toHex(signature);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name === "content-type" ? "application/json" : "0",
        },
        json: () =>
          Promise.resolve({
            publicKeys: [{ id: "1", alg: "RS256", publicKey: spkiHex }],
          }),
      });

      await verifyAsyncJson(data, signatureHex, httpsUrl, "1");

      expect(global.fetch).toHaveBeenCalled();
      const call = (global.fetch as Mock).mock.calls[0] as unknown[];
      const options = call[1] as RequestInit;
      expect(options.redirect).toBe("error");
      expect(options.headers).toEqual({ Accept: "application/json" });
      expect(options.signal).toBeDefined();
    });
  });

  describe("verify", () => {
    beforeAll(async () => {
      ecdsaKeyPair = await webcrypto.subtle.generateKey(
        {
          name: "ECDSA",
          namedCurve: "P-256",
        },
        false,
        ["sign", "verify"]
      );
      ecdsa384KeyPair = await webcrypto.subtle.generateKey(
        {
          name: "ECDSA",
          namedCurve: "P-384",
        },
        false,
        ["sign", "verify"]
      );
      ecdsa521KeyPair = await webcrypto.subtle.generateKey(
        {
          name: "ECDSA",
          namedCurve: "P-521",
        },
        false,
        ["sign", "verify"]
      );
      ed25519KeyPair = (await webcrypto.subtle.generateKey(
        {
          name: "Ed25519",
        },
        false,
        ["sign", "verify"]
      )) as CryptoKeyPair;
      rsaSSAKeyPair = await webcrypto.subtle.generateKey(
        {
          name: "RSASSA-PKCS1-v1_5",
          hash: { name: "SHA-256" },
          publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
          modulusLength: 2048,
        },
        false,
        ["sign", "verify"]
      );
      rsaSSA384KeyPair = await webcrypto.subtle.generateKey(
        {
          name: "RSASSA-PKCS1-v1_5",
          hash: { name: "SHA-384" },
          publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
          modulusLength: 2048,
        },
        false,
        ["sign", "verify"]
      );
      rsaSSA512KeyPair = await webcrypto.subtle.generateKey(
        {
          name: "RSASSA-PKCS1-v1_5",
          hash: { name: "SHA-512" },
          publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
          modulusLength: 2048,
        },
        false,
        ["sign", "verify"]
      );
      rsaPSSKeyPair = await webcrypto.subtle.generateKey(
        {
          name: "RSA-PSS",
          hash: { name: "SHA-256" },
          publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
          modulusLength: 2048,
        },
        false,
        ["sign", "verify"]
      );
      rsaPSS384KeyPair = await webcrypto.subtle.generateKey(
        {
          name: "RSA-PSS",
          hash: { name: "SHA-384" },
          publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
          modulusLength: 2048,
        },
        false,
        ["sign", "verify"]
      );
      rsaPSS512KeyPair = await webcrypto.subtle.generateKey(
        {
          name: "RSA-PSS",
          hash: { name: "SHA-512" },
          publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
          modulusLength: 2048,
        },
        false,
        ["sign", "verify"]
      );
    }, 30000); // Increase timeout to 30 seconds for RSA key generation

    describe("returns true for correct public key", () => {
      it("is successful with ES256 (ECDSA P-256)", async () => {
        const privateKey = ecdsaKeyPair.privateKey;
        const publicKey = ecdsaKeyPair.publicKey;
        const signature = await webcrypto.subtle.sign(
          SIGNING_ALGORITHM_CONFIG.ES256,
          privateKey,
          new TextEncoder().encode(data)
        );
        const signatureString = toHex(signature);

        expect(await verify(data, signatureString, publicKey, "ES256")).toBe(
          true
        );
      });
      it("is successful with EdDSA (Ed25519)", async () => {
        const privateKey = ed25519KeyPair.privateKey;
        const publicKey = ed25519KeyPair.publicKey;
        const signature = await webcrypto.subtle.sign(
          SIGNING_ALGORITHM_CONFIG.EdDSA,
          privateKey,
          new TextEncoder().encode(data)
        );
        const signatureString = toHex(signature);

        expect(await verify(data, signatureString, publicKey, "EdDSA")).toBe(
          true
        );
      });
      it("is successful with ES384 (ECDSA P-384)", async () => {
        const privateKey = ecdsa384KeyPair.privateKey;
        const publicKey = ecdsa384KeyPair.publicKey;
        const signature = await webcrypto.subtle.sign(
          SIGNING_ALGORITHM_CONFIG.ES384,
          privateKey,
          new TextEncoder().encode(data)
        );
        const signatureString = toHex(signature);

        expect(await verify(data, signatureString, publicKey, "ES384")).toBe(
          true
        );
      });
      it("is successful with ES512 (ECDSA P-521)", async () => {
        const privateKey = ecdsa521KeyPair.privateKey;
        const publicKey = ecdsa521KeyPair.publicKey;
        const signature = await webcrypto.subtle.sign(
          SIGNING_ALGORITHM_CONFIG.ES512,
          privateKey,
          new TextEncoder().encode(data)
        );
        const signatureString = toHex(signature);

        expect(await verify(data, signatureString, publicKey, "ES512")).toBe(
          true
        );
      });
      it("is successful with RS384 (RSASSA-PKCS1-v1_5)", async () => {
        const privateKey = rsaSSA384KeyPair.privateKey;
        const publicKey = rsaSSA384KeyPair.publicKey;
        const signature = await webcrypto.subtle.sign(
          SIGNING_ALGORITHM_CONFIG.RS384,
          privateKey,
          new TextEncoder().encode(data)
        );
        const signatureString = toHex(signature);

        expect(await verify(data, signatureString, publicKey, "RS384")).toBe(
          true
        );
      });
      it("is successful with RS512 (RSASSA-PKCS1-v1_5)", async () => {
        const privateKey = rsaSSA512KeyPair.privateKey;
        const publicKey = rsaSSA512KeyPair.publicKey;
        const signature = await webcrypto.subtle.sign(
          SIGNING_ALGORITHM_CONFIG.RS512,
          privateKey,
          new TextEncoder().encode(data)
        );
        const signatureString = toHex(signature);

        expect(await verify(data, signatureString, publicKey, "RS512")).toBe(
          true
        );
      });
      it("is successful with PS384 (RSA-PSS)", async () => {
        const privateKey = rsaPSS384KeyPair.privateKey;
        const publicKey = rsaPSS384KeyPair.publicKey;
        const signature = await webcrypto.subtle.sign(
          SIGNING_ALGORITHM_CONFIG.PS384,
          privateKey,
          new TextEncoder().encode(data)
        );
        const signatureString = toHex(signature);

        expect(await verify(data, signatureString, publicKey, "PS384")).toBe(
          true
        );
      });
      it("is successful with PS512 (RSA-PSS)", async () => {
        const privateKey = rsaPSS512KeyPair.privateKey;
        const publicKey = rsaPSS512KeyPair.publicKey;
        const signature = await webcrypto.subtle.sign(
          SIGNING_ALGORITHM_CONFIG.PS512,
          privateKey,
          new TextEncoder().encode(data)
        );
        const signatureString = toHex(signature);

        expect(await verify(data, signatureString, publicKey, "PS512")).toBe(
          true
        );
      });
      it("is successful with RS256 (RSASSA-PKCS1-v1_5)", async () => {
        const privateKey = rsaSSAKeyPair.privateKey;
        const publicKey = rsaSSAKeyPair.publicKey;
        const signature = await webcrypto.subtle.sign(
          SIGNING_ALGORITHM_CONFIG.RS256,
          privateKey,
          new TextEncoder().encode(data)
        );
        const signatureString = toHex(signature);

        expect(await verify(data, signatureString, publicKey, "RS256")).toBe(
          true
        );
      });
      it("is successful with PS256 (RSA-PSS)", async () => {
        const privateKey = rsaPSSKeyPair.privateKey;
        const publicKey = rsaPSSKeyPair.publicKey;
        const signature = await webcrypto.subtle.sign(
          SIGNING_ALGORITHM_CONFIG.PS256,
          privateKey,
          new TextEncoder().encode(data)
        );
        const signatureString = toHex(signature);

        expect(await verify(data, signatureString, publicKey, "PS256")).toBe(
          true
        );
      });
    });

    it("verifies object payload using canonical JSON (RS256)", async () => {
      const payload = { method: "foo", params: { y: 2, x: 1 } };
      const canonical = canonicalStringify(payload);

      const signature = await webcrypto.subtle.sign(
        SIGNING_ALGORITHM_CONFIG.RS256,
        rsaSSAKeyPair.privateKey,
        new TextEncoder().encode(canonical)
      );
      const signatureHex = toHex(signature);

      await expect(
        verify(canonical, signatureHex, rsaSSAKeyPair.publicKey, "RS256")
      ).resolves.toBe(true);
    });

    it("returns false for incorrect public key", async () => {
      const privateKey1 = rsaSSAKeyPair.privateKey;
      const signature = await webcrypto.subtle.sign(
        SIGNING_ALGORITHM_CONFIG.RS256,
        privateKey1,
        new TextEncoder().encode(data)
      );
      const signatureString = toHex(signature);

      const rsaSSAKeyPair2 = await webcrypto.subtle.generateKey(
        {
          name: "RSASSA-PKCS1-v1_5",
          hash: { name: "SHA-256" },
          publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
          modulusLength: 2048,
        },
        false,
        ["sign", "verify"]
      );
      const publicKey2 = rsaSSAKeyPair2.publicKey;

      expect(await verify(data, signatureString, publicKey2, "RS256")).toBe(
        false
      );
    });

    it("returns false for malformed ECDSA signature length (ES256)", async () => {
      const publicKey = ecdsaKeyPair.publicKey;
      const invalidLengthHex = "aa".repeat(63); // 63 bytes instead of 64
      await expect(
        verify(data, invalidLengthHex, publicKey, "ES256")
      ).resolves.toBe(false);
    });
  });
});
