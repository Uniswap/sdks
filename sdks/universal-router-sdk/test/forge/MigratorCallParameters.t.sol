// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, stdJson} from "forge-std/Test.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {UniversalRouter} from "universal-router/UniversalRouter.sol";
import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";
import {DeployRouter} from "./utils/DeployRouter.sol";
import {MethodParameters, Interop} from "./utils/Interop.sol";
import {INonfungiblePositionManager} from "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";

contract MigratorCallParametersTest is Test, Interop, DeployRouter {
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

    function test_migrate_toEth_withoutPermit() public {
        MethodParameters memory params = readFixture(json, "._MIGRATE_TO_ETH_WITHOUT_PERMIT");

        // add the position to v3 so we have something to migrate
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0);
        // USDC < WETH
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18);
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 1);

        // approve the UniversalRouter to access the position (instead of permit)
        vm.prank(from);
        INonfungiblePositionManager(V3_POSITION_MANAGER).setApprovalForAll(MAINNET_ROUTER, true);

        // pool manager balance before
        uint256 ethBalanceBefore = address(poolManager).balance;
        uint256 usdcBalanceBefore = USDC.balanceOf(address(poolManager));
        uint256 wethBalanceBefore = WETH.balanceOf(address(poolManager));

        // recipient balance before
        uint256 recipientBalanceBefore = address(RECIPIENT).balance;
        uint256 recipientUSDCBalanceBefore = USDC.balanceOf(RECIPIENT);
        uint256 recipientWETHBalanceBefore = WETH.balanceOf(RECIPIENT);

        assertEq(params.value, 0);
        vm.prank(from);
        (bool success,) = address(router).call(params.data);
        require(success, "call failed");

        // all funds were swept out of contracts
        assertEq(USDC.balanceOf(MAINNET_ROUTER), 0);
        assertEq(WETH.balanceOf(MAINNET_ROUTER), 0);
        assertEq(address(MAINNET_ROUTER).balance, 0);
        assertEq(USDC.balanceOf(address(v4PositionManager)), 0);
        assertEq(WETH.balanceOf(address(v4PositionManager)), 0);
        assertEq(address(v4PositionManager).balance, 0);

        // pool manager balance after, eth and usdc deposited
        assertGt(address(poolManager).balance, ethBalanceBefore);
        assertGt(USDC.balanceOf(address(poolManager)), usdcBalanceBefore);
        assertEq(WETH.balanceOf(address(poolManager)), wethBalanceBefore);

        // recipient balance after
        assertEq(address(RECIPIENT).balance, recipientBalanceBefore);
        assertGe(USDC.balanceOf(RECIPIENT), recipientUSDCBalanceBefore);
        assertGe(WETH.balanceOf(RECIPIENT), recipientWETHBalanceBefore);

        // old position burned, new position minted
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0, "V3 NOT BURNT");
        assertEq(v4PositionManager.balanceOf(RECIPIENT), 1, "V4 NOT MINTED");
    }

    function test_migrate_toErc20_withoutPermit() public {
        MethodParameters memory params = readFixture(json, "._MIGRATE_TO_ERC20_WITHOUT_PERMIT");

        // add the position to v3 so we have something to migrate
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0);
        // USDC < WETH
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18);
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 1);

        // approve the UniversalRouter to access the position (instead of permit)
        vm.prank(from);
        INonfungiblePositionManager(V3_POSITION_MANAGER).setApprovalForAll(MAINNET_ROUTER, true);

        // pool manager balance before
        uint256 ethBalanceBefore = address(poolManager).balance;
        uint256 usdcBalanceBefore = USDC.balanceOf(address(poolManager));
        uint256 wethBalanceBefore = WETH.balanceOf(address(poolManager));

        // recipient balance before
        uint256 recipientBalanceBefore = address(RECIPIENT).balance;
        uint256 recipientUSDCBalanceBefore = USDC.balanceOf(RECIPIENT);
        uint256 recipientWETHBalanceBefore = WETH.balanceOf(RECIPIENT);

        assertEq(params.value, 0);
        vm.prank(from);
        (bool success,) = address(router).call(params.data);
        require(success, "call failed");

        // all funds were swept out of contracts
        assertEq(USDC.balanceOf(MAINNET_ROUTER), 0);
        assertEq(WETH.balanceOf(MAINNET_ROUTER), 0);
        assertEq(address(MAINNET_ROUTER).balance, 0);
        assertEq(USDC.balanceOf(address(v4PositionManager)), 0);
        assertEq(WETH.balanceOf(address(v4PositionManager)), 0);
        assertEq(address(v4PositionManager).balance, 0);

        // pool manager balance after, weth and usdc deposited
        assertEq(address(poolManager).balance, ethBalanceBefore);
        assertGt(USDC.balanceOf(address(poolManager)), usdcBalanceBefore);
        assertGt(WETH.balanceOf(address(poolManager)), wethBalanceBefore);

        // recipient balance after
        assertEq(address(RECIPIENT).balance, recipientBalanceBefore);
        assertGe(USDC.balanceOf(RECIPIENT), recipientUSDCBalanceBefore);
        assertGe(WETH.balanceOf(RECIPIENT), recipientWETHBalanceBefore);

        // old position burned, new position minted
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0, "V3 NOT BURNT");
        assertEq(v4PositionManager.balanceOf(RECIPIENT), 1, "V4 NOT MINTED");
    }

    function test_migrate_toEth_withPermit() public {
        MethodParameters memory params = readFixture(json, "._MIGRATE_TO_ETH_WITH_PERMIT");

        // add the position to v3 so we have something to migrate
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0);
        // USDC < WETH
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18);
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 1);

        // pool manager balance before
        uint256 ethBalanceBefore = address(poolManager).balance;
        uint256 usdcBalanceBefore = USDC.balanceOf(address(poolManager));
        uint256 wethBalanceBefore = WETH.balanceOf(address(poolManager));

        // recipient balance before
        uint256 recipientBalanceBefore = address(RECIPIENT).balance;
        uint256 recipientUSDCBalanceBefore = USDC.balanceOf(RECIPIENT);
        uint256 recipientWETHBalanceBefore = WETH.balanceOf(RECIPIENT);

        assertEq(params.value, 0);
        vm.prank(from);
        (bool success,) = address(router).call(params.data);
        require(success, "call failed");

        // all funds were swept out of contracts
        assertEq(USDC.balanceOf(MAINNET_ROUTER), 0);
        assertEq(WETH.balanceOf(MAINNET_ROUTER), 0);
        assertEq(address(MAINNET_ROUTER).balance, 0);
        assertEq(USDC.balanceOf(address(v4PositionManager)), 0);
        assertEq(WETH.balanceOf(address(v4PositionManager)), 0);
        assertEq(address(v4PositionManager).balance, 0);

        // pool manager balance after, eth and usdc deposited
        assertGt(address(poolManager).balance, ethBalanceBefore);
        assertGt(USDC.balanceOf(address(poolManager)), usdcBalanceBefore);
        assertEq(WETH.balanceOf(address(poolManager)), wethBalanceBefore);

        // recipient balance after
        assertEq(address(RECIPIENT).balance, recipientBalanceBefore);
        assertGe(USDC.balanceOf(RECIPIENT), recipientUSDCBalanceBefore);
        assertGe(WETH.balanceOf(RECIPIENT), recipientWETHBalanceBefore);

        // old position burned, new position minted
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0, "V3 NOT BURNT");
        assertEq(v4PositionManager.balanceOf(RECIPIENT), 1, "V4 NOT MINTED");
    }

    function test_migrate_toErc20_withPermit() public {
        MethodParameters memory params = readFixture(json, "._MIGRATE_TO_ERC20_WITH_PERMIT");

        // add the position to v3 so we have something to migrate
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0);
        // USDC < WETH
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18);
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 1);

        // pool manager balance before
        uint256 ethBalanceBefore = address(poolManager).balance;
        uint256 usdcBalanceBefore = USDC.balanceOf(address(poolManager));
        uint256 wethBalanceBefore = WETH.balanceOf(address(poolManager));

        // recipient balance before
        uint256 recipientBalanceBefore = address(RECIPIENT).balance;
        uint256 recipientUSDCBalanceBefore = USDC.balanceOf(RECIPIENT);
        uint256 recipientWETHBalanceBefore = WETH.balanceOf(RECIPIENT);

        assertEq(params.value, 0);
        vm.prank(from);
        (bool success,) = address(router).call(params.data);
        require(success, "call failed");

        // all funds were swept out of contracts
        assertEq(USDC.balanceOf(MAINNET_ROUTER), 0);
        assertEq(WETH.balanceOf(MAINNET_ROUTER), 0);
        assertEq(address(MAINNET_ROUTER).balance, 0);
        assertEq(USDC.balanceOf(address(v4PositionManager)), 0);
        assertEq(WETH.balanceOf(address(v4PositionManager)), 0);
        assertEq(address(v4PositionManager).balance, 0);

        // pool manager balance after, weth and usdc deposited
        assertEq(address(poolManager).balance, ethBalanceBefore);
        assertGt(USDC.balanceOf(address(poolManager)), usdcBalanceBefore);
        assertGt(WETH.balanceOf(address(poolManager)), wethBalanceBefore);

        // recipient balance after
        assertEq(address(RECIPIENT).balance, recipientBalanceBefore);
        assertGe(USDC.balanceOf(RECIPIENT), recipientUSDCBalanceBefore);
        assertGe(WETH.balanceOf(RECIPIENT), recipientWETHBalanceBefore);

        // old position burned, new position minted
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0, "V3 NOT BURNT");
        assertEq(v4PositionManager.balanceOf(RECIPIENT), 1, "V4 NOT MINTED");
    }

    function test_migrate_toEth_withPermitAndPoolInitialize() public {
        MethodParameters memory params = readFixture(json, "._MIGRATE_TO_ETH_WITH_PERMIT_AND_POOL_INITIALIZE");

        // add the position to v3 so we have something to migrate
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0);
        // USDC < WETH
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18);
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 1);

        // pool manager balance before
        uint256 ethBalanceBefore = address(poolManager).balance;
        uint256 usdcBalanceBefore = USDC.balanceOf(address(poolManager));
        uint256 wethBalanceBefore = WETH.balanceOf(address(poolManager));

        // recipient balance before
        uint256 recipientBalanceBefore = address(RECIPIENT).balance;
        uint256 recipientUSDCBalanceBefore = USDC.balanceOf(RECIPIENT);
        uint256 recipientWETHBalanceBefore = WETH.balanceOf(RECIPIENT);

        assertEq(params.value, 0);
        vm.prank(from);
        (bool success,) = address(router).call(params.data);
        require(success, "call failed");

        // all funds were swept out of contracts
        assertEq(USDC.balanceOf(MAINNET_ROUTER), 0);
        assertEq(WETH.balanceOf(MAINNET_ROUTER), 0);
        assertEq(address(MAINNET_ROUTER).balance, 0);
        assertEq(USDC.balanceOf(address(v4PositionManager)), 0);
        assertEq(WETH.balanceOf(address(v4PositionManager)), 0);
        assertEq(address(v4PositionManager).balance, 0);

        // pool manager balance after, eth and usdc deposited
        assertGt(address(poolManager).balance, ethBalanceBefore);
        assertGt(USDC.balanceOf(address(poolManager)), usdcBalanceBefore);
        assertEq(WETH.balanceOf(address(poolManager)), wethBalanceBefore);

        // recipient balance after
        assertEq(address(RECIPIENT).balance, recipientBalanceBefore);
        assertGe(USDC.balanceOf(RECIPIENT), recipientUSDCBalanceBefore);
        assertGe(WETH.balanceOf(RECIPIENT), recipientWETHBalanceBefore);

        // old position burned, new position minted
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0, "V3 NOT BURNT");
        assertEq(v4PositionManager.balanceOf(RECIPIENT), 1, "V4 NOT MINTED");
    }

    function test_migrate_toErc20_withPermitAndPoolInitialize() public {
        MethodParameters memory params = readFixture(json, "._MIGRATE_TO_ERC20_WITH_PERMIT_AND_POOL_INITIALIZE");

        // add the position to v3 so we have something to migrate
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0);
        // USDC < WETH
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18);
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 1);

        // pool manager balance before
        uint256 ethBalanceBefore = address(poolManager).balance;
        uint256 usdcBalanceBefore = USDC.balanceOf(address(poolManager));
        uint256 wethBalanceBefore = WETH.balanceOf(address(poolManager));

        // recipient balance before
        uint256 recipientBalanceBefore = address(RECIPIENT).balance;
        uint256 recipientUSDCBalanceBefore = USDC.balanceOf(RECIPIENT);
        uint256 recipientWETHBalanceBefore = WETH.balanceOf(RECIPIENT);

        assertEq(params.value, 0);
        vm.prank(from);
        (bool success,) = address(router).call(params.data);
        require(success, "call failed");

        // all funds were swept out of contracts
        assertEq(USDC.balanceOf(MAINNET_ROUTER), 0);
        assertEq(WETH.balanceOf(MAINNET_ROUTER), 0);
        assertEq(address(MAINNET_ROUTER).balance, 0);
        assertEq(USDC.balanceOf(address(v4PositionManager)), 0);
        assertEq(WETH.balanceOf(address(v4PositionManager)), 0);
        assertEq(address(v4PositionManager).balance, 0);

        // pool manager balance after, weth and usdc deposited
        assertEq(address(poolManager).balance, ethBalanceBefore);
        assertGt(USDC.balanceOf(address(poolManager)), usdcBalanceBefore);
        assertGt(WETH.balanceOf(address(poolManager)), wethBalanceBefore);

        // recipient balance after
        assertEq(address(RECIPIENT).balance, recipientBalanceBefore);
        assertGe(USDC.balanceOf(RECIPIENT), recipientUSDCBalanceBefore);
        assertGe(WETH.balanceOf(RECIPIENT), recipientWETHBalanceBefore);

        // old position burned, new position minted
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0, "V3 NOT BURNT");
        assertEq(v4PositionManager.balanceOf(RECIPIENT), 1, "V4 NOT MINTED");
    }
}
