import { BigNumber } from "ethers";
import { NonlinearDutchDecay } from "../order";
declare class NonLinearDutchDecayLib {
    static decay(curve: NonlinearDutchDecay, startAmount: BigNumber, decayStartBlock: number, currentBlock: number): BigNumber;
    static linearDecay(startPoint: number, endPoint: number, currentPoint: number, startAmount: BigNumber, endAmount: BigNumber): BigNumber;
}
export { NonLinearDutchDecayLib };
export interface DutchBlockDecayConfig {
    decayStartBlock: number;
    startAmount: BigNumber;
    relativeBlocks: number[];
    relativeAmounts: bigint[];
}
export declare function getBlockDecayedAmount(config: DutchBlockDecayConfig, atBlock: number): BigNumber;
export declare function getEndAmount(config: Partial<DutchBlockDecayConfig>): BigNumber;
