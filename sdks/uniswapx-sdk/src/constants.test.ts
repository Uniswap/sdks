import { REACTOR_ADDRESS_MAPPING } from "./constants";

describe("REACTOR_ADDRESS_MAPPING", () => {
  it("matches the existing reactor mapping snapshot", () => {
    expect(REACTOR_ADDRESS_MAPPING).toMatchInlineSnapshot(`
      Object {
        "1": Object {
          "Dutch": "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4",
          "Dutch_V2": "0x00000011F84B9aa48e5f8aA8B9897600006289Be",
          "Priority": "0x0000000000000000000000000000000000000000",
          "Relay": "0x0000000000A4e21E2597DCac987455c48b12edBF",
        },
        "11155111": Object {
          "Dutch": "0xD6c073F2A3b676B8f9002b276B618e0d8bA84Fad",
          "Dutch_V2": "0x0e22B6638161A89533940Db590E67A52474bEBcd",
          "Relay": "0x0000000000A4e21E2597DCac987455c48b12edBF",
        },
        "12341234": Object {
          "Dutch": "0xbD7F9D0239f81C94b728d827a87b9864972661eC",
          "Dutch_V2": "0x0000000000000000000000000000000000000000",
          "Relay": "0x0000000000A4e21E2597DCac987455c48b12edBF",
        },
        "130": Object {
          "Dutch": "0x0000000000000000000000000000000000000000",
          "Dutch_V2": "0x0000000000000000000000000000000000000000",
          "Priority": "0x00000006021a6Bce796be7ba509BBBA71e956e37",
          "Relay": "0x0000000000000000000000000000000000000000",
        },
        "137": Object {
          "Dutch": "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4",
          "Dutch_V2": "0x0000000000000000000000000000000000000000",
          "Relay": "0x0000000000A4e21E2597DCac987455c48b12edBF",
        },
        "42161": Object {
          "Dutch": "0x0000000000000000000000000000000000000000",
          "Dutch_V2": "0x1bd1aAdc9E230626C44a139d7E70d842749351eb",
          "Dutch_V3": "0xB274d5F4b833b61B340b654d600A864fB604a87c",
          "Relay": "0x0000000000000000000000000000000000000000",
        },
        "5": Object {
          "Dutch": "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4",
          "Dutch_V2": "0x0000000000000000000000000000000000000000",
          "Relay": "0x0000000000A4e21E2597DCac987455c48b12edBF",
        },
        "8453": Object {
          "Dutch": "0x0000000000000000000000000000000000000000",
          "Dutch_V2": "0x0000000000000000000000000000000000000000",
          "Priority": "0x000000001Ec5656dcdB24D90DFa42742738De729",
          "Relay": "0x0000000000000000000000000000000000000000",
        },
      }
    `);
  });
});
