// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IUniversalRouter} from "universal-router/interfaces/IUniversalRouter.sol";
import {DeployRouter} from "./utils/DeployRouter.sol";
import {MockFeeOnTransferERC20} from "./utils/MockFeeOnTransferERC20.sol";

interface IUniswapV2FactoryLike {
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IUniswapV2PairLike {
    function mint(address to) external returns (uint256 liquidity);
}

/// @notice V2_SWAP_EXACT_OUT never checks the delivered output: with a fee-on-transfer input the
/// pair receives less than the computed amountIn and pays out less than amountOut, and paying the
/// recipient directly lets that succeed. Routing the leg through the router and appending
/// SWEEP(token, recipient, amountOut) -- the plan the SDK now emits -- turns it into a revert.
contract V2ExactOutputSettlementTest is Test, DeployRouter {
    uint256 constant V2_SWAP_EXACT_OUT = 0x09;
    uint256 constant SWEEP = 0x04;
    // ActionConstants.ADDRESS_THIS: the router substitutes itself as recipient
    address constant ROUTER_AS_RECIPIENT = address(2);
    uint256 constant FEE_BIPS = 1_000;
    uint256 constant AMOUNT_OUT = 1_000 * 1e6;

    MockFeeOnTransferERC20 fot;
    address[] path;

    function setUp() public {
        fromPrivateKey = 0x1234;
        from = vm.addr(fromPrivateKey);

        vm.createSelectFork(vm.envString("FORK_URL"), 16075500);
        deployV4Contracts();
        initializeV4Pools();
        vm.startPrank(from);
        deployRouter();
        vm.deal(from, 100 ether);

        fot = new MockFeeOnTransferERC20(FEE_BIPS);
        fot.mint(from, 10_000_000 ether);
        deal(address(USDC), from, 10_000_000 * ONE_USDC);

        address pair = IUniswapV2FactoryLike(V2_FACTORY).createPair(address(fot), address(USDC));
        fot.transfer(pair, 1_000_000 ether);
        USDC.transfer(pair, 1_000_000 * ONE_USDC);
        IUniswapV2PairLike(pair).mint(from);

        fot.approve(address(permit2), type(uint256).max);
        permit2.approve(address(fot), address(router), type(uint160).max, uint48(block.timestamp + 1000));

        path.push(address(fot));
        path.push(address(USDC));
    }

    function testV2ExactOutDirectRecipientWithFeeOnTransferInput() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(V2_SWAP_EXACT_OUT)));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(RECIPIENT, AMOUNT_OUT, type(uint256).max, path, true);

        uint256 before = USDC.balanceOf(RECIPIENT);
        router.execute(commands, inputs, block.timestamp + 1000);
        uint256 received = USDC.balanceOf(RECIPIENT) - before;

        assertGt(received, 0);
        assertLt(received, AMOUNT_OUT);
    }

    function testV2ExactOutCustodySweepEnforcesAmountOut() public {
        bytes memory commands = abi.encodePacked(bytes1(uint8(V2_SWAP_EXACT_OUT)), bytes1(uint8(SWEEP)));
        bytes[] memory inputs = new bytes[](2);
        inputs[0] = abi.encode(ROUTER_AS_RECIPIENT, AMOUNT_OUT, type(uint256).max, path, true);
        inputs[1] = abi.encode(address(USDC), RECIPIENT, AMOUNT_OUT);

        // SWEEP is dispatched inline, so Payments' error surfaces unwrapped rather than as ExecutionFailed
        vm.expectRevert(abi.encodeWithSignature("InsufficientToken()"));
        router.execute(commands, inputs, block.timestamp + 1000);
    }
}
