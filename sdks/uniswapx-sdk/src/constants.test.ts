import {
  EXCLUSIVE_FILLER_VALIDATION_MAPPING,
  OrderType,
  PERMIT2_MAPPING,
  REACTOR_ADDRESS_MAPPING,
  UNISWAPX_ORDER_QUOTER_MAPPING,
  UNISWAPX_V4_ORDER_QUOTER_MAPPING,
} from "./constants";
import { getPermit2, getReactor } from "./utils";

describe("REACTOR_ADDRESS_MAPPING", () => {
  it("matches the existing reactor mapping snapshot", () => {
    expect(REACTOR_ADDRESS_MAPPING).toMatchInlineSnapshot(`
      {
        "1": {
          "Dutch": "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4",
          "Dutch_V2": "0x00000011F84B9aa48e5f8aA8B9897600006289Be",
          "Priority": "0x0000000000000000000000000000000000000000",
          "Relay": "0x0000000000A4e21E2597DCac987455c48b12edBF",
        },
        "11155111": {
          "Dutch": "0xD6c073F2A3b676B8f9002b276B618e0d8bA84Fad",
          "Dutch_V2": "0x0e22B6638161A89533940Db590E67A52474bEBcd",
          "Relay": "0x0000000000A4e21E2597DCac987455c48b12edBF",
        },
        "12341234": {
          "Dutch": "0xbD7F9D0239f81C94b728d827a87b9864972661eC",
          "Dutch_V2": "0x0000000000000000000000000000000000000000",
          "Relay": "0x0000000000A4e21E2597DCac987455c48b12edBF",
        },
        "130": {
          "Dutch": "0x0000000000000000000000000000000000000000",
          "Dutch_V2": "0x0000000000000000000000000000000000000000",
          "Priority": "0x00000006021a6Bce796be7ba509BBBA71e956e37",
          "Relay": "0x0000000000000000000000000000000000000000",
        },
        "1301": {
          "Dutch": "0x0000000000000000000000000000000000000000",
          "Dutch_V2": "0x0000000000000000000000000000000000000000",
          "Hybrid": "0x000000000C75276D956cc35218ca8f132D877957",
          "Priority": "0x0000000000000000000000000000000000000000",
          "Relay": "0x0000000000000000000000000000000000000000",
        },
        "137": {
          "Dutch": "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4",
          "Dutch_V2": "0x0000000000000000000000000000000000000000",
          "Relay": "0x0000000000A4e21E2597DCac987455c48b12edBF",
        },
        "42161": {
          "Dutch": "0x0000000000000000000000000000000000000000",
          "Dutch_V2": "0x1bd1aAdc9E230626C44a139d7E70d842749351eb",
          "Dutch_V3": "0xB274d5F4b833b61B340b654d600A864fB604a87c",
          "Relay": "0x0000000000000000000000000000000000000000",
        },
        "4217": {
          "Dutch_V3": "0x000000005aF66799D1a6317714D66800f9CA1406",
        },
        "5": {
          "Dutch": "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4",
          "Dutch_V2": "0x0000000000000000000000000000000000000000",
          "Relay": "0x0000000000A4e21E2597DCac987455c48b12edBF",
        },
        "8453": {
          "Dutch": "0x0000000000000000000000000000000000000000",
          "Dutch_V2": "0x0000000000000000000000000000000000000000",
          "Priority": "0x000000001Ec5656dcdB24D90DFa42742738De729",
          "Relay": "0x0000000000000000000000000000000000000000",
        },
      }
    `);
  });
});

describe("Tempo (chainId 4217) registration", () => {
  const TEMPO = 4217;
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const CANONICAL_PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";
  // Both addresses were deployed via the canonical Arachnid CREATE2 factory
  // using salts mined with create2crunch (ECO-365). The reactor has 4 leading
  // zero bytes (5 total); the quoter has 4 leading zero bytes.
  const TEMPO_V3_REACTOR = "0x000000005aF66799D1a6317714D66800f9CA1406";
  const TEMPO_ORDER_QUOTER = "0x00000000a3db63Df9078cBF3dF88B4CAdD5a7F58";

  it("registers the canonical Permit2 address for Tempo", () => {
    expect(PERMIT2_MAPPING[TEMPO]).toEqual(CANONICAL_PERMIT2);
    expect(getPermit2(TEMPO)).toEqual(CANONICAL_PERMIT2);
  });

  it("getReactor returns the deployed Dutch_V3 reactor for Tempo", () => {
    expect(getReactor(TEMPO, OrderType.Dutch_V3)).toEqual(TEMPO_V3_REACTOR);
    expect(REACTOR_ADDRESS_MAPPING[TEMPO][OrderType.Dutch_V3]).toEqual(
      TEMPO_V3_REACTOR
    );
  });

  it("registers the deployed UniswapX order quoter for Tempo", () => {
    expect(UNISWAPX_ORDER_QUOTER_MAPPING[TEMPO]).toEqual(TEMPO_ORDER_QUOTER);
  });

  it("registers the zero-address exclusive filler validator for Tempo (matches Arbitrum/Sepolia precedent)", () => {
    expect(EXCLUSIVE_FILLER_VALIDATION_MAPPING[TEMPO]).toEqual(ZERO_ADDR);
  });

  it("does NOT register Tempo for Priority / Dutch_V2 / V4 (intentional — V3-only chain)", () => {
    // Locking in the intentional absences so a future regression cannot
    // silently extend Tempo to unsupported order types. The downstream
    // OffChainUniswapXOrderValidator in x-service relies on these gaps.
    expect(REACTOR_ADDRESS_MAPPING[TEMPO][OrderType.Priority]).toBeUndefined();
    expect(REACTOR_ADDRESS_MAPPING[TEMPO][OrderType.Dutch_V2]).toBeUndefined();
    expect(REACTOR_ADDRESS_MAPPING[TEMPO][OrderType.V4]).toBeUndefined();
    expect(UNISWAPX_V4_ORDER_QUOTER_MAPPING[TEMPO]).toBeUndefined();
  });
});
