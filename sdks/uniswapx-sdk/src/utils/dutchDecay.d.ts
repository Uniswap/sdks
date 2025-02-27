import { BigNumber } from "ethers";
export interface DutchDecayConfig {
    startAmount: BigNumber;
    endAmount: BigNumber;
    decayStartTime: number;
    decayEndTime: number;
}
export declare function getDecayedAmount(config: DutchDecayConfig, atTime?: number): BigNumber;
