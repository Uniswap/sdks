// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Test, stdJson, console2} from "forge-std/Test.sol";
import {ERC721} from "solmate/tokens/ERC721.sol";
import {Router} from "narwhal/Router.sol";
import {DeployRouter} from "./utils/DeployRouter.sol";
import {MethodParameters, Interop} from "./utils/Interop.sol";

contract SwapGenieCallParametersTest is Test, Interop, DeployRouter {
    using stdJson for string;

    address private constant RECIPIENT = 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa;

    address from;
    uint256 fromPrivateKey;
    string json;

    function setUp() public {
        fromPrivateKey = 0x1234;
        from = vm.addr(fromPrivateKey);
        string memory root = vm.projectRoot();
        json = vm.readFile(string.concat(root, "/tests/forge/interop.json"));
    }

    function testFoundationBuyItem() public {
        MethodParameters memory params = readFixture(json, "._FOUNDATION_BUY_ITEM");

        vm.createSelectFork(vm.envString("FORK_URL"), 15725945);
        vm.startPrank(from);

        Router router = deployRouterMainnetConfig();
        ERC721 token = ERC721(0xEf96021Af16BD04918b0d87cE045d7984ad6c38c);
        uint256 balance = 10 ** 18;
        vm.deal(from, balance);
        assertEq(from.balance, balance);
        assertEq(token.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertEq(token.balanceOf(RECIPIENT), 1);
        assertLe(from.balance, balance - 0.01 ether);
    }

    function testNftxBuyItems() public {
        MethodParameters memory params = readFixture(json, "._NFTX_BUY_ITEMS");

        vm.createSelectFork(vm.envString("FORK_URL"), 15360000);
        vm.startPrank(from);

        Router router = deployRouterMainnetConfig();
        ERC721 token = ERC721(0x5180db8F5c931aaE63c74266b211F580155ecac8);
        uint256 balance = 10 ** 18;
        vm.deal(from, balance);
        assertEq(from.balance, balance);
        assertEq(token.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertEq(token.balanceOf(RECIPIENT), 2);
        assertEq(from.balance, 0);
    }
}
