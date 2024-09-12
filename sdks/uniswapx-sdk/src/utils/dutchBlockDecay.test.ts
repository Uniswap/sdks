import { BigNumber } from "ethers";

import { NonLinearDutchDecayLib } from "./dutchBlockDecay";

describe("NonLinearDutchDecayLib", () => {
    describe("linearDecay", () => {
        it("Simple linearDecay", () => {
            const result = NonLinearDutchDecayLib.linearDecay(0, 10, 5, BigNumber.from(100), BigNumber.from(50));
            expect(result.toString()).toEqual('75');
        });

        it("Test for mulDivDown for endAmount < startAmount", () => {
            const result = NonLinearDutchDecayLib.linearDecay(0, 10, 5, BigNumber.from(100), BigNumber.from(75));
            expect(result.toString()).toEqual('88'); //If we successfully emulated mulDivDown then this is 88.
        });

        it("Simple linearDecay but with endAmount > startAmount", () => {
            const result = NonLinearDutchDecayLib.linearDecay(0, 10, 5, BigNumber.from(100), BigNumber.from(120));
            expect(result.toString()).toEqual('110');
        });

        it.skip("Test for mulDivUp for endAmount > startAmount", () => {
            const result = NonLinearDutchDecayLib.linearDecay(0, 10, 5, BigNumber.from(100), BigNumber.from(125));
            //if we successfully emulated mulDivUp then this is 113
            expect(result.toString()).toEqual('113');
        });
    });

    describe("decay", () => {
        it("Returns startAmount if decay hasnt started", () => {
            const test_payload = {
                curve: {
                    relativeBlocks: [1, 2, 3, 4, 5],
                    relativeAmounts: [0, 10, 20, 30, 40].map(BigInt),
                },
                startAmount: BigNumber.from(100),
                decayStartBlock: 0,
                currentBlock: 0,
            };
            const result = NonLinearDutchDecayLib.decay(test_payload.curve, test_payload.startAmount, test_payload.decayStartBlock, test_payload.currentBlock);
            expect(result.toString()).toEqual('100');
        });

        it("Correctly calculates non-rounding decay", () => {
            const test_payload = {
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [40].map(BigInt),
                },
                startAmount: BigNumber.from(100),
                decayStartBlock: 0,
                currentBlock: 2,
            };
            const result = NonLinearDutchDecayLib.decay(test_payload.curve, test_payload.startAmount, test_payload.decayStartBlock, test_payload.currentBlock);
            expect(result.toString()).toEqual('80');
        });

        // Add a rounding decay once we clarify mulDivDown/mulDivUp

        it("Correctly calculates non-rounding decay with multiple points", () => {
            const test_payload = {
                curve: {
                    relativeBlocks: [4, 6],
                    relativeAmounts: [40, 20].map(BigInt),
                },
                startAmount: BigNumber.from(100),
                decayStartBlock: 0,
                currentBlock: 5,
            };
            const result = NonLinearDutchDecayLib.decay(test_payload.curve, test_payload.startAmount, test_payload.decayStartBlock, test_payload.currentBlock);
            expect(result.toString()).toEqual('70');
        });

        it("Correctly calculates non-rounding negative decay", () => {
            const test_payload = {
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigInt(-40)],
                },
                startAmount: BigNumber.from(100),
                decayStartBlock: 0,
                currentBlock: 2,
            };
            const result = NonLinearDutchDecayLib.decay(test_payload.curve, test_payload.startAmount, test_payload.decayStartBlock, test_payload.currentBlock);
            expect(result.toString()).toEqual('120');
        });

        it("Correctly calculates non-rounding negative decay with multiple points", () => {
            const test_payload = {
                curve: {
                    relativeBlocks: [4, 6],
                    relativeAmounts: [BigInt(-40), BigInt(-20)],
                },
                startAmount: BigNumber.from(100),
                decayStartBlock: 0,
                currentBlock: 5,
            };
            const result = NonLinearDutchDecayLib.decay(test_payload.curve, test_payload.startAmount, test_payload.decayStartBlock, test_payload.currentBlock);
            expect(result.toString()).toEqual('130');
        });

    });
});