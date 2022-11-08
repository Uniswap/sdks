// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Test, stdJson, console2} from "forge-std/Test.sol";
import {ERC20} from "solmate/tokens/ERC20.sol";
import {Router} from "narwhal/Router.sol";
import {Permit2} from "permit2/src/Permit2.sol";
import {DeployRouter} from "./utils/DeployRouter.sol";
import {MethodParameters, Interop} from "./utils/Interop.sol";

contract SwapERC20CallParametersTest is Test, Interop, DeployRouter {
    using stdJson for string;

    address private constant RECIPIENT = 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa;
    ERC20 private constant WETH = ERC20(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    ERC20 private constant USDC = ERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
    ERC20 private constant DAI = ERC20(0x6B175474E89094C44Da98b954EedeAC495271d0F);
    // starting eth balance
    uint256 constant BALANCE = 10 ether;

    address from;
    uint256 fromPrivateKey;
    string json;
    Router router;
    Permit2 permit2;

    function setUp() public {
        fromPrivateKey = 0x1234;
        from = vm.addr(fromPrivateKey);
        string memory root = vm.projectRoot();
        json = vm.readFile(string.concat(root, "/tests/forge/interop.json"));

        (router, permit2) = forkAndDeploy(15898000);
        vm.deal(from, BALANCE);
    }

    function testV2ExactInputSingleNative() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_EXACT_INPUT_SINGLE_NATIVE");

        assertEq(from.balance, BALANCE);
        assertEq(USDC.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertGt(USDC.balanceOf(RECIPIENT), 10000000);
    }

    function testV2ExactInputNative() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_EXACT_INPUT_NATIVE");

        assertEq(from.balance, BALANCE);
        assertEq(DAI.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertGt(DAI.balanceOf(RECIPIENT), 10000000);
        assertEq(WETH.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
    }

    function testV2ExactInputSingleERC20() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_EXACT_INPUT_SINGLE_ERC20");

        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);
        permit2.approve(address(USDC), address(router), uint160(BALANCE), uint64(block.timestamp + 1000));

        assertEq(USDC.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(USDC.balanceOf(from), BALANCE - 1000000000);
        assertGe(RECIPIENT.balance, startingRecipientBalance + 10000000);
    }

    function testV2ExactInputERC20() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_EXACT_INPUT_ERC20");

        deal(address(DAI), from, BALANCE);
        DAI.approve(address(permit2), BALANCE);
        permit2.approve(address(DAI), address(router), uint160(BALANCE), uint64(block.timestamp + 1000));
        assertEq(DAI.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(DAI.balanceOf(from), BALANCE - 10 ether);
        assertGe(RECIPIENT.balance, startingRecipientBalance + 10000000);
    }

    function testV2ExactOutputSingleNative() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_EXACT_OUTPUT_SINGLE_NATIVE");

        assertEq(from.balance, BALANCE);
        assertEq(USDC.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertEq(USDC.balanceOf(RECIPIENT), 1000000000);
        assertEq(WETH.balanceOf(address(router)), 0);
        assertEq(address(router).balance, 0);
    }

    function testV2ExactOutputSingleERC20() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V2_EXACT_OUTPUT_SINGLE_ERC20");

        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);
        permit2.approve(address(USDC), address(router), uint160(BALANCE), uint64(block.timestamp + 1000));

        assertEq(USDC.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(USDC.balanceOf(from), BALANCE - 1000000);
        assertGe(RECIPIENT.balance, startingRecipientBalance + 1 ether);
    }

    function testV3ExactInputSingleNative() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_EXACT_INPUT_SINGLE_NATIVE");

        assertEq(from.balance, BALANCE);
        assertEq(USDC.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertGt(USDC.balanceOf(RECIPIENT), 10000000);
    }

    function testV3ExactInputSingleERC20() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_EXACT_INPUT_SINGLE_ERC20");

        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);
        permit2.approve(address(USDC), address(router), uint160(BALANCE), uint64(block.timestamp + 1000));
        assertEq(USDC.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(USDC.balanceOf(from), BALANCE - 1000000000);
        assertGe(RECIPIENT.balance, startingRecipientBalance + 10000000);
    }

    function testV3ExactInputNative() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_EXACT_INPUT_NATIVE");

        assertEq(from.balance, BALANCE);
        assertEq(DAI.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertGt(DAI.balanceOf(RECIPIENT), 10000000);
    }

    function testV3ExactOutputSingleNative() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_EXACT_OUTPUT_SINGLE_NATIVE");

        assertEq(from.balance, BALANCE);
        assertEq(USDC.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertEq(USDC.balanceOf(RECIPIENT), 1000000000);
    }

    function testV3ExactOutputSingleERC20() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_EXACT_OUTPUT_SINGLE_ERC20");

        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);
        permit2.approve(address(USDC), address(router), uint160(BALANCE), uint64(block.timestamp + 1000));
        assertEq(USDC.balanceOf(from), BALANCE);
        uint256 startingRecipientBalance = RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(USDC.balanceOf(from), BALANCE - 100000000);
        assertGe(RECIPIENT.balance, startingRecipientBalance + 1 ether);
    }

    function testV3ExactOutputNative() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_EXACT_OUTPUT_NATIVE");

        assertEq(from.balance, BALANCE);
        assertEq(DAI.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertEq(DAI.balanceOf(RECIPIENT), 1000 ether);
    }

    function testV3ExactOutputERC20() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V3_EXACT_OUTPUT_ERC20");

        uint256 daiAmount = 2000 ether;
        deal(address(DAI), from, daiAmount);
        DAI.approve(address(permit2), daiAmount);
        permit2.approve(address(DAI), address(router), uint160(daiAmount), uint64(block.timestamp + 1000));

        assertEq(DAI.balanceOf(from), daiAmount);
        uint256 startingRecipientBalance = RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");

        assertLe(DAI.balanceOf(from), daiAmount - 100000000);
        assertGe(RECIPIENT.balance, startingRecipientBalance + 1 ether);
    }

    function testMixedExactInputNative() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_MIXED_EXACT_INPUT_NATIVE");

        assertEq(from.balance, BALANCE);
        assertEq(DAI.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertGt(DAI.balanceOf(RECIPIENT), 10000000);
    }

    function testMixedExactInputNativeV2First() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_MIXED_EXACT_INPUT_NATIVE_V2_FIRST");

        assertEq(from.balance, BALANCE);
        assertEq(DAI.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertGt(DAI.balanceOf(RECIPIENT), 10000000);
    }

    function testMixedExactInputNativeV2Only() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_MIXED_EXACT_INPUT_NATIVE_V2_ONLY");

        assertEq(from.balance, BALANCE);
        assertEq(DAI.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertGt(DAI.balanceOf(RECIPIENT), 10000000);
    }

    function testMixedExactInputNativeV3Only() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_MIXED_EXACT_INPUT_NATIVE_V3_ONLY");

        assertEq(from.balance, BALANCE);
        assertEq(DAI.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(from.balance, BALANCE - params.value);
        assertGt(DAI.balanceOf(RECIPIENT), 10000000);
    }

    function testMixedExactInputERC20V2ToV3() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_MIXED_EXACT_INPUT_ERC20");

        uint256 daiAmount = 1000 ether;
        deal(address(DAI), from, daiAmount);
        DAI.approve(address(permit2), daiAmount);
        permit2.approve(address(DAI), address(router), uint160(daiAmount), uint64(block.timestamp + 1000));
        assertEq(DAI.balanceOf(from), daiAmount);
        uint256 startingRecipientBalance = RECIPIENT.balance;

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertLe(DAI.balanceOf(from), 0);
        assertGe(RECIPIENT.balance, startingRecipientBalance + 10000000);
    }

    function forkAndDeploy(uint256 forkBlock) private returns (Router _router, Permit2 _permit2) {
        vm.createSelectFork(vm.envString("FORK_URL"), forkBlock);
        vm.startPrank(from);
        (_router, _permit2) = deployFixtureMainnetConfig();
    }
}
