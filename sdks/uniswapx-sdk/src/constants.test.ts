import { REACTOR_ADDRESS_MAPPING } from "./constants";

describe("REACTOR_ADDRESS_MAPPING", () => {
  it("matches the existing reactor mapping snapshot", () => {
    expect(REACTOR_ADDRESS_MAPPING).toMatchInlineSnapshot(`
    {
      "1": {
        "Dutch": "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4",
        "Dutch_V2": "0x3867393cC6EA7b0414C2c3e1D9fe7cEa987Fd066",
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
      "137": {
        "Dutch": "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4",
        "Dutch_V2": "0x0000000000000000000000000000000000000000",
        "Relay": "0x0000000000A4e21E2597DCac987455c48b12edBF",
      },
      "5": {
        "Dutch": "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4",
        "Dutch_V2": "0x0000000000000000000000000000000000000000",
        "Relay": "0x0000000000A4e21E2597DCac987455c48b12edBF",
      },
    }
  `);
  });
});
