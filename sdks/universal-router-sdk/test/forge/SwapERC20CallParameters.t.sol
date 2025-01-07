// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, stdJson, console2} from "forge-std/Test.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {UniversalRouter} from "universal-router/UniversalRouter.sol";
import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";
import {DeployRouter} from "./utils/DeployRouter.sol";
import {MethodParameters, Interop} from "./utils/Interop.sol";
import {INonfungiblePositionManager} from "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";

contract SwapERC20CallParametersTest is Test, Interop, DeployRouter {
    using stdJson for string;

    // starting eth balance
    uint256 constant BALANCE = 10 ether;

    function setUp() public {
        fromPrivateKey = 0x1234;
        from = vm.addr(fromPrivateKey);
        string memory root = vm.projectRoot();
        json = vm.readFile(string.concat(root, "/test/forge/interop.json"));

        vm.createSelectFork(vm.envString("FORK_URL"), 16075500);
        deployV4Contracts();
        initializeV4Pools();
        vm.startPrank(from);
        deployRouter();
        vm.deal(from, BALANCE);
    }

    function testV2ExactInputSingleNative() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_1_ETH_FOR_USDC");

        assertEq(from.balance, BALANCE);
        assertEq(USDC.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertGt(USDC.balanceOf(RECIPIENT), 1000 * ONE_USDC);
    }

    function testV2ExactInputSingleNativeWithFee() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_1_ETH_FOR_USDC_WITH_FEE");

        assertEq(from.balance, BALANCE);
        assertEq(USDC.balanceOf(RECIPIENT), 0);
        assertEq(USDC.balanceOf(FEE_RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);

        uint256 recipientBalance = USDC.balanceOf(RECIPIENT);
        uint256 feeRecipientBalance = USDC.balanceOf(FEE_RECIPIENT);
        uint256 totalOut = recipientBalance + feeRecipientBalance;
        uint256 expectedFee = totalOut * 500 / 10000;
        assertEq(feeRecipientBalance, expectedFee);
        assertEq(recipientBalance, totalOut - expectedFee);
        assertGt(totalOut, 1000 * ONE_USDC);
    }

    function testV2ExactInputNative() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_1_ETH_FOR_USDC_2_HOP");

        assertEq(from.balance, BALANCE);
        assertEq(DAI.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertGt(DAI.balanceOf(RECIPIENT), 1000 * ONE_DAI);
        assertEq(WETH.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
    }

    function testV2ExactInputNativeWithFee() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_1_ETH_FOR_USDC_2_HOP_WITH_FEE");

        assertEq(from.balance, BALANCE);
        assertEq(DAI.balanceOf(RECIPIENT), 0);
        assertEq(DAI.balanceOf(FEE_RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);

        uint256 recipientBalance = DAI.balanceOf(RECIPIENT);
        uint256 feeRecipientBalance = DAI.balanceOf(FEE_RECIPIENT);
        uint256 totalOut = recipientBalance + feeRecipientBalance;
        uint256 expectedFee = totalOut * 500 / 10000;
        assertEq(feeRecipientBalance, expectedFee);
        assertEq(recipientBalance, totalOut - expectedFee);
        assertGt(totalOut, 1000 * ONE_USDC);

        // Nothing left in the router!
        assertEq(WETH.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
    }

    function testV2ExactInputSingleERC20ForETH() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_1000_USDC_FOR_ETH");

        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);
        permit2.approve(address(USDC), address(router), uint160(BALANCE), uint48(block.timestamp + 1000));

        assertEq(USDC.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(USDC.balanceOf(from), BALANCE - 1000 * ONE_USDC);
        assertGe(RECIPIENT.balance, startingRecipientBalance + 0.1 ether);
    }

    function testV2ExactInputSingleERC20ForETHWithWETHFee() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_1000_USDC_FOR_ETH_WITH_WETH_FEE");

        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);
        permit2.approve(address(USDC), address(router), uint160(BALANCE), uint48(block.timestamp + 1000));

        assertEq(USDC.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = RECIPIENT.balance;
        uint256 startingFeeRecipientBalance = FEE_RECIPIENT.balance;
        assertEq(WETH.balanceOf(FEE_RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(USDC.balanceOf(from), BALANCE - 1000 * ONE_USDC);

        uint256 recipientOutETH = RECIPIENT.balance - startingRecipientBalance;
        uint256 feeRecipientOutETH = FEE_RECIPIENT.balance - startingFeeRecipientBalance;
        uint256 feeRecipientOutWETH = WETH.balanceOf(FEE_RECIPIENT);

        uint256 totalOut = recipientOutETH + feeRecipientOutWETH;
        uint256 expectedFee = totalOut * 500 / 10000;

        // Recipient should get ETH, and fee recipient should get WETH (and no ETH)
        assertEq(feeRecipientOutWETH, expectedFee);
        assertEq(feeRecipientOutETH, 0);
        assertEq(recipientOutETH, totalOut - expectedFee);
        assertGt(totalOut, 0.1 ether);

        // Nothing left in the router!
        assertEq(WETH.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
    }

    function testV2ExactInputSingleERC20WithPermit() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_1000_USDC_FOR_ETH_PERMIT");

        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);

        assertEq(USDC.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(USDC.balanceOf(from), BALANCE - 1000 * ONE_USDC);
        assertGe(RECIPIENT.balance, startingRecipientBalance + 0.1 ether);
    }

    function testV2ExactInputSingleERC20With2098Permit() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_1000_USDC_FOR_ETH_2098_PERMIT");

        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);

        assertEq(USDC.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(USDC.balanceOf(from), BALANCE - 1000 * ONE_USDC);
        assertGe(RECIPIENT.balance, startingRecipientBalance + 0.1 ether);
    }

    function testV2ExactInputSingleERC20With2098PermitZeroRecoveryParam() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_1000_USDC_FOR_ETH_PERMIT_V_RECOVERY_PARAM");

        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);

        assertEq(USDC.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(USDC.balanceOf(from), BALANCE - 1000 * ONE_USDC);
        assertGe(RECIPIENT.balance, startingRecipientBalance + 0.1 ether);
    }

    function testV2ExactInputERC20() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_10_DAI_FOR_ETH_2_HOP");

        deal(address(DAI), from, BALANCE);
        DAI.approve(address(permit2), BALANCE);
        permit2.approve(address(DAI), address(router), uint160(BALANCE), uint48(block.timestamp + 1000));
        assertEq(DAI.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(DAI.balanceOf(from), BALANCE - 10 * ONE_DAI);
        assertGe(RECIPIENT.balance, startingRecipientBalance + 0.001 ether);
    }

    function testV2ExactOutputSingleNative() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_ETH_FOR_1000_USDC");

        assertEq(from.balance, BALANCE);
        assertEq(USDC.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertEq(USDC.balanceOf(RECIPIENT), 1000 * ONE_USDC);
        assertEq(WETH.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
    }

    function testV2ExactOutputSingleNativeWithFee() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_ETH_FOR_1000_USDC_WITH_FEE");

        uint256 outputAmount = 1000 * ONE_USDC;
        uint256 feeAmount = ((outputAmount * 10000) / 9500) - outputAmount;

        assertEq(from.balance, BALANCE);
        assertEq(USDC.balanceOf(RECIPIENT), 0);
        assertEq(USDC.balanceOf(FEE_RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertEq(USDC.balanceOf(RECIPIENT), outputAmount);
        assertEq(USDC.balanceOf(FEE_RECIPIENT), feeAmount);
        assertEq(WETH.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
    }

    function testV2ExactOutputSingleNativeInputWithFlatFee() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_ETH_FOR_1000_USDC_WITH_FLAT_FEE");

        uint256 outputAmount = 1000 * ONE_USDC;
        uint256 feeAmount = 50 * ONE_USDC;

        assertEq(from.balance, BALANCE);
        assertEq(USDC.balanceOf(RECIPIENT), 0);
        assertEq(USDC.balanceOf(FEE_RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertEq(USDC.balanceOf(RECIPIENT), outputAmount);
        assertEq(USDC.balanceOf(FEE_RECIPIENT), feeAmount);
        assertEq(WETH.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
    }

    function testV2ExactOutputSingleNativeOutputWithFlatFee() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_USCD_FOR_10_ETH_WITH_FLAT_FEE");

        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);
        permit2.approve(address(USDC), address(router), uint160(BALANCE), uint48(block.timestamp + 1000));

        uint256 outputAmount = 10 ether;
        uint256 feeAmount = 5 ether;

        assertEq(WETH.balanceOf(FEE_RECIPIENT), 0);
        uint256 recipientBalanceBefore = RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertGt(RECIPIENT.balance - recipientBalanceBefore, outputAmount); // tiny imprecision with exactOut
        assertEq(WETH.balanceOf(FEE_RECIPIENT), feeAmount);
        assertEq(WETH.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
    }

    function testV2ExactOutputSingleERC20() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_USDC_FOR_1_ETH");

        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);
        permit2.approve(address(USDC), address(router), uint160(BALANCE), uint48(block.timestamp + 1000));

        assertEq(USDC.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(USDC.balanceOf(from), BALANCE - 1000 * ONE_USDC);
        assertGe(RECIPIENT.balance, startingRecipientBalance + 1 ether);
    }

    function testV3ExactInputSingleNative() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_1_ETH_FOR_USDC");

        assertEq(from.balance, BALANCE);
        assertEq(USDC.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertGt(USDC.balanceOf(RECIPIENT), 1000 * ONE_USDC);
    }

    function testV3ExactInputSingleNativeWithFee() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_1_ETH_FOR_USDC_WITH_FEE");

        assertEq(from.balance, BALANCE);
        assertEq(USDC.balanceOf(RECIPIENT), 0);
        assertEq(USDC.balanceOf(FEE_RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);

        uint256 recipientBalance = USDC.balanceOf(RECIPIENT);
        uint256 feeRecipientBalance = USDC.balanceOf(FEE_RECIPIENT);
        uint256 totalOut = recipientBalance + feeRecipientBalance;
        uint256 expectedFee = totalOut * 500 / 10000;
        assertEq(feeRecipientBalance, expectedFee);
        assertEq(recipientBalance, totalOut - expectedFee);
        assertGt(totalOut, 1000 * ONE_USDC);
    }

    function testV3ExactInputSingleNativeWithFlatFee() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_1_ETH_FOR_USDC_WITH_FLAT_FEE");

        assertEq(from.balance, BALANCE);
        assertEq(USDC.balanceOf(RECIPIENT), 0);
        assertEq(USDC.balanceOf(FEE_RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);

        uint256 recipientBalance = USDC.balanceOf(RECIPIENT);
        uint256 feeRecipientBalance = USDC.balanceOf(FEE_RECIPIENT);
        uint256 totalOut = recipientBalance + feeRecipientBalance;
        uint256 expectedFee = 50 * ONE_USDC;
        assertEq(feeRecipientBalance, expectedFee);
        assertEq(recipientBalance, totalOut - expectedFee);
        assertGt(totalOut, 1000 * ONE_USDC);
    }

    function testV3ExactInputSingleERC20() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_1000_USDC_FOR_ETH");

        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);
        permit2.approve(address(USDC), address(router), uint160(BALANCE), uint48(block.timestamp + 1000));
        assertEq(USDC.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(USDC.balanceOf(from), BALANCE - 1000 * ONE_USDC);
        assertGe(RECIPIENT.balance, startingRecipientBalance + 0.1 ether);
    }

    function testV3ExactInputSingleERC20WithWETHFee() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_1000_USDC_FOR_ETH_WITH_WETH_FEE");

        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);
        permit2.approve(address(USDC), address(router), uint160(BALANCE), uint48(block.timestamp + 1000));

        assertEq(USDC.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = RECIPIENT.balance;
        uint256 startingFeeRecipientBalance = FEE_RECIPIENT.balance;
        assertEq(WETH.balanceOf(FEE_RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(USDC.balanceOf(from), BALANCE - 1000 * ONE_USDC);

        uint256 recipientOutETH = RECIPIENT.balance - startingRecipientBalance;
        uint256 feeRecipientOutETH = FEE_RECIPIENT.balance - startingFeeRecipientBalance;
        uint256 feeRecipientOutWETH = WETH.balanceOf(FEE_RECIPIENT);

        uint256 totalOut = recipientOutETH + feeRecipientOutWETH;
        uint256 expectedFee = totalOut * 500 / 10000;

        // Recipient should get ETH, and fee recipient should get WETH (and no ETH)
        assertEq(feeRecipientOutWETH, expectedFee);
        assertEq(feeRecipientOutETH, 0);
        assertEq(recipientOutETH, totalOut - expectedFee);
        assertGt(totalOut, 0.1 ether);

        // Nothing left in the router!
        assertEq(WETH.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
    }

    function testV3ExactInputSingleERC20WithPermit() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_1000_USDC_FOR_ETH_PERMIT");

        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);
        assertEq(USDC.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(USDC.balanceOf(from), BALANCE - 1000 * ONE_USDC);
        assertGe(RECIPIENT.balance, startingRecipientBalance + 0.1 ether);
    }

    function testV3ExactInputNative() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_1_ETH_FOR_DAI_2_HOP");

        assertEq(from.balance, BALANCE);
        assertEq(DAI.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertGt(DAI.balanceOf(RECIPIENT), 1000 * ONE_DAI);
    }

    function testV3ExactInputNativeWithSafeMode() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_ETH_FOR_DAI_SAFE_MODE");

        assertEq(from.balance, BALANCE);
        assertEq(DAI.balanceOf(RECIPIENT), 0);

        // intended call value is 1e18 but 5e18 are sent in
        assertEq(params.value, 1e18);
        (bool success,) = address(router).call{value: 5e18}(params.data);
        require(success, "call failed");

        // the final balance only decreased by 1e18 because safemode swept back the excess
        assertLe(from.balance, BALANCE - params.value);
        assertGt(DAI.balanceOf(RECIPIENT), 1000 * ONE_DAI);
    }

    function testV3ExactOutputSingleNative() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_ETH_FOR_1000_USDC");

        assertEq(from.balance, BALANCE);
        assertEq(USDC.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertEq(USDC.balanceOf(RECIPIENT), 1000 * ONE_USDC);
    }

    function testV3ExactOutputSingleERC20() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_USDC_FOR_1_ETH");

        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);
        permit2.approve(address(USDC), address(router), uint160(BALANCE), uint48(block.timestamp + 1000));
        assertEq(USDC.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(USDC.balanceOf(from), BALANCE - 1000 * ONE_USDC);
        assertGe(RECIPIENT.balance, startingRecipientBalance + 1 ether);
    }

    function testV3ExactOutputNative() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_ETH_FOR_1000_DAI_2_HOP");

        assertEq(from.balance, BALANCE);
        assertEq(DAI.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertEq(DAI.balanceOf(RECIPIENT), 1000 * ONE_DAI);
    }

    function testV3ExactOutputERC20() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_DAI_FOR_1_ETH_2_HOP");

        uint256 daiAmount = 2000 ether;
        deal(address(DAI), from, daiAmount);
        DAI.approve(address(permit2), daiAmount);
        permit2.approve(address(DAI), address(router), uint160(daiAmount), uint48(block.timestamp + 1000));

        assertEq(DAI.balanceOf(from), daiAmount);
        uint256 startingRecipientBalance = RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");

        assertLe(DAI.balanceOf(from), daiAmount - 1000 * ONE_DAI);
        assertGe(RECIPIENT.balance, startingRecipientBalance + 1 ether);
    }

    function testV3ExactOutputERC20WithWETHFee() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_DAI_FOR_1_ETH_2_HOP_WITH_WETH_FEE");

        uint256 daiAmount = 2000 * ONE_DAI;
        uint256 outputAmount = 1 ether;
        uint256 feeAmount = ((outputAmount * 10000) / 9500) - outputAmount;

        deal(address(DAI), from, daiAmount);
        DAI.approve(address(permit2), daiAmount);
        permit2.approve(address(DAI), address(router), uint160(daiAmount), uint48(block.timestamp + 1000));

        assertEq(DAI.balanceOf(from), daiAmount);
        uint256 startingRecipientBalance = RECIPIENT.balance;
        uint256 startingFeeRecipientBalance = FEE_RECIPIENT.balance;
        assertEq(WETH.balanceOf(FEE_RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");

        assertLe(DAI.balanceOf(from), daiAmount - 1000 * ONE_DAI);

        // Fee paid in WETH, and recipient gets ETH
        assertEq(WETH.balanceOf(FEE_RECIPIENT), feeAmount);
        assertEq(FEE_RECIPIENT.balance, startingFeeRecipientBalance);
        assertEq(RECIPIENT.balance, startingRecipientBalance + outputAmount);

        // Nothing left in the router!
        assertEq(WETH.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
    }

    function testV4ExactInputETH() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V4_1_ETH_FOR_USDC");
        assertEq(from.balance, BALANCE);
        assertEq(USDC.balanceOf(RECIPIENT), 0);
        assertEq(params.value, 1e18);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");

        assertLe(from.balance, BALANCE - params.value);
        assertGt(USDC.balanceOf(RECIPIENT), 2000 * ONE_USDC);
    }

    // function testV4ExactInputEthWithWrap() public {
    //     MethodParameters memory params = readFixture(json, "._UNISWAP_V4_1_ETH_FOR_USDC_WITH_WRAP");
    //     assertEq(from.balance, BALANCE);
    //     assertEq(USDC.balanceOf(RECIPIENT), 0);
    //     assertEq(params.value, 1e18);
    //
    //     (bool success,) = address(router).call{value: params.value}(params.data);
    //     require(success, "call failed");
    //
    //     assertLe(from.balance, BALANCE - params.value);
    //     assertGt(USDC.balanceOf(RECIPIENT), 2000 * ONE_USDC);
    // }

    function testV4ExactInputUSDCForETHwithETHFee() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V4_USDC_FOR_1_ETH_2_HOP_WITH_ETH_FEE");
        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);
        permit2.approve(address(USDC), address(router), uint160(BALANCE), uint48(block.timestamp + 1000));

        assertEq(USDC.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = RECIPIENT.balance;
        uint256 startingFeeRecipientBalance = FEE_RECIPIENT.balance;
        assertEq(WETH.balanceOf(FEE_RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");

        uint256 recipientOutETH = RECIPIENT.balance - startingRecipientBalance;
        uint256 feeRecipientOutETH = FEE_RECIPIENT.balance - startingFeeRecipientBalance;
        uint256 totalOut = recipientOutETH + feeRecipientOutETH;
        uint256 expectedFee = totalOut * 500 / 10000;

        assertLe(USDC.balanceOf(from), BALANCE);
        assertEq(feeRecipientOutETH, expectedFee);
        assertEq(recipientOutETH, totalOut - expectedFee);
        assertEq(address(router).balance, 0);
    }

    function testV4ExactOutNativeOutputWithUnwrap() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V4_USDC_FOR_1_ETH_WITH_WRAP");

        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);
        permit2.approve(address(USDC), address(router), uint160(BALANCE), uint48(block.timestamp + 1000));
        assertEq(USDC.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = USDC.balanceOf(from);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");

        assertEq(WETH.balanceOf(RECIPIENT), 1 ether);
        assertLt(USDC.balanceOf(from), startingRecipientBalance);
    }

    function testV4ExactInSwapWithETHFeeAndUnwrap() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V4_USDC_FOR_1000_ETH_WITH_FEE_AND_WRAP");
        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);
        permit2.approve(address(USDC), address(router), uint160(BALANCE), uint48(block.timestamp + 1000));

        assertEq(USDC.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = WETH.balanceOf(RECIPIENT);
        uint256 startingFeeRecipientBalance = FEE_RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");

        uint256 expectedAmount = 1 ether;
        uint256 expectedFee = expectedAmount * 500 / 10000;

        assertEq(WETH.balanceOf(RECIPIENT) - startingRecipientBalance, expectedAmount);
        assertEq(FEE_RECIPIENT.balance - startingFeeRecipientBalance, expectedFee);
    }

    function testV4ExactOutputETHForUSDC() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V4_ETH_FOR_1000_USDC");
        deal(address(WETH), from, BALANCE);
        WETH.approve(address(permit2), BALANCE);
        permit2.approve(address(WETH), address(router), uint160(BALANCE), uint48(block.timestamp + 1000));

        uint256 startingRecipientBalance = USDC.balanceOf(RECIPIENT);
        uint256 startingFromBalance = WETH.balanceOf(from);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");

        uint256 expectedAmount = 1000 * 10 ** 6;

        assertEq(USDC.balanceOf(RECIPIENT) - startingRecipientBalance, expectedAmount);
        assertEq(address(router).balance, 0);
    }

    function testV4UnwrapWETHToTradeETHForUSDC() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V4_UNWRAP_WETH_TO_ETH_FOR_1000_USDC");
        deal(address(WETH), from, BALANCE);
        WETH.approve(address(permit2), BALANCE);
        permit2.approve(address(WETH), address(router), uint160(BALANCE), uint48(block.timestamp + 1000));

        uint256 startingRecipientBalance = USDC.balanceOf(RECIPIENT);
        uint256 startingFromBalance = WETH.balanceOf(from);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");

        uint256 expectedAmount = 1000 * 10 ** 6;

        assertEq(USDC.balanceOf(RECIPIENT) - startingRecipientBalance, expectedAmount);
        assertEq(WETH.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
        assertLt(WETH.balanceOf(from), startingFromBalance);
    }

    function testV4WrapETHToTradeWETHForDAI() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V4_WRAP_ETH_FOR_1_DAI");

        uint256 startingRecipientBalance = DAI.balanceOf(RECIPIENT);
        uint256 startingFromBalance = from.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");

        uint256 expectedAmount = 1 ether;

        assertEq(DAI.balanceOf(RECIPIENT) - startingRecipientBalance, expectedAmount);
        assertEq(WETH.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
        assertLt(from.balance, startingFromBalance);
    }

    function testV4ExactInWithFee() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V4_1_ETH_FOR_USDC_WITH_FEE");

        assertEq(from.balance, BALANCE);
        assertEq(USDC.balanceOf(RECIPIENT), 0);
        assertEq(USDC.balanceOf(FEE_RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);

        uint256 recipientBalance = USDC.balanceOf(RECIPIENT);
        uint256 feeRecipientBalance = USDC.balanceOf(FEE_RECIPIENT);
        uint256 totalOut = recipientBalance + feeRecipientBalance;
        uint256 expectedFee = totalOut * 500 / 10000;
        assertEq(feeRecipientBalance, expectedFee, "Fee received");
        assertEq(recipientBalance, totalOut - expectedFee, "User output");
        assertGt(totalOut, 1000 * ONE_USDC, "Slippage");
    }

    function testV4ExactInWithFlatFee() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V4_1_ETH_FOR_USDC_WITH_FLAT_FEE");
        assertEq(from.balance, BALANCE);
        assertEq(USDC.balanceOf(RECIPIENT), 0);
        assertEq(USDC.balanceOf(FEE_RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);

        uint256 recipientBalance = USDC.balanceOf(RECIPIENT);
        uint256 feeRecipientBalance = USDC.balanceOf(FEE_RECIPIENT);
        uint256 totalOut = recipientBalance + feeRecipientBalance;
        uint256 expectedFee = 50 * ONE_USDC;
        assertEq(feeRecipientBalance, expectedFee);
        assertEq(recipientBalance, totalOut - expectedFee);
        assertGt(totalOut, 1000 * ONE_USDC);
    }

    function testV4ExactInNativeOutput() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V4_1000_USDC_FOR_ETH");

        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);
        permit2.approve(address(USDC), address(router), uint160(BALANCE), uint48(block.timestamp + 1000));
        assertEq(USDC.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = from.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");

        assertEq(USDC.balanceOf(from), BALANCE - 1000 * ONE_USDC);
        assertGe(from.balance, startingRecipientBalance);
    }

    function testV4ExactOutNativeOutput() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V4_DAI_FOR_1_ETH_2_HOP");

        deal(address(DAI), from, BALANCE);
        DAI.approve(address(permit2), BALANCE);
        permit2.approve(address(DAI), address(router), uint160(BALANCE), uint48(block.timestamp + 1000));
        assertEq(DAI.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = from.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");

        assertLt(DAI.balanceOf(from), BALANCE - ONE_DAI);
        assertGe(from.balance, startingRecipientBalance);
    }

    function testV4ExactInMultiHop() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V4_ETH_FOR_DAI");

        assertEq(from.balance, BALANCE);
        assertEq(DAI.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertGt(DAI.balanceOf(RECIPIENT), 9 * ONE_DAI / 10);
    }

    function testMixedExactInputNative() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_MIXED_1_ETH_FOR_DAI");

        assertEq(from.balance, BALANCE);
        assertEq(DAI.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertGt(DAI.balanceOf(RECIPIENT), 1000 * ONE_DAI);
    }

    function testMixedExactInputNativeV2First() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_MIXED_1_ETH_FOR_DAI_V2_FIRST");

        assertEq(from.balance, BALANCE);
        assertEq(DAI.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertGt(DAI.balanceOf(RECIPIENT), 1000 * ONE_DAI);
    }

    function testMixedExactInputNativeV2Only() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_MIXED_1_ETH_FOR_DAI_V2_ONLY");

        assertEq(from.balance, BALANCE);
        assertEq(DAI.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertGt(DAI.balanceOf(RECIPIENT), 1000 * ONE_DAI);
    }

    function testMixedExactInputNativeV3Only() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_MIXED_1_ETH_FOR_DAI_V3_ONLY");

        assertEq(from.balance, BALANCE);
        assertEq(DAI.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertGt(DAI.balanceOf(RECIPIENT), 1000 * ONE_DAI);
    }

    function testMixedExactInputERC20V2ToV3() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_MIXED_DAI_FOR_ETH");

        uint256 daiAmount = 1000 ether;
        deal(address(DAI), from, daiAmount);
        DAI.approve(address(permit2), daiAmount);
        permit2.approve(address(DAI), address(router), uint160(daiAmount), uint48(block.timestamp + 1000));
        assertEq(DAI.balanceOf(from), daiAmount);
        uint256 startingRecipientBalance = RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(DAI.balanceOf(from), 0);
        assertGe(RECIPIENT.balance, startingRecipientBalance + 0.1 ether);
    }

    function testTwoRoutesExactInputETHtoUSDC() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_SPLIT_TWO_ROUTES_ETH_TO_USDC");

        assertEq(from.balance, BALANCE);
        assertEq(USDC.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertGt(USDC.balanceOf(RECIPIENT), 2000 * ONE_USDC);
        assertEq(WETH.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
    }

    function testThreeRoutesExactInputETHtoUSDC() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_SPLIT_THREE_ROUTES_ETH_TO_USDC");

        assertEq(from.balance, BALANCE);
        assertEq(USDC.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertGt(USDC.balanceOf(RECIPIENT), 3000 * ONE_USDC);
        assertEq(USDC.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
    }

    function testMixedV3ToV4UnwrapWETH() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_MIXED_USDC_DAI_UNWRAP_WETH_V3_TO_V4");

        uint256 usdcAmount = 1000000000;
        deal(address(USDC), from, usdcAmount);
        USDC.approve(address(permit2), usdcAmount);
        permit2.approve(address(USDC), address(router), uint160(usdcAmount), uint48(block.timestamp + 1000));

        assertEq(USDC.balanceOf(from), usdcAmount);
        assertEq(DAI.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");

        assertLe(from.balance, BALANCE - params.value);
        assertEq(USDC.balanceOf(from), 0);
        assertEq(DAI.balanceOf(address(router)), 0);
        assertGt(DAI.balanceOf(RECIPIENT), 0);
        assertEq(address(router).balance, 0);
    }

    function testMixedV2ToV4UnwrapWETH() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_MIXED_USDC_DAI_UNWRAP_WETH_V2_TO_V4");

        uint256 usdcAmount = 1000000000;
        deal(address(USDC), from, usdcAmount);
        USDC.approve(address(permit2), usdcAmount);
        permit2.approve(address(USDC), address(router), uint160(usdcAmount), uint48(block.timestamp + 1000));

        assertEq(USDC.balanceOf(from), usdcAmount);
        assertEq(DAI.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");

        assertLe(from.balance, BALANCE - params.value);
        assertEq(USDC.balanceOf(from), 0);
        assertEq(DAI.balanceOf(address(router)), 0);
        assertGt(DAI.balanceOf(RECIPIENT), 0);
        assertEq(address(router).balance, 0);
    }

    function testMixedV4ToV3WrapETH() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_MIXED_DAI_USDC_WRAP_ETH_V4_TO_V3");

        uint256 daiAmount = 1000 ether;
        deal(address(DAI), from, daiAmount);
        DAI.approve(address(permit2), daiAmount);
        permit2.approve(address(DAI), address(router), uint160(daiAmount), uint48(block.timestamp + 1000));

        assertEq(DAI.balanceOf(from), daiAmount);
        assertEq(USDC.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");

        assertLe(from.balance, BALANCE - params.value);
        assertEq(DAI.balanceOf(from), 0);
        assertEq(USDC.balanceOf(address(router)), 0);
        assertGt(USDC.balanceOf(RECIPIENT), 0);
        assertEq(address(router).balance, 0);
    }

    function testMixedV4ToV2WrapETH() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_MIXED_DAI_USDC_WRAP_ETH_V4_TO_V2");

        uint256 daiAmount = 1000 ether;
        deal(address(DAI), from, daiAmount);
        DAI.approve(address(permit2), daiAmount);
        permit2.approve(address(DAI), address(router), uint160(daiAmount), uint48(block.timestamp + 1000));

        assertEq(DAI.balanceOf(from), daiAmount);
        assertEq(USDC.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");

        assertLe(from.balance, BALANCE - params.value);
        assertEq(DAI.balanceOf(from), 0);
        assertEq(USDC.balanceOf(address(router)), 0);
        assertGt(USDC.balanceOf(RECIPIENT), 0);
        assertEq(address(router).balance, 0);
    }
}
