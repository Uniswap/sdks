import { BigNumber, ethers } from "ethers";
import invariant from "tiny-invariant";

import { OrderType } from "../constants";
import { CosignedV3DutchOrder, CosignedV3DutchOrderInfo, CosignerData, UnsignedV3DutchOrder } from "../order/V3DutchOrder";
import { V3DutchInput, V3DutchOutput } from "../order/types";
import { getPermit2, getReactor } from "../utils";
import { getEndAmount } from "../utils/dutchBlockDecay";

import { OrderBuilder } from "./OrderBuilder";

export class V3DutchOrderBuilder extends OrderBuilder {
    build(): CosignedV3DutchOrder {
        invariant(this.info.cosigner !== undefined, "cosigner not set");
        invariant(this.info.cosignature !== undefined, "cosignature not set");
        invariant(this.info.input !== undefined, "input not set");
        invariant(
          this.info.outputs && this.info.outputs.length > 0,
          "outputs not set"
        );
        // In V3, we are not enforcing that the startAmount is greater than the endAmount
        invariant(this.info.cosignerData !== undefined, "cosignerData not set");
        invariant(this.info.cosignerData.decayStartBlock !== undefined, "decayStartBlock not set");
        // In V3, we don't have a decayEndTime field and use OrderInfo.deadline field for Permit2
        invariant(this.orderInfo.deadline !== undefined, "deadline not set");
        invariant(
            this.info.cosignerData.exclusiveFiller !== undefined,
            "exclusiveFiller not set"
          );
        invariant(
            this.info.cosignerData.exclusivityOverrideBps !== undefined,
            "exclusivityOverrideBps not set"
        );
        invariant(
              this.info.cosignerData.inputOverride.lte(this.info.input.startAmount),
            "inputOverride larger than original input"
        );
        invariant(
            this.info.cosignerData.outputOverrides.length > 0,
            "outputOverrides not set"
        );
        this.info.cosignerData.outputOverrides.forEach((override, idx) => {
            invariant(
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                override.gte(this.info.outputs![idx].startAmount),
                "outputOverride smaller than original output"
            );
        });
        invariant(this.info.input !== undefined, "original input not set");
        // We are not checking if the decayStartTime is before the deadline because it is not enforced in the smart contract

        return new CosignedV3DutchOrder(
            Object.assign(this.getOrderInfo(), {
                cosignerData: this.info.cosignerData,
                input: this.info.input,
                outputs: this.info.outputs,
                cosigner: this.info.cosigner,
                cosignature: this.info.cosignature,
            }),
            this.chainId,
            this.permit2Address
        );

    }
    private permit2Address: string;
    private info: Partial<CosignedV3DutchOrderInfo>;

    constructor(
        private chainId: number,
        reactorAddress?: string,
        _permit2Address?: string
    ) {
        super();

        this.reactor(getReactor(chainId, OrderType.Dutch_V3, reactorAddress));
        this.permit2Address = getPermit2(chainId, _permit2Address);

        this.info = {
            outputs: [],
            cosignerData: {
                decayStartBlock: 0,
                exclusiveFiller: ethers.constants.AddressZero,
                exclusivityOverrideBps: BigNumber.from(0),
                inputOverride: BigNumber.from(0),
                outputOverrides: [],
            },
        };
    }

    cosigner(cosigner: string): this {
        this.info.cosigner = cosigner;
        return this;
    }

    cosignature(cosignature: string | undefined): this {
        this.info.cosignature = cosignature;
        return this;
    }

    decayStartBlock(decayStartBlock: number): this {
        if (!this.info.cosignerData) {
            this.initializeCosignerData({ decayStartBlock });
        } else {
            this.info.cosignerData.decayStartBlock = decayStartBlock;
        }
        return this;
    }

    private initializeCosignerData(data: Partial<CosignerData>): void {
        this.info.cosignerData = {
          decayStartBlock: 0,
          exclusiveFiller: ethers.constants.AddressZero,
          exclusivityOverrideBps: BigNumber.from(0),
          inputOverride: BigNumber.from(0),
          outputOverrides: [],
          ...data,
        };
    }

    input(input: V3DutchInput): this {
        this.info.input = input;
        return this;
    }

    output(output: V3DutchOutput): this {
        invariant(
            output.startAmount.gte(getEndAmount({
                startAmount: output.startAmount,
                relativeAmounts: output.curve.relativeAmounts,
                relativeBlocks: output.curve.relativeBlocks,
            })), "startAmount must be greater than the endAmount"
        );
        this.info.outputs?.push(output);
        return this;
    }
        
    inputOverride(inputOverride: BigNumber): this {
        if (!this.info.cosignerData) {
            this.initializeCosignerData({ inputOverride });
        } else {
            this.info.cosignerData.inputOverride = inputOverride;
        }
        return this;
    }

    outputOverrides(outputOverrides: BigNumber[]): this {
        if (!this.info.cosignerData) {
          this.initializeCosignerData({ outputOverrides });
        } else {
          this.info.cosignerData.outputOverrides = outputOverrides;
        }
        return this;
    }

    deadline(deadline: number): this {
        super.deadline(deadline);
        return this;
    }

    swapper(swapper: string): this {
        super.swapper(swapper);
        return this;
    }
    
    nonce(nonce: BigNumber): this {
        super.nonce(nonce);
        return this;
    }

    cosignerData(cosignerData: CosignerData): this {
        this.decayStartBlock(cosignerData.decayStartBlock);
        this.exclusiveFiller(cosignerData.exclusiveFiller);
        this.exclusivityOverrideBps(cosignerData.exclusivityOverrideBps);
        this.inputOverride(cosignerData.inputOverride);
        this.outputOverrides(cosignerData.outputOverrides);
        return this;
    }

    exclusiveFiller(exclusiveFiller: string): this {
        if (!this.info.cosignerData) {
            this.initializeCosignerData({ exclusiveFiller });
        } else {
            this.info.cosignerData.exclusiveFiller = exclusiveFiller;
        }
        return this;
    }

    exclusivityOverrideBps(exclusivityOverrideBps: BigNumber): this {
        if (!this.info.cosignerData) {
            this.initializeCosignerData({ exclusivityOverrideBps });
        } else {
            this.info.cosignerData.exclusivityOverrideBps = exclusivityOverrideBps;
        }
        return this;
    }

    // ensures that we only change non fee outputs
    nonFeeRecipient(newRecipient: string, feeRecipient?: string): this {
        invariant(
        newRecipient !== feeRecipient,
        `newRecipient must be different from feeRecipient: ${newRecipient}`
        );
        if (!this.info.outputs) {
            return this;
        }
        this.info.outputs = this.info.outputs.map((output) => {
            // if fee output then pass through
            if (
                feeRecipient &&
                output.recipient.toLowerCase() === feeRecipient.toLowerCase()
            ) {
                return output;
            }

            return {
                ...output,
                recipient: newRecipient,
            };
        });
        return this;
    }

    buildPartial(): UnsignedV3DutchOrder { //build an unsigned order
        invariant(this.info.cosigner !== undefined, "cosigner not set");
        invariant(this.info.input !== undefined, "input not set");
        invariant(
          this.info.outputs && this.info.outputs.length > 0,
          "outputs not set"
        );
        invariant(this.info.input !== undefined, "original input not set");
        invariant(!this.info.deadline, "deadline not set");
        invariant(!this.info.swapper, "swapper not set");
        return new UnsignedV3DutchOrder(
            Object.assign(this.getOrderInfo(), {
                input: this.info.input,
                outputs: this.info.outputs,
                cosigner: this.info.cosigner,
            }),
            this.chainId,
            this.permit2Address
        );
    }
    //TODO: fromOrder()
}