import { Log, StaticJsonRpcProvider } from "@ethersproject/providers";
import { BigNumber, constants, utils } from "ethers";

import { UniswapXEventWatcher } from "./EventWatcher";

describe("EventWatcher.getTokenTransfers", () => {
  const sender = "0x0000000000000000000000000000000000000001";
  const recipient = "0x0000000000000000000000000000000000000002";
  const token = "0x0000000000000000000000000000000000000003";
  const ethTransferEmitter = "0xfFfFfFfFfFfFfFfFfFfFfFfFfFfFfFfFfFfFfFfE";
  const amount = BigNumber.from(123);
  const watcher = new UniswapXEventWatcher(
    new StaticJsonRpcProvider(),
    constants.AddressZero
  );
  const transferInterface = new utils.Interface([
    "event Transfer(address indexed from, address indexed to, uint256 value)",
  ]);

  function transferLog(address: string): Log {
    return {
      address,
      ...transferInterface.encodeEventLog(
        transferInterface.getEvent("Transfer"),
        [sender, recipient, amount]
      ),
      blockNumber: 1,
      blockHash: constants.HashZero,
      transactionIndex: 0,
      transactionHash: constants.HashZero,
      logIndex: 0,
      removed: false,
    };
  }

  it("returns an ERC-20 transfer to the recipient", () => {
    expect(watcher.getTokenTransfers([transferLog(token)], recipient)).toEqual([
      { token, amount },
    ]);
  });

  it("skips EIP-7708 ETH transfer logs with a mixed-case emitter address", () => {
    expect(
      watcher.getTokenTransfers([transferLog(ethTransferEmitter)], recipient)
    ).toEqual([]);
  });

  it("returns only the ERC-20 transfer from mixed receipt logs", () => {
    const logs = [transferLog(ethTransferEmitter), transferLog(token)];

    expect(watcher.getTokenTransfers(logs, recipient)).toEqual([{ token, amount }]);
  });
});
