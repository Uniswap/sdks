import { BigNumber } from "ethers";
import { V3Decay } from "../order";

/*
These functions mimic the smart contract functions as closely as possible to ensure that the same results are produced.
Essentially Solidity translated to TypeScript.
*/
function locateArrayPosition(
    curve: V3Decay,
    targetValue: number
  ): [number, number] {
    const relativeBlocks = curve.relativeBlocks;
    let prev = 0;
    let next = 0;
    while (next < curve.relativeAmounts.length) {
      if (relativeBlocks[next] >= targetValue) {
        return [prev, next];
      }
      prev = next;
      next++;
    }
    return [next - 1, next - 1];
  }
  class NonLinearDutchDecayLib {
    static decay(
      curve: V3Decay,
      startAmount: BigNumber,
      decayStartBlock: number,
      currentBlock: number
    ): BigNumber {
      // mismatch of relativeAmounts and relativeBlocks
      if (curve.relativeAmounts.length > 16) {
        throw new Error('InvalidDecayCurve');
      }
  
      // handle current block before decay or no decay
      if (decayStartBlock >= currentBlock || curve.relativeAmounts.length === 0) {
        return startAmount;
      }
  
      const blockDelta = currentBlock - decayStartBlock;
  
      // Special case for when we need to use the decayStartBlock (0)
      if (curve.relativeBlocks[0] > blockDelta) {
        return this.linearDecay(
          0,
          curve.relativeBlocks[0],
          blockDelta,
          startAmount,
          startAmount.sub(curve.relativeAmounts[0])
        );
      }
  
      // the current pos is within or after the curve
      let [prev, next] = locateArrayPosition(curve, blockDelta);
      const lastAmount = startAmount.sub(curve.relativeAmounts[prev]);
      const nextAmount = startAmount.sub(curve.relativeAmounts[next]);
      return this.linearDecay(
        curve.relativeBlocks[prev],
        curve.relativeBlocks[next],
        blockDelta,
        lastAmount,
        nextAmount
      );
    }
  
    static linearDecay(
      startPoint: number,
      endPoint: number,
      currentPoint: number,
      startAmount: BigNumber,
      endAmount: BigNumber
    ): BigNumber {
      if (currentPoint >= endPoint) {
        return endAmount;
      }
  
      const elapsed = BigNumber.from(currentPoint - startPoint);
      const duration = BigNumber.from(endPoint - startPoint);
      if (endAmount.lt(startAmount)) {
        return startAmount.sub(
          startAmount.sub(endAmount.mul(elapsed).div(duration)) //muldivdown in contract
        );
      } else {
        return startAmount.add(
          endAmount.sub(startAmount.mul(elapsed).div(duration)) //muldivup in contract
          //TODO: How can we do muldivup in JS?
        );
      }
    }
  }
  
  export { NonLinearDutchDecayLib };

export interface DutchBlockDecayConfig {
    decayStartBlock: number;
    startAmount: BigNumber;
    relativeBlocks: number[];
    relativeAmounts: BigNumber[];
}

export function getBlockDecayedAmount(
  config: DutchBlockDecayConfig,
  atBlock: number
): BigNumber {
  const {decayStartBlock, startAmount, relativeBlocks, relativeAmounts} = config;
  return NonLinearDutchDecayLib.decay({relativeAmounts, relativeBlocks}, startAmount, decayStartBlock, atBlock);
}

export function getEndAmount(
    config: DutchBlockDecayConfig
): BigNumber {
    const { startAmount, relativeAmounts } = config;
    return startAmount.sub(relativeAmounts[relativeAmounts.length - 1]);
}