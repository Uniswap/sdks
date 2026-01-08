import * as dohjs from 'dohjs';

type SigningAlgorithmConfig = {
    name: string;
    hash?: {
        name: string;
    };
    saltLength?: number;
    namedCurve?: string;
    ecdsaCoordinateLength?: number;
};
declare const SIGNING_ALGORITHM_IMPORT_PARAMS: {
    ES256: EcKeyImportParams;
    ES384: EcKeyImportParams;
    ES512: EcKeyImportParams;
    EdDSA: Algorithm;
    PS256: RsaHashedImportParams;
    PS384: RsaHashedImportParams;
    PS512: RsaHashedImportParams;
    RS256: RsaHashedImportParams;
    RS384: RsaHashedImportParams;
    RS512: RsaHashedImportParams;
};
declare const SIGNING_ALGORITHM_CONFIG: {
    ES256: {
        name: string;
        hash: {
            name: string;
        };
        namedCurve: string;
        ecdsaCoordinateLength: number;
    };
    ES384: {
        name: string;
        hash: {
            name: string;
        };
        namedCurve: string;
        ecdsaCoordinateLength: number;
    };
    ES512: {
        name: string;
        hash: {
            name: string;
        };
        namedCurve: string;
        ecdsaCoordinateLength: number;
    };
    EdDSA: {
        name: string;
    };
    PS256: {
        name: string;
        hash: {
            name: string;
        };
        saltLength: number;
    };
    PS384: {
        name: string;
        hash: {
            name: string;
        };
        saltLength: number;
    };
    PS512: {
        name: string;
        hash: {
            name: string;
        };
        saltLength: number;
    };
    RS256: {
        name: string;
        hash: {
            name: string;
        };
    };
    RS384: {
        name: string;
        hash: {
            name: string;
        };
    };
    RS512: {
        name: string;
        hash: {
            name: string;
        };
    };
};

type PublicKey = {
    key: string;
    algorithm: keyof typeof SIGNING_ALGORITHM_CONFIG;
};
declare function generate(...publicKeys: PublicKey[]): string;

declare function sign(data: string | object, privateKey: string, algorithm: keyof typeof SIGNING_ALGORITHM_CONFIG): Promise<string>;

declare const DohResolver: typeof dohjs.DohResolver;
declare const PREFIX = "TWIST=";
declare function verifyAsyncDns(calldata: string, signature: string, host: string, id: string, thisResolver?: InstanceType<typeof DohResolver>): Promise<boolean>;
declare function verifyAsyncJson(calldata: string, signature: string, url: URL, id: string): Promise<boolean>;
declare function verify(calldata: string, signature: string, publicKey: CryptoKey, alg: keyof typeof SIGNING_ALGORITHM_CONFIG): Promise<boolean>;

type JsonPrimitive = null | boolean | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | {
    [key: string]: JsonValue;
};
type RequestPayload<Params = Record<string, unknown>> = {
    method: string;
    params: Params;
};
declare function canonicalStringify(value: unknown): string;
declare function serializeRequestPayload<T>(requestPayload: T): Uint8Array;

export { type JsonPrimitive, type JsonValue, PREFIX, type PublicKey, type RequestPayload, SIGNING_ALGORITHM_CONFIG, SIGNING_ALGORITHM_IMPORT_PARAMS, type SigningAlgorithmConfig, canonicalStringify, generate, serializeRequestPayload, sign, verify, verifyAsyncDns, verifyAsyncJson };
