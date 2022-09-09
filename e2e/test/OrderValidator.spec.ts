import hre, { ethers } from 'hardhat';
import { expect } from 'chai';

const { BigNumber } = ethers;

import DutchLimitOrderReactorAbi from '../../abis/DutchLimitOrderReactor.json';
import PermitPostAbi from '../../abis/PermitPost.json';
import OrderQuoterAbi from '../../abis/OrderQuoter.json';

import { OrderQuoter, PermitPost, DutchLimitOrderReactor } from '../../src/contracts';
import { DutchLimitOrderBuilder, DutchLimitOrder, OrderValidator, OrderValidation } from '../../';

describe('OrderValidator', () => {
    let reactor: DutchLimitOrderReactor;
    let permitPost: PermitPost;
    let quoter: OrderQuoter;
    let chainId: number;
    let builder: DutchLimitOrderBuilder;
    let wallet: ethers.Wallet;
    let validator: OrderValidator;

    before(async () => {
        const permitPostFactory = await ethers.getContractFactory(PermitPostAbi.abi, PermitPostAbi.bytecode);
        permitPost = await permitPostFactory.deploy() as PermitPost;

        const reactorFactory = await ethers.getContractFactory(DutchLimitOrderReactorAbi.abi, DutchLimitOrderReactorAbi.bytecode);
        reactor = await reactorFactory.deploy(permitPost.address) as DutchLimitOrderReactor;

        const orderQuoterFactory = await ethers.getContractFactory(OrderQuoterAbi.abi, OrderQuoterAbi.bytecode);
        quoter = await orderQuoterFactory.deploy() as OrderQuoter;
        chainId = hre.network.config.chainId || 1;
        builder = new DutchLimitOrderBuilder(chainId, reactor.address, permitPost.address);
        wallet = ethers.Wallet.createRandom();
        validator = new OrderValidator(ethers.provider, chainId, quoter.address);
    });

    it('validates a valid order', async () => {
        const deadline = Math.floor(new Date().getTime() / 1000) + 1000;
        const order = builder
        .deadline(deadline)
        .endTime(deadline)
        .startTime(deadline - 1000)
        .nonce(BigNumber.from(100))
        .input({
            token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            amount: BigNumber.from('1000000'),
        })
        .output({
            token: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
            startAmount: BigNumber.from('1000000000000000000'),
            endAmount: BigNumber.from('900000000000000000'),
            recipient: '0x0000000000000000000000000000000000000000',
        })
        .build();

        const { domain, types, values } = order.permitData();
        const signature = await wallet._signTypedData(domain, types, values);

        expect(await validator.validate(order, signature)).to.equal(OrderValidation.OK);
    });

    it('validates an expired order', async () => {
        const deadline = Math.floor(new Date().getTime() / 1000) + 1;
        const info = builder
        .deadline(deadline)
        .endTime(deadline)
        .startTime(deadline)
        .nonce(BigNumber.from(100))
        .input({
            token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            amount: BigNumber.from('1000000'),
        })
        .output({
            token: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
            startAmount: BigNumber.from('1000000000000000000'),
            endAmount: BigNumber.from('900000000000000000'),
            recipient: '0x0000000000000000000000000000000000000000',
        })
        .build().info;
        const order = new DutchLimitOrder(Object.assign(info, { deadline: deadline - 100, endTime: deadline - 100 }), chainId, permitPost.address);

        const { domain, types, values } = order.permitData();
        const signature = await wallet._signTypedData(domain, types, values);

        expect(await validator.validate(order, signature)).to.equal(OrderValidation.Expired);
    });

    it('validates an invalid dutch decay', async () => {
        const deadline = Math.floor(new Date().getTime() / 1000) + 1;
        const info = builder
        .deadline(deadline)
        .endTime(deadline)
        .startTime(deadline)
        .nonce(BigNumber.from(100))
        .input({
            token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            amount: BigNumber.from('1000000'),
        })
        .output({
            token: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
            startAmount: BigNumber.from('1000000000000000000'),
            endAmount: BigNumber.from('900000000000000000'),
            recipient: '0x0000000000000000000000000000000000000000',
        })
        .build().info;
        const order = new DutchLimitOrder(Object.assign(info, { endTime: deadline - 100 }), chainId, permitPost.address);

        const { domain, types, values } = order.permitData();
        const signature = await wallet._signTypedData(domain, types, values);

        expect(await validator.validate(order, signature)).to.equal(OrderValidation.InvalidOrderFields);
    });
});
