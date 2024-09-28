import { BigNumber, Signer, Wallet } from "ethers";
import hre, { ethers } from "hardhat";
import Permit2Abi from "../../abis/Permit2.json"
import V3DutchOrderReactorAbi from "../../abis/V3DutchOrderReactor.json"
import MockERC20Abi from "../../abis/MockERC20.json"
import { Permit2, V3DutchOrderReactor } from "../../src/contracts"
import { MockERC20 } from "../../dist/src/contracts";
import { BlockchainTime } from "./utils/time";
import { V3DutchOrderBuilder } from "../../src/builder/V3DutchOrderBuilder"
import { expect } from "chai";
import { UnsignedV3DutchOrder, V3_DUTCH_ORDER_TYPES, V3CosignerData } from "../../src/order/V3DutchOrder";

describe.only("DutchV3Order", () => {
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
        console.log("before funds");
        const tx = await admin.sendTransaction({
            to: swapperAddress,
            value: AMOUNT,
        });

        const tx1 = await bot.sendTransaction({
            to: fillerAddress,
            value: AMOUNT,
        });
        console.log("after funds");

        const tokenFactory = await ethers.getContractFactory(
            MockERC20Abi.abi,
            MockERC20Abi.bytecode
        );

        tokenIn = (await tokenFactory.deploy("Token A", "A", 18)) as MockERC20;
        tokenOut = (await tokenFactory.deploy("Token B", "B", 18)) as MockERC20;
        console.log("after token deploys")
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
        await tokenOut
            .connect(filler)
            .approve(permit2.address, ethers.constants.MaxUint256);
        console.log("after mints and approves")
        
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
                    relativeBlocks: [1],
                    relativeAmounts: [BigInt(0)],
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
                    relativeBlocks: [1],
                    relativeAmounts: [BigInt(0)],
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

    it.only("debug cosignature", async () => {
        const deadline = 1800000000;
        const cosignerData : V3CosignerData = {
            decayStartBlock: 260000000,
            exclusiveFiller: ethers.constants.AddressZero,
            exclusivityOverrideBps: BigNumber.from(0),
            inputOverride: BigNumber.from(0),
            outputOverrides: [BigNumber.from(0)],
        }

        const order = new V3DutchOrderBuilder(
            1, ethers.constants.AddressZero//chainId doesn't get hashed so doesn't matter
        )
            .cosigner(ethers.constants.AddressZero)
            .deadline(deadline)
            .swapper(ethers.constants.AddressZero)
            .nonce(BigNumber.from(0))
            .startingBaseFee(BigNumber.from(0))
            .input({
                token: "0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f",
                startAmount: BigNumber.from(21),
                curve: {
                    relativeBlocks: [1],
                    relativeAmounts: [BigInt(0)],
                },
                maxAmount: BigNumber.from(21),
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            .output({
                token: ethers.constants.AddressZero,
                startAmount: BigNumber.from(21),
                curve: {
                    relativeBlocks: [1],
                    relativeAmounts: [BigInt(1)],
                },
                recipient: ethers.constants.AddressZero,
                minAmount: BigNumber.from(20),
                adjustmentPerGweiBaseFee: BigNumber.from(0),
            })
            .buildPartial()

            const { domain, types, values } = order.permitData();
            const signature = await swapper._signTypedData(domain, types, values);

            // const { domain, types, values } = order.permitData();
            // const signature = await swapper._signTypedData(domain, types, values);
            const encoder = ethers.utils._TypedDataEncoder.from(V3_DUTCH_ORDER_TYPES);
            const hashOfTypes = ethers.utils.keccak256(
                ethers.utils.toUtf8Bytes(encoder.encodeType("V3DutchOrder"))
            );
            console.log("the hash of the types is: ", hashOfTypes);
            const orderHash = order.hash();
            console.log("the orderHash is: ", orderHash);
            const cosignerHash = order.cosignatureHash(cosignerData);
            console.log("the cosignerHash is: ", cosignerHash);
            // const cosignature = ethers.utils.joinSignature(
            //   cosigner._signingKey().signDigest(cosignerHash)
            // );
            const cosignature = "0x"; //emptyBytes
            // console.log("the cosigner that signed the cosignerHash is: ", await cosigner.getAddress());
            const fullOrder = V3DutchOrderBuilder.fromOrder(order)
            .cosignerData(cosignerData)
            .cosignature(cosignature)
            .build();

        console.log("Order Info:");
        console.log("  Reactor:", fullOrder.info.reactor);
        console.log("  Swapper:", fullOrder.info.swapper);
        console.log("  Nonce:", fullOrder.info.nonce);
        console.log("  deadline:", fullOrder.info.deadline);
        console.log("  additionalValidationContract:", fullOrder.info.additionalValidationContract);
        console.log("  additionalValidationData:", fullOrder.info.additionalValidationData);


        console.log("Base Input:");
        console.log("  Token:", fullOrder.info.input.token);
        console.log("  Start Amount:", fullOrder.info.input.startAmount);
        console.log("  Curve, RelativeBlocks:", fullOrder.info.input.curve.relativeBlocks);
        for (let i = 0; i < fullOrder.info.input.curve.relativeAmounts.length; i++) {
            console.log("  Curve, RelativeAmounts:", fullOrder.info.input.curve.relativeAmounts[i]);
        }
        console.log("  Max Amount:", fullOrder.info.input.maxAmount);
        console.log("  adjustmentPerGweiBaseFee:", fullOrder.info.input.adjustmentPerGweiBaseFee);

        console.log("Base Outputs:");
        for (let i = 0; i < fullOrder.info.outputs.length; i++) {
            console.log("  Output", i);
            console.log("    Token:", fullOrder.info.outputs[i].token);
            console.log("    Start Amount:", fullOrder.info.outputs[i].startAmount);
            console.log("  Curve, RelativeBlocks:", fullOrder.info.outputs[i].curve.relativeBlocks);
            for (let j = 0; j < fullOrder.info.outputs[i].curve.relativeAmounts.length; j++) {
                console.log("  Curve, RelativeAmounts:", fullOrder.info.outputs[i].curve.relativeAmounts[j]);
            }
            console.log("    Recipient:", fullOrder.info.outputs[i].recipient);
            console.log("    minAmount:", fullOrder.info.outputs[i].minAmount);
            console.log("    adjustmentPerGweiBaseFee:", fullOrder.info.outputs[i].adjustmentPerGweiBaseFee);
        }

        console.log("Cosigner Data:");
        console.log("  decayStartBlock:", fullOrder.info.cosignerData.decayStartBlock);
        console.log("  exclusiveFiller:", fullOrder.info.cosignerData.exclusiveFiller);
        console.log("  exclusivityOverrideBps:", fullOrder.info.cosignerData.exclusivityOverrideBps);
        console.log("  inputOverride:", fullOrder.info.cosignerData.inputOverride);
        for (let i = 0; i < fullOrder.info.cosignerData.outputOverrides.length; i++) {
            console.log("  outputOverrides:", fullOrder.info.cosignerData.outputOverrides[i]);
        }
            console.log("The encoded order is: ", fullOrder.serialize());
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
                    relativeBlocks: [1],
                    relativeAmounts: [BigInt(0)],
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

            // const { domain, types, values } = order.permitData();
            // const signature = await swapper._signTypedData(domain, types, values);
            const cosignerHash = order.cosignatureHash(cosignerData);
            const cosignature = ethers.utils.joinSignature(
              cosigner._signingKey().signDigest(cosignerHash)
            );
            console.log("the cosigner that signed the cosignerHash is: ", await cosigner.getAddress());

            console.log("the cosigner specified in the order is: ", order.info.cosigner);
            console.log("The hash that the cosigner is signing over is:", cosignerHash);

            console.log("the cosignature is:", cosignature);
            const fullOrder = V3DutchOrderBuilder.fromOrder(order)
                .cosignerData(cosignerData)
                .cosignature(cosignature)
                .build();
            //console.log(fullOrder);
            console.log("The hash that recoverCosigner uses in the fullOrder is: ", fullOrder.cosignatureHash(fullOrder.info.cosignerData));

            const test = fullOrder.recoverCosigner();
            console.log("the cosigner that we recovered from fullOrder is: ",test);
            // console.log(fullOrder.info.cosigner);
            // console.log(fullOrder);
            if(test == cosignerAddress){
                console.log("the recovered cosigner is the same as the one that signed");
            }



        // const order = validPartialOrder;
        // const { domain, types, values } = order.permitData();
        // const signature = await swapper._signTypedData(domain, types, values);
        // const cosignerData = await getCosignerData();
        // const cosignerHash = order.cosignatureHash(cosignerData);
        // const cosignature = ethers.utils.joinSignature(
        //   cosigner._signingKey().signDigest(cosignerHash)
        // );
        // const fullOrder = V3DutchOrderBuilder.fromOrder(order)
        //     .cosignerData(cosignerData)
        //     .cosignature(cosignature)
        //     .build();
        const swapperTokenInBalanceBefore = await tokenIn.balanceOf(swapperAddress);
        const fillerTokenInBalanceBefore = await tokenIn.balanceOf(fillerAddress);
        const swapperTokenOutBalanceBefore = await tokenOut.balanceOf(swapperAddress);
        const fillerTokenOutBalanceBefore = await tokenOut.balanceOf(fillerAddress);

        const res = await reactor
            .connect(filler)
            .execute({ order: fullOrder.serialize(), sig: signature });
        const receipt = await res.wait();

        // expect(receipt.status).to.equal(1);
        // expect((await tokenIn.balanceOf(swapperAddress)).toString()).to.equal(
        //     swapperTokenInBalanceBefore.sub(AMOUNT).toString()
        // );
        // expect((await tokenIn.balanceOf(fillerAddress)).toString()).to.equal(
        //     fillerTokenInBalanceBefore.add(AMOUNT).toString()
        // );
        // //We can take the startAmount because this happens before the decay begins
        // const amountOut = order.info.outputs[0].startAmount;
        // expect((await tokenOut.balanceOf(swapperAddress)).toString()).to.equal(
        //     swapperTokenOutBalanceBefore.add(amountOut)
        // );
        // expect((await tokenOut.balanceOf(fillerAddress)).toString()).to.equal(
        //     fillerTokenOutBalanceBefore.sub(amountOut)
        // );

    });

    const getCosignerData = async (
        overrides: Partial<V3CosignerData> = {}
        ): Promise<V3CosignerData> => {
        const defaultData: V3CosignerData = {
            decayStartBlock: 260000000,
            exclusiveFiller: ethers.constants.AddressZero,
            exclusivityOverrideBps: BigNumber.from(0),
            // overrides of 0 will not affect the values
            inputOverride: BigNumber.from(0),
            outputOverrides: [BigNumber.from(0)],
        };
        return Object.assign(defaultData, overrides);
        };
});