import { BigNumber, constants } from "ethers";

import { V3DutchOrderBuilder } from "./V3DutchOrderBuilder";
import { CosignedV3DutchOrder, UnsignedV3DutchOrder } from "../order/V3DutchOrder";

const INPUT_TOKEN = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const OUTPUT_TOKEN = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

const INPUT_START_AMOUNT = BigNumber.from("1000000");
const OUTPUT_START_AMOUNT = BigNumber.from("1000000000000000000");

describe("V3DutchOrderBuilder", () => {
    let builder: V3DutchOrderBuilder;

    beforeEach(() => {
      builder = new V3DutchOrderBuilder(1, constants.AddressZero);
    });
  
    it("Build a valid order", () => {
        const deadline = Date.now() + 1000;
        const order = builder
            .cosigner(constants.AddressZero)
            .cosignature("0x")
            .decayStartBlock(212121)
            .input({
                token: INPUT_TOKEN,
                startAmount: INPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [1],
                    relativeAmounts: [BigNumber.from(0)],
                },
                maxAmount: INPUT_START_AMOUNT.add(1),
            })
            .output({
                token: OUTPUT_TOKEN,
                startAmount: OUTPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigNumber.from(4)],
                },
                recipient: constants.AddressZero,
            })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(constants.AddressZero)
            .nonce(BigNumber.from(100))
            .build();
        
        expect(order.info.cosignerData.decayStartBlock).toEqual(212121);
        expect(order.info.outputs.length).toEqual(1);
    });
    //TODO: Add tests that uses the validation contract once it is implemented

    it("Build a valid order with multiple outputs", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        const order = builder
            .cosigner(constants.AddressZero)
            .cosignature("0x")
            .deadline(deadline)
            .decayStartBlock(212121)
            .swapper(constants.AddressZero)
            .nonce(BigNumber.from(100))
            .input({
                token: INPUT_TOKEN,
                startAmount: INPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [1],
                    relativeAmounts: [BigNumber.from(0)],
                },
                maxAmount: INPUT_START_AMOUNT.add(1),
            })
            .output({
                token: OUTPUT_TOKEN,
                startAmount: OUTPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigNumber.from(4)],
                },
                recipient: constants.AddressZero,
            })
            .output({
                token: OUTPUT_TOKEN,
                startAmount: OUTPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [17],
                    relativeAmounts: [BigNumber.from(17)],
                },
                recipient: constants.AddressZero,
            })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT.mul(101).div(100), OUTPUT_START_AMOUNT])
            .build();
        expect(order.info.outputs.length).toEqual(2);
        expect(order.info.cosignerData.decayStartBlock).toEqual(212121);
    });
    
    it("Throw if cosigner is not set", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() =>
            builder
            .cosignature("0x")
            .decayStartBlock(212121)
            .input({
                token: INPUT_TOKEN,
                startAmount: INPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [1],
                    relativeAmounts: [BigNumber.from(0)],
                },
                maxAmount: INPUT_START_AMOUNT.add(1),
            })
            .output({
                token: OUTPUT_TOKEN,
                startAmount: OUTPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigNumber.from(4)],
                },
                recipient: constants.AddressZero,
            })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(constants.AddressZero)
            .nonce(BigNumber.from(100))
            .build()
          ).toThrow("Invariant failed: cosigner not set");
    });

    it("Throw if swapper is not set", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() =>
            builder
            .cosignature("0x")
            .cosigner(constants.AddressZero)
            .decayStartBlock(212121)
            .input({
                token: INPUT_TOKEN,
                startAmount: INPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [1],
                    relativeAmounts: [BigNumber.from(0)],
                },
                maxAmount: INPUT_START_AMOUNT.add(1),
            })
            .output({
                token: OUTPUT_TOKEN,
                startAmount: OUTPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigNumber.from(4)],
                },
                recipient: constants.AddressZero,
            })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .nonce(BigNumber.from(100))
            .build()
          ).toThrow("Invariant failed: swapper not set");
    });

    it("Deadline not set", () => {
        expect(() => builder
            .cosigner(constants.AddressZero)
            .cosignature("0x")
            .decayStartBlock(212121)
            .input({
                token: INPUT_TOKEN,
                startAmount: INPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [1],
                    relativeAmounts: [BigNumber.from(0)],
                },
                maxAmount: INPUT_START_AMOUNT.add(1),
            })
            .output({
                token: OUTPUT_TOKEN,
                startAmount: OUTPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigNumber.from(4)],
                },
                recipient: constants.AddressZero,
            })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .swapper(constants.AddressZero)
            .nonce(BigNumber.from(100))
            .build()
        ).toThrow("Invariant failed: deadline not set");
    });

    it("Nonce not set", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() =>
            builder
            .cosignature("0x")
            .cosigner(constants.AddressZero)
            .decayStartBlock(212121)
            .input({
                token: INPUT_TOKEN,
                startAmount: INPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [1],
                    relativeAmounts: [BigNumber.from(0)],
                },
                maxAmount: INPUT_START_AMOUNT.add(1),
            })
            .output({
                token: OUTPUT_TOKEN,
                startAmount: OUTPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigNumber.from(4)],
                },
                recipient: constants.AddressZero,
            })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(constants.AddressZero)
            // omitting nonce
            .build()
          ).toThrow("Invariant failed: nonce not set");
    });

    it("Throw if input is not set", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() =>
            builder
            .cosignature("0x")
            .cosigner(constants.AddressZero)
            .decayStartBlock(212121)
            // omitting input
            .output({
                token: OUTPUT_TOKEN,
                startAmount: OUTPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigNumber.from(4)],
                },
                recipient: constants.AddressZero,
            })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(constants.AddressZero)
            .nonce(BigNumber.from(100))
            .build()
          ).toThrow("Invariant failed: input not set");
    });

    it("Throw if output is not set", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() =>
            builder
            .cosignature("0x")
            .cosigner(constants.AddressZero)
            .decayStartBlock(212121)
            .input({
                token: INPUT_TOKEN,
                startAmount: INPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [1],
                    relativeAmounts: [BigNumber.from(0)],
                },
                maxAmount: INPUT_START_AMOUNT.add(1),
            })
            // omitting output
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(constants.AddressZero)
            .nonce(BigNumber.from(100))
            .build()
          ).toThrow("Invariant failed: outputs not set");
    });

    it("Throw if inputOverride larger than input", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() =>
            builder
            .cosignature("0x")
            .cosigner(constants.AddressZero)
            .decayStartBlock(212121)
            .input({
                token: INPUT_TOKEN,
                startAmount: INPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [1],
                    relativeAmounts: [BigNumber.from(0)],
                },
                maxAmount: INPUT_START_AMOUNT.add(1),
            })
            .output({
                token: OUTPUT_TOKEN,
                startAmount: OUTPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigNumber.from(4)],
                },
                recipient: constants.AddressZero,
            })
            .inputOverride(INPUT_START_AMOUNT.add(1))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(constants.AddressZero)
            .nonce(BigNumber.from(100))
            .build()
          ).toThrow("Invariant failed: inputOverride larger than original input");
    });

    it("Throw if outputOverride smaller than output", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() =>
            builder
            .cosignature("0x")
            .cosigner(constants.AddressZero)
            .decayStartBlock(212121)
            .input({
                token: INPUT_TOKEN,
                startAmount: INPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [1],
                    relativeAmounts: [BigNumber.from(0)],
                },
                maxAmount: INPUT_START_AMOUNT.add(1),
            })
            .output({
                token: OUTPUT_TOKEN,
                startAmount: OUTPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigNumber.from(4)],
                },
                recipient: constants.AddressZero,
            })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT.sub(2121)])
            .deadline(deadline)
            .swapper(constants.AddressZero)
            .nonce(BigNumber.from(100))
            .build()
          ).toThrow("Invariant failed: outputOverride smaller than original output");
    });

    //TODO: double check that we don't enforce endamount < startamount

    it("Throw if deadline already passed", () => {
        const deadline = 2121;
        expect(() =>
            builder
            .cosignature("0x")
            .cosigner(constants.AddressZero)
            .decayStartBlock(212121)
            .input({
                token: INPUT_TOKEN,
                startAmount: INPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [1],
                    relativeAmounts: [BigNumber.from(0)],
                },
                maxAmount: INPUT_START_AMOUNT.add(1),
            })
            .output({
                token: OUTPUT_TOKEN,
                startAmount: OUTPUT_START_AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigNumber.from(4)],
                },
                recipient: constants.AddressZero,
            })
            .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
            .outputOverrides([OUTPUT_START_AMOUNT])
            .deadline(deadline)
            .swapper(constants.AddressZero)
            .nonce(BigNumber.from(100))
            .build()
        ).toThrow("Invariant failed: Deadline must be in the future: 2121");
    });

    it("Does not throw before an order has not been finished building", () => {
        const deadline = Math.floor(Date.now() / 1000) + 1000;
        expect(() =>
          builder.deadline(deadline).decayStartBlock(21212121212121)
        ).not.toThrowError();
      });

    it("Unknown chainId", () => {
        const chainId = 99999999;
        expect(() => new V3DutchOrderBuilder(chainId)).toThrow(
            `Missing configuration for reactor: ${chainId}`
        );
    });
    
    describe("Partial order tests", () => {
        it("Test valid order with buildPartial", () => {
            const order = builder
                .cosigner(constants.AddressZero)
                .input({
                    token: INPUT_TOKEN,
                    startAmount: INPUT_START_AMOUNT,
                    curve: {
                        relativeBlocks: [1],
                        relativeAmounts: [BigNumber.from(0)],
                    },
                    maxAmount: INPUT_START_AMOUNT.add(1),
                })
                .output({
                    token: OUTPUT_TOKEN,
                    startAmount: OUTPUT_START_AMOUNT,
                    curve: {
                        relativeBlocks: [4],
                        relativeAmounts: [BigNumber.from(4)],
                    },
                    recipient: constants.AddressZero,
                })
                .swapper(constants.AddressZero)
                .nonce(BigNumber.from(100))
                .deadline(Math.floor(Date.now() / 1000) + 1000)
                .buildPartial();
            expect(order.info.outputs.length).toEqual(1);
            expect(order.chainId).toBeDefined();
            expect(order.info.reactor).toBeDefined();
        });
    
        it("Test invalid order with buildPartial", () => {
            expect(() =>
                builder
                .cosigner(constants.AddressZero)
                .input({
                    token: INPUT_TOKEN,
                    startAmount: INPUT_START_AMOUNT,
                    curve: {
                        relativeBlocks: [1],
                        relativeAmounts: [BigNumber.from(0)],
                    },
                    maxAmount: INPUT_START_AMOUNT.add(1),
                })
                .output({
                    token: OUTPUT_TOKEN,
                    startAmount: OUTPUT_START_AMOUNT,
                    curve: {
                        relativeBlocks: [4],
                        relativeAmounts: [BigNumber.from(4)],
                    },
                    recipient: constants.AddressZero,
                })
                // omitting swapper
                .deadline(Math.floor(Date.now() / 1000) + 1000)
                .nonce(BigNumber.from(100))
                .buildPartial()
            ).toThrow("Invariant failed: swapper not set");
        });
    });

    describe("fromOrder", () => {
        let builder: V3DutchOrderBuilder;

        beforeEach(() => {
            builder = new V3DutchOrderBuilder(1, constants.AddressZero);
        });

        it("should create a V3DutchOrderBuilder from an UnsignedV3DutchOrder", () => {
            const order: UnsignedV3DutchOrder = builder
                    .cosigner(constants.AddressZero)
                    .input({
                        token: INPUT_TOKEN,
                        startAmount: INPUT_START_AMOUNT,
                        curve: {
                            relativeBlocks: [1],
                            relativeAmounts: [BigNumber.from(0)],
                        },
                        maxAmount: INPUT_START_AMOUNT.add(1),
                    })
                    .output({
                        token: OUTPUT_TOKEN,
                        startAmount: OUTPUT_START_AMOUNT,
                        curve: {
                            relativeBlocks: [4],
                            relativeAmounts: [BigNumber.from(4)],
                        },
                        recipient: constants.AddressZero,
                    })
                    .swapper(constants.AddressZero)
                    .nonce(BigNumber.from(100))
                    .deadline(Math.floor(Date.now() / 1000) + 1000)
                    .buildPartial();
                
            const created_builder = V3DutchOrderBuilder.fromOrder(order);
            const created_order = created_builder.buildPartial();

            expect(created_order.chainId).toEqual(1);
            expect(created_order.info.input.token).toEqual(INPUT_TOKEN);
            expect(created_order.info.outputs.length).toEqual(1);
        });

        it("should create a V3DutchOrderBuilder from a CosignedV3DutchOrder", () => {
            const deadline = Date.now() + 1000;
            const order: CosignedV3DutchOrder = builder
                .cosigner(constants.AddressZero)
                .cosignature("0x")
                .decayStartBlock(212121)
                .input({
                    token: INPUT_TOKEN,
                    startAmount: INPUT_START_AMOUNT,
                    curve: {
                        relativeBlocks: [1],
                        relativeAmounts: [BigNumber.from(0)],
                    },
                    maxAmount: INPUT_START_AMOUNT.add(1),
                })
                .output({
                    token: OUTPUT_TOKEN,
                    startAmount: OUTPUT_START_AMOUNT,
                    curve: {
                        relativeBlocks: [4],
                        relativeAmounts: [BigNumber.from(4)],
                    },
                    recipient: constants.AddressZero,
                })
                .inputOverride(INPUT_START_AMOUNT.mul(99).div(100))
                .outputOverrides([OUTPUT_START_AMOUNT])
                .deadline(deadline)
                .swapper(constants.AddressZero)
                .nonce(BigNumber.from(100))
                .build();
            const created_builder = V3DutchOrderBuilder.fromOrder(order);
            const created_order = created_builder.build();
            expect(created_order.chainId).toEqual(1);
            expect(created_order.info.input.token).toEqual(INPUT_TOKEN);
            expect(created_order.info.outputs.length).toEqual(1);
            expect(created_order.info.cosignerData.decayStartBlock).toEqual(212121);
        });
    });
});