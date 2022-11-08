// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Test, stdJson, console2} from "forge-std/Test.sol";
import {ERC721} from "solmate/tokens/ERC721.sol";
import {Router} from "narwhal/Router.sol";
import {DeployRouter} from "./utils/DeployRouter.sol";
import {MethodParameters, Interop} from "./utils/Interop.sol";
import {ICryptopunksMarket} from "./utils/ICryptopunksMarket.sol";

contract SwapGenieCallParametersTest is Test, Interop, DeployRouter {
    using stdJson for string;

    address private constant RECIPIENT = 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa;
    address private constant ROUTER_ADDRESS = 0x4a873bdD49F7F9CC0A5458416A12973fAB208f8D;

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
        uint256 balance = 1 ether;
        vm.deal(from, balance);
        assertEq(from.balance, balance);
        assertEq(token.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertEq(token.balanceOf(RECIPIENT), 1);
        assertEq(from.balance, balance - params.value);
    }

    function testNftxBuyItems() public {
        MethodParameters memory params = readFixture(json, "._NFTX_BUY_ITEMS");

        vm.createSelectFork(vm.envString("FORK_URL"), 15360000);
        vm.startPrank(from);

        Router router = deployRouterMainnetConfig();
        ERC721 token = ERC721(0x5180db8F5c931aaE63c74266b211F580155ecac8);
        uint256 balance = 1 ether;
        vm.deal(from, balance);
        assertEq(from.balance, balance);
        assertEq(token.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertEq(token.balanceOf(RECIPIENT), 2);
        assertEq(from.balance, balance - params.value);
    }

    function testLooksRareBuyItems() public {
        MethodParameters memory params = readFixture(json, "._LOOKSRARE_BUY_ITEM");

        vm.createSelectFork(vm.envString("FORK_URL"), 15360000);
        vm.startPrank(from);

        Router router = deployRouterMainnetConfig();
        assertEq(address(router), ROUTER_ADDRESS); // to ensure the router address in sdk is correct

        ERC721 token = ERC721(0x5180db8F5c931aaE63c74266b211F580155ecac8);
        uint256 balance = 32 ether;
        vm.deal(from, balance);
        assertEq(from.balance, balance);
        assertEq(token.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);

        require(success, "call failed");
        assertEq(token.balanceOf(RECIPIENT), 1);
        assertEq(from.balance, 0);
    }

    function testSeaportBuyItems() public {
        MethodParameters memory params = readFixture(json, "._SEAPORT_BUY_ITEMS");

        vm.createSelectFork(vm.envString("FORK_URL"), 15360000);
        vm.startPrank(from);

        Router router = deployRouterMainnetConfig();
        ERC721 token = ERC721(0x5180db8F5c931aaE63c74266b211F580155ecac8);
        uint256 balance = 55 ether;
        vm.deal(from, balance);
        assertEq(from.balance, balance);
        assertEq(token.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertEq(token.balanceOf(RECIPIENT), 2);
        assertEq(from.balance, balance - params.value);
    }

    function testCryptopunkBuyItems() public {
        MethodParameters memory params = readFixture(json, "._CRYPTOPUNK_BUY_ITEM");
        // older block 15360000 does not work
        vm.createSelectFork(vm.envString("FORK_URL"), 15898323);
        vm.startPrank(from);

        Router router = deployRouterMainnetConfig();
        ICryptopunksMarket token = ICryptopunksMarket(0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB);
        uint256 balance = 80 ether;

        vm.deal(from, balance);
        assertEq(from.balance, balance);
        assertEq(token.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertEq(token.balanceOf(RECIPIENT), 1);

        assertEq(token.punkIndexToAddress(2976), RECIPIENT);
        assertEq(from.balance, balance - params.value);
    }

    function testX2Y2BuyItems() public {
        MethodParameters memory params = readFixture(json, "._X2Y2_BUY_ITEM");

        vm.createSelectFork(vm.envString("FORK_URL"), 15360000);
        vm.startPrank(from);

        Router router = deployRouterMainnetConfig();
        assertEq(address(router), ROUTER_ADDRESS); // to ensure the router address in sdk is correct

        ERC721 token = ERC721(0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85);
        uint256 balance = 1 ether;
        vm.deal(from, balance);
        assertEq(from.balance, balance);
        assertEq(token.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);

        require(success, "call failed");
        assertEq(token.balanceOf(RECIPIENT), 1);
        assertEq(from.balance, balance - params.value);
    }

    function testNFT20BuyItems() public {
        MethodParameters memory params = readFixture(json, "._NFT20_BUY_ITEM");

        vm.createSelectFork(vm.envString("FORK_URL"), 15770228);
        vm.startPrank(from);

        Router router = deployRouterMainnetConfig();
        assertEq(address(router), ROUTER_ADDRESS); // to ensure the router address in sdk is correct

        ERC721 token = ERC721(0x6d05064fe99e40F1C3464E7310A23FFADed56E20);
        uint256 balance = 20583701229648230;
        vm.deal(from, balance);
        assertEq(from.balance, balance);
        assertEq(token.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);

        require(success, "call failed");
        assertEq(token.balanceOf(RECIPIENT), 3);
        assertEq(from.balance, balance - params.value);
    }

    function testSudoswapBuyItems() public {
        MethodParameters memory params = readFixture(json, "._SUDOSWAP_BUY_ITEM");

        vm.createSelectFork(vm.envString("FORK_URL"), 15740629);
        vm.startPrank(from);

        Router router = deployRouterMainnetConfig();
        assertEq(address(router), ROUTER_ADDRESS); // to ensure the router address in sdk is correct

        ERC721 token = ERC721(0xfA9937555Dc20A020A161232de4D2B109C62Aa9c);
        uint256 balance = 73337152777777783;
        vm.deal(from, balance);
        assertEq(from.balance, balance);
        assertEq(token.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);

        require(success, "call failed");
        assertEq(token.balanceOf(RECIPIENT), 3);
        assertEq(from.balance, balance - params.value);
    }

    function testPartialFill() public {
        MethodParameters memory params = readFixture(json, "._PARTIAL_FILL");

        vm.createSelectFork(vm.envString("FORK_URL"), 15360000);
        vm.startPrank(from);

        Router router = deployRouterMainnetConfig();
        ERC721 token = ERC721(0x5180db8F5c931aaE63c74266b211F580155ecac8);
        uint256 balance = 54 ether;
        uint256 failedAmount = 1 ether;
        vm.deal(from, balance);
        assertEq(from.balance, balance);
        assertEq(token.balanceOf(RECIPIENT), 0);

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");
        assertEq(token.balanceOf(RECIPIENT), 1);

        assertEq(from.balance, balance - params.value + failedAmount);
    }
}
