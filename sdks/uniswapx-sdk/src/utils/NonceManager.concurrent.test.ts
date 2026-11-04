import { BigNumber, ethers } from "ethers";

import { NonceManager } from "./NonceManager";

const OWNER = "0x0000000000000000000000000000000000000001";
const NONCE_BITMAP = new ethers.utils.Interface([
  "function nonceBitmap(address owner, uint256 word) view returns (uint256)",
]);

// Keep the contract ABI path real; only replace the read-only RPC transport.
class BitmapProvider extends ethers.providers.StaticJsonRpcProvider {
  constructor(
    private readonly readBitmap: (
      owner: string,
      word: BigNumber
    ) => Promise<BigNumber>
  ) {
    super(undefined, { name: "robinhood", chainId: 4663 });
  }

  async perform(method: string, params: any): Promise<any> {
    if (method !== "call") throw new Error(`Unexpected RPC method: ${method}`);
    const [owner, word] = NONCE_BITMAP.decodeFunctionData(
      "nonceBitmap",
      params.transaction.data
    );
    return NONCE_BITMAP.encodeFunctionResult("nonceBitmap", [
      await this.readBitmap(owner, word),
    ]);
  }
}

describe("NonceManager concurrent reservations", () => {
  it("reserves distinct nonces after the bitmap has been cached", async () => {
    const manager = new NonceManager(
      new BitmapProvider(async () => BigNumber.from(0)),
      4663
    );
    expect((await manager.useNonce(OWNER)).toString()).toEqual("0");
    const nonces = await Promise.all([
      manager.useNonce(OWNER),
      manager.useNonce(OWNER),
    ]);
    expect(nonces.map((nonce) => nonce.toString())).toEqual(["1", "2"]);
  });

  it("reserves distinct nonces when the cached word fills up", async () => {
    const words: string[] = [];
    const manager = new NonceManager(
      new BitmapProvider(async (_owner, word) => {
        words.push(word.toString());
        return word.eq(0)
          ? ethers.constants.MaxUint256.sub(BigNumber.from(2).pow(255))
          : BigNumber.from(0);
      }),
      4663
    );
    const nonces = await Promise.all([
      manager.useNonce(OWNER),
      manager.useNonce(OWNER),
      manager.useNonce(OWNER),
    ]);
    expect(nonces.map((nonce) => nonce.toString())).toEqual([
      "255",
      "256",
      "257",
    ]);
    expect(words).toEqual(["0", "1"]);
  });

  it("allows queued callers to retry after a bitmap read fails", async () => {
    let reads = 0;
    const manager = new NonceManager(
      new BitmapProvider(async () => {
        if (reads++ === 0) throw new Error("bitmap unavailable");
        return BigNumber.from(0);
      }),
      4663
    );
    const failed = manager.useNonce(OWNER);
    const retried = manager.useNonce(OWNER);
    await expect(failed).rejects.toThrow("bitmap unavailable");
    expect((await retried).toString()).toEqual("0");
    expect((await manager.useNonce(OWNER)).toString()).toEqual("1");
  });

  it("does not block other owners behind a pending bitmap read", async () => {
    let release!: (bitmap: BigNumber) => void;
    const pending = new Promise<BigNumber>((resolve) => {
      release = resolve;
    });
    const manager = new NonceManager(
      new BitmapProvider(async (owner) =>
        owner === OWNER ? pending : BigNumber.from(0)
      ),
      4663
    );
    const first = manager.useNonce(OWNER);
    try {
      const other = await manager.useNonce(
        "0x0000000000000000000000000000000000000002"
      );
      expect(other.toString()).toEqual("0");
    } finally {
      release(BigNumber.from(0));
    }
    expect((await first).toString()).toEqual("0");
  });

  it("shares reservations across checksum and lowercase owner spellings", async () => {
    const manager = new NonceManager(
      new BitmapProvider(async () => BigNumber.from(0)),
      4663
    );
    const owner = ethers.utils.getAddress(
      "0x00000000000000000000000000000000000000ab"
    );
    const nonces = await Promise.all([
      manager.useNonce(owner),
      manager.useNonce(owner.toLowerCase()),
    ]);
    expect(nonces.map((nonce) => nonce.toString())).toEqual(["0", "1"]);
  });

  it("reserves distinct nonces for concurrent calls on a fresh instance", async () => {
    const manager = new NonceManager(
      new BitmapProvider(async () => BigNumber.from(0)),
      4663
    );
    const nonces = await Promise.all([
      manager.useNonce(OWNER),
      manager.useNonce(OWNER),
      manager.useNonce(OWNER),
    ]);
    expect(nonces.map((nonce) => nonce.toString())).toEqual(["0", "1", "2"]);
  });
});
