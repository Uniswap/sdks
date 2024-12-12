import { BigNumber, Signer, Wallet } from "ethers";
import hre, { ethers } from "hardhat";
import Permit2Abi from "../../abis/Permit2.json"
import V3DutchOrderReactorAbi from "../../abis/V3DutchOrderReactor.json"
import MockERC20Abi from "../../abis/MockERC20.json"
import { Permit2, V3DutchOrderReactor } from "../../src/contracts"
import { MockERC20 } from "../../src/contracts";
import { BlockchainTime } from "./utils/time";
import { V3DutchOrderBuilder } from "../../src/builder/V3DutchOrderBuilder"
import { expect } from "chai";
import { UnsignedV3DutchOrder, V3CosignerData } from "../../src/order/V3DutchOrder";

describe("DutchV3Order", () => {
    const FEE_RECIPIENT = "0x1111111111111111111111111111111111111111";
    const AMOUNT = BigNumber.from(10).pow(18);
    const SMALL_AMOUNT = BigNumber.from(10).pow(10);
    let NONCE = BigNumber.from(100);
    let futureDeadline : number;
    let bot : Signer;
    let admin: Signer;
    let filler: Signer;
    let permit2 : Permit2;
    let reactor : V3DutchOrderReactor;
    const chainId = hre.network.config.chainId || 42161;
    let swapper: Wallet;
    let cosigner: Wallet;
    let tokenIn: MockERC20;
    let tokenOut: MockERC20;
    let swapperAddress: string;
    let fillerAddress: string;
    let cosignerAddress : string;
    let botAddress : string;
    let validPartialOrder : UnsignedV3DutchOrder;
    
    before(async () => {
        futureDeadline = await new BlockchainTime().secondsFromNow(1000);
        [ admin, filler, bot ] = await ethers.getSigners();
        const permit2Factory = await ethers.getContractFactory(
            Permit2Abi.abi,
            Permit2Abi.bytecode
        );
        permit2 = (await permit2Factory.deploy()) as Permit2;

        const reactorFactory = await ethers.getContractFactory(
            V3DutchOrderReactorAbi.abi,
            V3DutchOrderReactorAbi.bytecode
        );
        reactor = (await reactorFactory.deploy(
            permit2.address,
            ethers.constants.AddressZero
        )) as V3DutchOrderReactor;

        swapper = ethers.Wallet.createRandom().connect(ethers.provider);
        cosigner = ethers.Wallet.createRandom().connect(ethers.provider);
        swapperAddress = await swapper.getAddress();
        cosignerAddress = await cosigner.getAddress();
        fillerAddress = await filler.getAddress();
        botAddress = await bot.getAddress();
        const tx = await admin.sendTransaction({
            to: swapperAddress,
            value: AMOUNT.mul(10),
        });
        const tx1 = await bot.sendTransaction({
            to: fillerAddress,
            value: AMOUNT,
        });

        const tokenFactory = await ethers.getContractFactory(
            MockERC20Abi.abi,
            MockERC20Abi.bytecode
        );

        tokenIn = (await tokenFactory.deploy("Token A", "A", 18)) as MockERC20;
        tokenOut = (await tokenFactory.deploy("Token B", "B", 18)) as MockERC20;

        await tokenIn.mint(
            swapperAddress,
            AMOUNT,
        );
        await tokenIn
            .connect(swapper)
            .approve(permit2.address, ethers.constants.MaxUint256);

        await tokenOut.mint(
            fillerAddress,
            AMOUNT,
        );
        await tokenOut.mint(
            botAddress,
            AMOUNT,
        )
        await tokenOut
            .connect(filler)
            .approve(reactor.address, ethers.constants.MaxUint256);
        await tokenOut
            .connect(bot)
            .approve(reactor.address, ethers.constants.MaxUint256);

        validPartialOrder = new V3DutchOrderBuilder(
            chainId,
            reactor.address,
            permit2.address
        )
            .cosigner(cosignerAddress)
            .deadline(futureDeadline)
            .startingBaseFee(BigNumber.from(0))
            .input({
                token: tokenIn.address,
                startAmount: AMOUNT,
                curve: {
                    relativeBlocks: [],
                    relativeAmounts: [],
                },
                maxAmount: AMOUNT,
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            .output({
                token: tokenOut.address,
                startAmount: AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigInt(4)],
                },
                recipient: swapperAddress,
                minAmount: AMOUNT.sub(4),
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            .swapper(swapperAddress)
            .nonce(NONCE)
            .buildPartial();
    });

    afterEach(() => {
        NONCE = NONCE.add(1);
    });
    
    it("Partial V3 Order", async () => {
        const preBuildOrder = validPartialOrder;
        expect(preBuildOrder.info.deadline).to.eq(futureDeadline);

        expect(preBuildOrder.info.swapper).to.eq(swapperAddress);
        expect(preBuildOrder.info.cosigner).to.eq(cosignerAddress);
        expect(preBuildOrder.info.nonce.toNumber()).to.eq(100);

        expect(preBuildOrder.info.input.token).to.eq(tokenIn.address);
        expect(preBuildOrder.info.input.startAmount).to.eq(AMOUNT);

        const builtOutput = preBuildOrder.info.outputs[0];

        expect(builtOutput.token).to.eq(tokenOut.address);
        expect(builtOutput.startAmount).to.eq(AMOUNT);
    });

    it("Cosigned V3 Order", async () => {
        const deadline = await new BlockchainTime().secondsFromNow(1000);
        const orderbuilder = new V3DutchOrderBuilder(
            chainId,
            reactor.address,
            permit2.address
        )
            .startingBaseFee(BigNumber.from(0))
            .cosigner(cosignerAddress)
            .deadline(deadline)
            .swapper(swapperAddress)
            .nonce(NONCE)
            .input({
                token: tokenIn.address,
                startAmount: AMOUNT,
                curve: {
                    relativeBlocks: [],
                    relativeAmounts: [],
                },
                maxAmount: AMOUNT,
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            .output({
                token: tokenOut.address,
                startAmount: AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigInt(4)],
                },
                recipient: swapperAddress,
                minAmount: AMOUNT.sub(4),
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            const partialOrder = orderbuilder.buildPartial();
            const cosignerData = await getCosignerData();
            const cosignature = await cosigner.signMessage(
                partialOrder.cosignatureHash(cosignerData)
            );
            const cosignedOrder = orderbuilder
                .cosignature(cosignature)
                .cosignerData(cosignerData)
                .build();

            expect(cosignedOrder.info.deadline).to.eq(deadline);
            expect(cosignedOrder.info.swapper).to.eq(swapperAddress);
            expect(cosignedOrder.info.cosigner).to.eq(cosignerAddress);
            expect(cosignedOrder.info.cosignature).to.eq(cosignature);
            expect(cosignedOrder.info.nonce.toNumber()).to.eq(NONCE);

            expect(cosignedOrder.info.input.token).to.eq(tokenIn.address);
            expect(cosignedOrder.info.input.startAmount).to.eq(AMOUNT);
            const builtOutput = cosignedOrder.info.outputs[0];

            expect(builtOutput.token).to.eq(tokenOut.address);
            expect(builtOutput.startAmount).to.eq(AMOUNT);
            expect(builtOutput.recipient).to.eq(swapperAddress);
    });

    it("reverts if cosignature is invalid", async () => {
        const order = validPartialOrder;
        const { domain, types, values } = order.permitData();
        const signature = await swapper._signTypedData(domain, types, values);
        const cosignerData = await getCosignerData();
        const cosignerHash = order.cosignatureHash(cosignerData);
        let cosignature = ethers.utils.joinSignature(
          cosigner._signingKey().signDigest(cosignerHash)
        );
        const fullOrder = V3DutchOrderBuilder.fromOrder(order)
        //use the cosignature of the other one that doesn't match this sub(1) order
          .cosignerData({ ...cosignerData, inputOverride: AMOUNT.sub(1) })
          .cosignature(cosignature) 
          .build();
        
        await expect(
            reactor
                .connect(filler)
                .execute({ order: fullOrder.serialize(), sig: signature })
        ).to.be.revertedWithCustomError(reactor, "InvalidCosignature");
    }); 

    it("executes a serialized order with no decay", async () => {
        const deadline = await new BlockchainTime().secondsFromNow(1000);
        const cosignerData = await getCosignerData();
        const order = new V3DutchOrderBuilder(
            chainId,
            reactor.address,
            permit2.address
        )
            .cosigner(cosigner.address)
            .deadline(deadline)
            .swapper(swapper.address)
            .nonce(NONCE)
            .startingBaseFee(BigNumber.from(0))
            .input({
                token: tokenIn.address,
                startAmount: SMALL_AMOUNT,
                curve: {
                    relativeBlocks: [],
                    relativeAmounts: [],
                },
                maxAmount: SMALL_AMOUNT,
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            .output({
                token: tokenOut.address,
                startAmount: SMALL_AMOUNT,
                curve: {
                    relativeBlocks: [],
                    relativeAmounts: [],
                },
                recipient: swapperAddress,
                minAmount: SMALL_AMOUNT,
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            .buildPartial()

        const { domain, types, values } = order.permitData();
        const signature = await swapper._signTypedData(domain, types, values);

        const cosignerHash = order.cosignatureHash(cosignerData);
        const cosignature = ethers.utils.joinSignature(
            cosigner._signingKey().signDigest(cosignerHash)
        );

        const fullOrder = V3DutchOrderBuilder.fromOrder(order)
            .cosignerData(cosignerData)
            .cosignature(cosignature)
            .build();

        const swapperTokenInBalanceBefore = await tokenIn.balanceOf(swapperAddress);
        const fillerTokenInBalanceBefore = await tokenIn.balanceOf(fillerAddress);
        const swapperTokenOutBalanceBefore = await tokenOut.balanceOf(swapperAddress);
        const fillerTokenOutBalanceBefore = await tokenOut.balanceOf(fillerAddress);

        const res = await reactor
            .connect(filler)
            .execute(
                { 
                    order: fullOrder.serialize(), 
                    sig: signature
                }
            );
        const receipt = await res.wait();
        expect(receipt.status).to.equal(1);
        expect((await tokenIn.balanceOf(swapperAddress)).toString()).to.equal(
            swapperTokenInBalanceBefore.sub(SMALL_AMOUNT).toString()
        );
        expect((await tokenIn.balanceOf(fillerAddress)).toString()).to.equal(
            fillerTokenInBalanceBefore.add(SMALL_AMOUNT).toString()
        );
        //We can take the startAmount because this happens before the decay begins
        const amountOut = order.info.outputs[0].startAmount;
        expect((await tokenOut.balanceOf(swapperAddress)).toString()).to.equal(
            swapperTokenOutBalanceBefore.add(amountOut)
        );
        expect((await tokenOut.balanceOf(fillerAddress)).toString()).to.equal(
            fillerTokenOutBalanceBefore.sub(amountOut)
        );
    });

    it("executes a serialized order with no decay, override of double original output amount", async () => {
        const deadline = await new BlockchainTime().secondsFromNow(1000);
        const order = new V3DutchOrderBuilder(
            chainId,
            reactor.address,
            permit2.address
        )
            .cosigner(cosigner.address)
            .deadline(deadline)
            .swapper(swapper.address)
            .nonce(NONCE)
            .startingBaseFee(BigNumber.from(0))
            .input({
                token: tokenIn.address,
                startAmount: SMALL_AMOUNT,
                curve: {
                    relativeBlocks: [],
                    relativeAmounts: [],
                },
                maxAmount: SMALL_AMOUNT,
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            .output({
                token: tokenOut.address,
                startAmount: SMALL_AMOUNT,
                curve: {
                    relativeBlocks: [],
                    relativeAmounts: [],
                },
                recipient: swapperAddress,
                minAmount: SMALL_AMOUNT,
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            .buildPartial()

        const { domain, types, values } = order.permitData();
        const signature = await swapper._signTypedData(domain, types, values);
        const cosignerData = await getCosignerData({
            outputOverrides: [SMALL_AMOUNT.mul(2)],
        });

        const cosignerHash = order.cosignatureHash(cosignerData);
        const cosignature = ethers.utils.joinSignature(
            cosigner._signingKey().signDigest(cosignerHash)
        );

        const fullOrder = V3DutchOrderBuilder.fromOrder(order)
            .cosignerData(cosignerData)
            .cosignature(cosignature)
            .build();

        const swapperTokenInBalanceBefore = await tokenIn.balanceOf(swapperAddress);
        const fillerTokenInBalanceBefore = await tokenIn.balanceOf(fillerAddress);
        const swapperTokenOutBalanceBefore = await tokenOut.balanceOf(swapperAddress);
        const fillerTokenOutBalanceBefore = await tokenOut.balanceOf(fillerAddress);

        const res = await reactor
            .connect(filler)
            .execute(
                { 
                    order: fullOrder.serialize(), 
                    sig: signature
                }
            );
        const receipt = await res.wait();
        expect(receipt.status).to.equal(1);
        expect((await tokenIn.balanceOf(swapperAddress)).toString()).to.equal(
            swapperTokenInBalanceBefore.sub(SMALL_AMOUNT).toString()
        );
        expect((await tokenIn.balanceOf(fillerAddress)).toString()).to.equal(
            fillerTokenInBalanceBefore.add(SMALL_AMOUNT).toString()
        );

        const amountOut = SMALL_AMOUNT.mul(2);
        expect((await tokenOut.balanceOf(swapperAddress)).toString()).to.equal(
            swapperTokenOutBalanceBefore.add(amountOut)
        );
        expect((await tokenOut.balanceOf(fillerAddress)).toString()).to.equal(
            fillerTokenOutBalanceBefore.sub(amountOut)
        );
    });

    it("executes a serialized order with no decay, override of half original input amount", async () => {
        const deadline = await new BlockchainTime().secondsFromNow(1000);
        const order = new V3DutchOrderBuilder(
            chainId,
            reactor.address,
            permit2.address
        )
            .cosigner(cosigner.address)
            .deadline(deadline)
            .swapper(swapper.address)
            .nonce(NONCE)
            .startingBaseFee(BigNumber.from(0))
            .input({
                token: tokenIn.address,
                startAmount: SMALL_AMOUNT,
                curve: {
                    relativeBlocks: [],
                    relativeAmounts: [],
                },
                maxAmount: SMALL_AMOUNT,
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            .output({
                token: tokenOut.address,
                startAmount: SMALL_AMOUNT,
                curve: {
                    relativeBlocks: [],
                    relativeAmounts: [],
                },
                recipient: swapperAddress,
                minAmount: SMALL_AMOUNT,
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            .buildPartial()

        const { domain, types, values } = order.permitData();
        const signature = await swapper._signTypedData(domain, types, values);
        const cosignerData = await getCosignerData({
            inputOverride: SMALL_AMOUNT.div(2)
        });

        const cosignerHash = order.cosignatureHash(cosignerData);
        const cosignature = ethers.utils.joinSignature(
            cosigner._signingKey().signDigest(cosignerHash)
        );

        const fullOrder = V3DutchOrderBuilder.fromOrder(order)
            .cosignerData(cosignerData)
            .cosignature(cosignature)
            .build();

        const swapperTokenInBalanceBefore = await tokenIn.balanceOf(swapperAddress);
        const fillerTokenInBalanceBefore = await tokenIn.balanceOf(fillerAddress);
        const swapperTokenOutBalanceBefore = await tokenOut.balanceOf(swapperAddress);
        const fillerTokenOutBalanceBefore = await tokenOut.balanceOf(fillerAddress);

        const res = await reactor
            .connect(filler)
            .execute(
                { 
                    order: fullOrder.serialize(), 
                    sig: signature
                }
            );
        const receipt = await res.wait();
        expect(receipt.status).to.equal(1);

        const amountIn = SMALL_AMOUNT.div(2);
        expect((await tokenIn.balanceOf(swapperAddress)).toString()).to.equal(
            swapperTokenInBalanceBefore.sub(amountIn).toString()
        );
        expect((await tokenIn.balanceOf(fillerAddress)).toString()).to.equal(
            fillerTokenInBalanceBefore.add(amountIn).toString()
        );

        expect((await tokenOut.balanceOf(swapperAddress)).toString()).to.equal(
            swapperTokenOutBalanceBefore.add(SMALL_AMOUNT)
        );
        expect((await tokenOut.balanceOf(fillerAddress)).toString()).to.equal(
            fillerTokenOutBalanceBefore.sub(SMALL_AMOUNT)
        );
    });

    it("executes a serialized order with decay", async () => {
        const deadline = await new BlockchainTime().secondsFromNow(1000);
        const order = new V3DutchOrderBuilder(
            chainId,
            reactor.address,
            permit2.address
        )
            .cosigner(cosigner.address)
            .deadline(deadline)
            .swapper(swapper.address)
            .nonce(NONCE)
            .startingBaseFee(BigNumber.from(0))
            .input({
                token: tokenIn.address,
                startAmount: SMALL_AMOUNT,
                curve: {
                    relativeBlocks: [],
                    relativeAmounts: [],
                },
                maxAmount: SMALL_AMOUNT,
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            .output({
                token: tokenOut.address,
                startAmount: SMALL_AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigInt(4)],
                },
                recipient: swapperAddress,
                minAmount: SMALL_AMOUNT.sub(4),
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            .buildPartial()

        const { domain, types, values } = order.permitData();
        const signature = await swapper._signTypedData(domain, types, values);
        const cosignerData = await getCosignerData({
            decayStartBlock: await new BlockchainTime().blocksFromNow(-1),
        });

        const cosignerHash = order.cosignatureHash(cosignerData);
        const cosignature = ethers.utils.joinSignature(
            cosigner._signingKey().signDigest(cosignerHash)
        );

        const fullOrder = V3DutchOrderBuilder.fromOrder(order)
            .cosignerData(cosignerData)
            .cosignature(cosignature)
            .build();

        const swapperTokenInBalanceBefore = await tokenIn.balanceOf(swapperAddress);
        const fillerTokenInBalanceBefore = await tokenIn.balanceOf(fillerAddress);
        const swapperTokenOutBalanceBefore = await tokenOut.balanceOf(swapperAddress);
        const fillerTokenOutBalanceBefore = await tokenOut.balanceOf(fillerAddress);
        const res = await reactor
            .connect(filler)
            .execute(
                { 
                    order: fullOrder.serialize(), 
                    sig: signature
                }
            );
        const receipt = await res.wait();
        expect(receipt.status).to.equal(1);

        // We can take the startAmount because we aren't decaying input
        const amountIn = fullOrder.info.input.startAmount;
        expect((await tokenIn.balanceOf(swapperAddress)).toString()).to.equal(
            swapperTokenInBalanceBefore.sub(amountIn).toString()
        );
        expect((await tokenIn.balanceOf(fillerAddress)).toString()).to.equal(
            fillerTokenInBalanceBefore.add(amountIn).toString()
        );

        const currentBlock = await ethers.provider.getBlockNumber();
        const decayAmount = currentBlock - cosignerData.decayStartBlock;
        // Decay with a curve of 4 over 4 blocks
        expect((await tokenOut.balanceOf(swapperAddress)).toString()).to.equal(
            swapperTokenOutBalanceBefore.add(SMALL_AMOUNT.sub(decayAmount))
        );
        expect((await tokenOut.balanceOf(fillerAddress)).toString()).to.equal(
            fillerTokenOutBalanceBefore.sub(SMALL_AMOUNT.sub(decayAmount))
        );
    });

    it("executes a serialized order with multi-point decay", async () => {
        const deadline = await new BlockchainTime().secondsFromNow(1000);
        const order = new V3DutchOrderBuilder(
            chainId,
            reactor.address,
            permit2.address
        )
            .cosigner(cosigner.address)
            .deadline(deadline)
            .swapper(swapper.address)
            .nonce(NONCE)
            .startingBaseFee(BigNumber.from(0))
            .input({
                token: tokenIn.address,
                startAmount: SMALL_AMOUNT,
                curve: {
                    relativeBlocks: [],
                    relativeAmounts: [],
                },
                maxAmount: SMALL_AMOUNT,
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            .output({
                token: tokenOut.address,
                startAmount: SMALL_AMOUNT,
                curve: {
                    relativeBlocks: [4, 8],
                    relativeAmounts: [BigInt(4), BigInt(24)],
                },
                recipient: swapperAddress,
                minAmount: SMALL_AMOUNT.sub(24),
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            .buildPartial()

        const { domain, types, values } = order.permitData();
        const signature = await swapper._signTypedData(domain, types, values);
        const cosignerData = await getCosignerData({
            // Construct this order at time t with a decayStartBlock of t-5
            decayStartBlock: await new BlockchainTime().blocksFromNow(-5),
        });
        const cosignerHash = order.cosignatureHash(cosignerData);
        const cosignature = ethers.utils.joinSignature(
            cosigner._signingKey().signDigest(cosignerHash)
        );

        const fullOrder = V3DutchOrderBuilder.fromOrder(order)
            .cosignerData(cosignerData)
            .cosignature(cosignature)
            .build();

        const swapperTokenInBalanceBefore = await tokenIn.balanceOf(swapperAddress);
        const fillerTokenInBalanceBefore = await tokenIn.balanceOf(fillerAddress);
        const swapperTokenOutBalanceBefore = await tokenOut.balanceOf(swapperAddress);
        const fillerTokenOutBalanceBefore = await tokenOut.balanceOf(fillerAddress);
        const res = await reactor
            .connect(filler)
            .execute(
                { 
                    order: fullOrder.serialize(), 
                    sig: signature
                }
            );
        const receipt = await res.wait();
        expect(receipt.status).to.equal(1);
        // This transaction should be at block t+1
        // So the relative block is t+1 - (t-5) = 6
        // The relative amount decayed is 4 + 2(5) = 14
        const decayAmount = 14;

        // We can take the startAmount because we aren't decaying input
        const amountIn = fullOrder.info.input.startAmount;
        expect((await tokenIn.balanceOf(swapperAddress)).toString()).to.equal(
            swapperTokenInBalanceBefore.sub(amountIn).toString()
        );
        expect((await tokenIn.balanceOf(fillerAddress)).toString()).to.equal(
            fillerTokenInBalanceBefore.add(amountIn).toString()
        );

        expect((await tokenOut.balanceOf(swapperAddress)).toString()).to.equal(
            swapperTokenOutBalanceBefore.add(SMALL_AMOUNT.sub(decayAmount))
        );
        expect((await tokenOut.balanceOf(fillerAddress)).toString()).to.equal(
            fillerTokenOutBalanceBefore.sub(SMALL_AMOUNT.sub(decayAmount))
        );
    });

    it("open filler executes an open order past exclusivity", async () => {
        const deadline = await new BlockchainTime().secondsFromNow(1000);
        const order = new V3DutchOrderBuilder(
            chainId,
            reactor.address,
            permit2.address
        )
            .cosigner(cosigner.address)
            .deadline(deadline)
            .swapper(swapper.address)
            .nonce(NONCE)
            .startingBaseFee(BigNumber.from(0))
            .input({
                token: tokenIn.address,
                startAmount: SMALL_AMOUNT,
                curve: {
                    relativeBlocks: [],
                    relativeAmounts: [],
                },
                maxAmount: SMALL_AMOUNT,
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            .output({
                token: tokenOut.address,
                startAmount: SMALL_AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigInt(4)],
                },
                recipient: swapperAddress,
                minAmount: SMALL_AMOUNT.sub(4),
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            .buildPartial()

        const { domain, types, values } = order.permitData();
        const signature = await swapper._signTypedData(domain, types, values);
        const cosignerData = await getCosignerData({
            decayStartBlock: await new BlockchainTime().blocksFromNow(0),
            exclusiveFiller: fillerAddress,
        });

        const cosignerHash = order.cosignatureHash(cosignerData);
        const cosignature = ethers.utils.joinSignature(
            cosigner._signingKey().signDigest(cosignerHash)
        );

        const fullOrder = V3DutchOrderBuilder.fromOrder(order)
            .cosignerData(cosignerData)
            .cosignature(cosignature)
            .build();

        const swapperTokenInBalanceBefore = await tokenIn.balanceOf(
            swapperAddress
            );
        const fillerTokenInBalanceBefore = await tokenIn.balanceOf(fillerAddress);
        const botTokenInBalanceBefore = await tokenIn.balanceOf(
            botAddress
        );
        const swapperTokenOutBalanceBefore = await tokenOut.balanceOf(
            swapperAddress
        );
        const fillerTokenOutBalanceBefore = await tokenOut.balanceOf(
            fillerAddress
        );
        const botTokenOutBalanceBefore = await tokenOut.balanceOf(
            botAddress
        );

        const res = await reactor
            .connect(bot)
            .execute(
                { 
                    order: fullOrder.serialize(), 
                    sig: signature
                }
            );
        const receipt = await res.wait();
        expect(receipt.status).to.equal(1);

        // We can take the startAmount because we aren't decaying input
        const amountIn = fullOrder.info.input.startAmount;
        expect((await tokenIn.balanceOf(swapperAddress)).toString()).to.equal(
            swapperTokenInBalanceBefore.sub(amountIn).toString()
        );
        // Exclusive filler did not fill
        expect((await tokenIn.balanceOf(fillerAddress)).toString()).to.equal(
            fillerTokenInBalanceBefore.toString()
        );
        expect((await tokenOut.balanceOf(fillerAddress)).toString()).to.equal(
            fillerTokenOutBalanceBefore.toString()
        );
        // Bot (non-exclusive) filled
        expect((await tokenIn.balanceOf(botAddress)).toString()).to.equal(
            botTokenInBalanceBefore.add(amountIn).toString()
        );
        expect((await tokenOut.balanceOf(swapperAddress)).toString()).to.equal(
            swapperTokenOutBalanceBefore.add(SMALL_AMOUNT.sub(1)).toString()
        );
        expect((await tokenOut.balanceOf(botAddress)).toString()).to.equal(
            botTokenOutBalanceBefore.sub(SMALL_AMOUNT.sub(1)).toString()
        );
    });

    it("Open filler fails to execute order before exclusivity", async () => {
        const deadline = await new BlockchainTime().secondsFromNow(1000);
        const order = new V3DutchOrderBuilder(
            chainId,
            reactor.address,
            permit2.address
        )
            .cosigner(cosigner.address)
            .deadline(deadline)
            .swapper(swapper.address)
            .nonce(NONCE)
            .startingBaseFee(BigNumber.from(0))
            .input({
                token: tokenIn.address,
                startAmount: SMALL_AMOUNT,
                curve: {
                    relativeBlocks: [],
                    relativeAmounts: [],
                },
                maxAmount: SMALL_AMOUNT,
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            .output({
                token: tokenOut.address,
                startAmount: SMALL_AMOUNT,
                curve: {
                    relativeBlocks: [4],
                    relativeAmounts: [BigInt(4)],
                },
                recipient: swapperAddress,
                minAmount: SMALL_AMOUNT.sub(4),
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            .buildPartial()

        const { domain, types, values } = order.permitData();
        const signature = await swapper._signTypedData(domain, types, values);
        const cosignerData = await getCosignerData({
            decayStartBlock: await new BlockchainTime().blocksFromNow(5),
            exclusiveFiller: fillerAddress,
        });

        const cosignerHash = order.cosignatureHash(cosignerData);
        const cosignature = ethers.utils.joinSignature(
            cosigner._signingKey().signDigest(cosignerHash)
        );

        const fullOrder = V3DutchOrderBuilder.fromOrder(order)
            .cosignerData(cosignerData)
            .cosignature(cosignature)
            .build();

        await expect(
            reactor
                .connect(bot)
                .execute(
                    { 
                        order: fullOrder.serialize(), 
                        sig: signature
                    }
                )
        ).to.be.revertedWithCustomError(reactor, "NoExclusiveOverride");
    });
});

const getCosignerData = async (
    overrides: Partial<V3CosignerData> = {}
    ): Promise<V3CosignerData> => {
    const defaultData: V3CosignerData = {
        decayStartBlock: 29000000,
        exclusiveFiller: ethers.constants.AddressZero,
        exclusivityOverrideBps: BigNumber.from(0),
        // overrides of 0 will not affect the values
        inputOverride: BigNumber.from(0),
        outputOverrides: [BigNumber.from(0)],
    };
    return Object.assign(defaultData, overrides);
};
