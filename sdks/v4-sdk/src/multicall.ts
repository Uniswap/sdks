import { Interface } from '@ethersproject/abi'
import IMulticall from '@uniswap/v3-periphery/artifacts/contracts/interfaces/IMulticall.sol/IMulticall.json'

export abstract class Multicall {
  public static INTERFACE: Interface = new Interface(IMulticall.abi)

  /**
   * Cannot be constructed.
   */
  private constructor() {}

  public static encodeMulticall(calldataList: string | string[]): string {
    if (!Array.isArray(calldataList)) {
      calldataList = [calldataList]
    }

    return calldataList.length === 1
      ? calldataList[0]
      : Multicall.INTERFACE.encodeFunctionData('multicall', [calldataList])
  }

  public static decodeMulticall(encodedCalldata: string): string[] {
    return Multicall.INTERFACE.decodeFunctionData('multicall', encodedCalldata)[0]
  }
}
