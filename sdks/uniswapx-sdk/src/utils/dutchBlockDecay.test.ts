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

        it("Test for mulDivDown for endAmount > startAmount", () => {
            const result = NonLinearDutchDecayLib.linearDecay(0, 10, 5, BigNumber.from(100), BigNumber.from(125));
            //if we successfully emulated mulDivDown then this is 112
            expect(result.toString()).toEqual('112');
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

        // Tempo (chainId 4217) has ~0.5s blocks, so a realistic Dutch_V3 decay
        // window of ~30s wallclock corresponds to 60 blocks. The block-delta
        // math in NonLinearDutchDecayLib is chain-agnostic: it operates purely
        // on block deltas, so no source change is required for Tempo support.
        // These tests exercise that math at Tempo-realistic block lengths to
        // guard against regressions.
        describe("Tempo-realistic decay (60 blocks @ 0.5s ~= 30s wallclock)", () => {
            const TEMPO_DECAY_BLOCKS = 60;
            const decayStartBlock = 1_000_000;
            const startAmount = BigNumber.from("1000000000000000000"); // 1e18

            it("returns startAmount at decayStartBlock", () => {
                const curve = {
                    relativeBlocks: [TEMPO_DECAY_BLOCKS],
                    relativeAmounts: [BigInt("100000000000000000")], // 0.1e18 decay
                };
                const result = NonLinearDutchDecayLib.decay(
                    curve,
                    startAmount,
                    decayStartBlock,
                    decayStartBlock
                );
                expect(result.toString()).toEqual(startAmount.toString());
            });

            it("returns endAmount after the full Tempo decay window", () => {
                const decayDelta = BigInt("100000000000000000");
                const curve = {
                    relativeBlocks: [TEMPO_DECAY_BLOCKS],
                    relativeAmounts: [decayDelta],
                };
                const result = NonLinearDutchDecayLib.decay(
                    curve,
                    startAmount,
                    decayStartBlock,
                    decayStartBlock + TEMPO_DECAY_BLOCKS
                );
                expect(result.toString()).toEqual(
                    startAmount.sub(decayDelta.toString()).toString()
                );
            });

            it("linearly interpolates at the midpoint of the Tempo decay window", () => {
                const decayDelta = BigInt("100000000000000000"); // 0.1e18
                const curve = {
                    relativeBlocks: [TEMPO_DECAY_BLOCKS],
                    relativeAmounts: [decayDelta],
                };
                const result = NonLinearDutchDecayLib.decay(
                    curve,
                    startAmount,
                    decayStartBlock,
                    decayStartBlock + TEMPO_DECAY_BLOCKS / 2
                );
                // Halfway through: startAmount - decayDelta/2
                expect(result.toString()).toEqual(
                    startAmount.sub((decayDelta / BigInt(2)).toString()).toString()
                );
            });

            it("clamps to endAmount past the Tempo decay window", () => {
                const decayDelta = BigInt("100000000000000000");
                const curve = {
                    relativeBlocks: [TEMPO_DECAY_BLOCKS],
                    relativeAmounts: [decayDelta],
                };
                const result = NonLinearDutchDecayLib.decay(
                    curve,
                    startAmount,
                    decayStartBlock,
                    decayStartBlock + TEMPO_DECAY_BLOCKS * 10
                );
                expect(result.toString()).toEqual(
                    startAmount.sub(decayDelta.toString()).toString()
                );
            });
        });

    });
});
