// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, stdJson} from "forge-std/Test.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {UniversalRouter} from "universal-router/UniversalRouter.sol";
import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";
import {DeployRouter} from "./utils/DeployRouter.sol";
import {MethodParameters, Interop} from "./utils/Interop.sol";
import {INonfungiblePositionManager} from "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";

import "forge-std/console2.sol";

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
        // USDC < WETH (USDC is token0, WETH is token1)
        // in range v3 position, tickLower = 200040, tickUpper = 300000, tickCurrent = 205265
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18, 200040, 300000);
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 1);

        // approve the UniversalRouter to access the position (instead of permit)
        vm.startPrank(from);
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
        // USDC < WETH (USDC is token0, WETH is token1)
        // in range v3 position, tickLower = 200040, tickUpper = 300000, tickCurrent = 205265
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18, 200040, 300000);
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
        // USDC < WETH (USDC is token0, WETH is token1)
        // in range v3 position, tickLower = 200040, tickUpper = 300000, tickCurrent = 205265
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18, 200040, 300000);
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
        // USDC < WETH (USDC is token0, WETH is token1)
        // in range v3 position, tickLower = 200040, tickUpper = 300000, tickCurrent = 205265
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18, 200040, 300000);
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
        // USDC < WETH (USDC is token0, WETH is token1)
        // in range v3 position, tickLower = 200040, tickUpper = 300000, tickCurrent = 205265
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18, 200040, 300000);
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
        // USDC < WETH (USDC is token0, WETH is token1)
        // in range v3 position, tickLower = 200040, tickUpper = 300000, tickCurrent = 205265
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18, 200040, 300000);
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

    function test_migrate_v3OutOfRangeIn0_to_v4InRange() public {
        MethodParameters memory params = readFixture(json, "._MIGRATE_V3RANGE0_TO_V4INRANGE");

        // add the position to v3 so we have something to migrate
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0);
        // USDC < WETH (USDC is token0, WETH is token1)
        // above range v3 position in USDC, tickLower = 205320, tickUpper = 300000, tickCurrent = 205265
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18, 205320, 300000);
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 1);

        // pool manager balance before
        uint256 ethBalanceBefore = address(poolManager).balance;
        uint256 usdcBalanceBefore = USDC.balanceOf(address(poolManager));
        uint256 wethBalanceBefore = WETH.balanceOf(address(poolManager));

        // recipient balance before
        uint256 recipientBalanceBefore = address(RECIPIENT).balance;
        uint256 recipientUSDCBalanceBefore = USDC.balanceOf(RECIPIENT);
        uint256 recipientWETHBalanceBefore = WETH.balanceOf(RECIPIENT);

        // approve the UniversalRouter to access the position (instead of permit)
        vm.prank(from);
        INonfungiblePositionManager(V3_POSITION_MANAGER).setApprovalForAll(MAINNET_ROUTER, true);

        assertEq(params.value, 0);
        WETH.transfer(from, WETH.balanceOf(address(this)));
        // approve permit2 to spend WETH
        vm.startPrank(from);
        WETH.approve(MAINNET_PERMIT2, WETH.balanceOf(from));

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

    function test_migrate_v3OutOfRangeIn0_to_v4OutOfRangeIn1() public {
        MethodParameters memory params = readFixture(json, "._MIGRATE_V3RANGE0_TO_V4RANGE1");

        // add the position to v3 so we have something to migrate
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0);
        // USDC < WETH (USDC is token0, WETH is token1)
        // above range v3 position in USDC, tickLower = 205320, tickUpper = 300000, tickCurrent = 205265
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18, 205320, 300000);
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 1);

        // pool manager balance before
        uint256 ethBalanceBefore = address(poolManager).balance;
        uint256 usdcBalanceBefore = USDC.balanceOf(address(poolManager));
        uint256 wethBalanceBefore = WETH.balanceOf(address(poolManager));

        // recipient balance before
        uint256 recipientBalanceBefore = address(RECIPIENT).balance;
        uint256 recipientUSDCBalanceBefore = USDC.balanceOf(RECIPIENT);
        uint256 recipientWETHBalanceBefore = WETH.balanceOf(RECIPIENT);

        // approve the UniversalRouter to access the position (instead of permit)
        vm.prank(from);
        INonfungiblePositionManager(V3_POSITION_MANAGER).setApprovalForAll(MAINNET_ROUTER, true);

        assertEq(params.value, 0);
        WETH.transfer(from, WETH.balanceOf(address(this)));
        // approve permit2 to spend WETH
        vm.startPrank(from);
        WETH.approve(MAINNET_PERMIT2, WETH.balanceOf(from));

        (bool success,) = address(router).call(params.data);
        require(success, "call failed");

        // all funds were swept out of contracts
        assertEq(USDC.balanceOf(MAINNET_ROUTER), 0);
        assertEq(WETH.balanceOf(MAINNET_ROUTER), 0);
        assertEq(address(MAINNET_ROUTER).balance, 0);
        assertEq(USDC.balanceOf(address(v4PositionManager)), 0);
        assertEq(WETH.balanceOf(address(v4PositionManager)), 0);
        assertEq(address(v4PositionManager).balance, 0);

        // pool manager balance after, weth deposited
        assertEq(address(poolManager).balance, ethBalanceBefore);
        assertEq(USDC.balanceOf(address(poolManager)), usdcBalanceBefore);
        assertGt(WETH.balanceOf(address(poolManager)), wethBalanceBefore);

        // recipient balance after
        assertEq(address(RECIPIENT).balance, recipientBalanceBefore);
        assertGt(USDC.balanceOf(RECIPIENT), recipientUSDCBalanceBefore);
        assertGe(WETH.balanceOf(RECIPIENT), recipientWETHBalanceBefore);

        // old position burned, new position minted
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0, "V3 NOT BURNT");
        assertEq(v4PositionManager.balanceOf(RECIPIENT), 1, "V4 NOT MINTED");
    }

    function test_migrate_v3OutOfRangeIn0_to_v4OutOfRangeIn0() public {
        MethodParameters memory params = readFixture(json, "._MIGRATE_V3RANGE0_TO_V4RANGE0");

        // add the position to v3 so we have something to migrate
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0);
        // USDC < WETH (USDC is token0, WETH is token1)
        // above range v3 position in USDC, tickLower = 205320, tickUpper = 300000, tickCurrent = 205265
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18, 205320, 300000);
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 1);

        // pool manager balance before
        uint256 ethBalanceBefore = address(poolManager).balance;
        uint256 usdcBalanceBefore = USDC.balanceOf(address(poolManager));
        uint256 wethBalanceBefore = WETH.balanceOf(address(poolManager));

        // recipient balance before
        uint256 recipientBalanceBefore = address(RECIPIENT).balance;
        uint256 recipientUSDCBalanceBefore = USDC.balanceOf(RECIPIENT);
        uint256 recipientWETHBalanceBefore = WETH.balanceOf(RECIPIENT);

        // approve the UniversalRouter to access the position (instead of permit)
        vm.startPrank(from);
        INonfungiblePositionManager(V3_POSITION_MANAGER).setApprovalForAll(MAINNET_ROUTER, true);

        assertEq(params.value, 0);

        (bool success,) = address(router).call(params.data);
        require(success, "call failed");

        // all funds were swept out of contracts
        assertEq(USDC.balanceOf(MAINNET_ROUTER), 0);
        assertEq(WETH.balanceOf(MAINNET_ROUTER), 0);
        assertEq(address(MAINNET_ROUTER).balance, 0);
        assertEq(USDC.balanceOf(address(v4PositionManager)), 0);
        assertEq(WETH.balanceOf(address(v4PositionManager)), 0);
        assertEq(address(v4PositionManager).balance, 0);

        // pool manager balance after, usdc deposited
        assertEq(address(poolManager).balance, ethBalanceBefore);
        assertGt(USDC.balanceOf(address(poolManager)), usdcBalanceBefore);
        assertEq(WETH.balanceOf(address(poolManager)), wethBalanceBefore);

        // recipient balance after
        assertEq(address(RECIPIENT).balance, recipientBalanceBefore);
        assertGe(USDC.balanceOf(RECIPIENT), recipientUSDCBalanceBefore);
        assertEq(WETH.balanceOf(RECIPIENT), recipientWETHBalanceBefore);

        // old position burned, new position minted
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0, "V3 NOT BURNT");
        assertEq(v4PositionManager.balanceOf(RECIPIENT), 1, "V4 NOT MINTED");
    }

    function test_migrate_v3OutOfRangeInUSDC_to_v4OutOfRangeInETH() public {
        MethodParameters memory params = readFixture(json, "._MIGRATE_V3RANGE_USDC_TO_V4RANGE_ETH");

        // add the position to v3 so we have something to migrate
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0);
        // USDC < WETH (USDC is token0, WETH is token1)
        // above range v3 position in USDC, tickLower = 205320, tickUpper = 300000, tickCurrent = 205265
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18, 205320, 300000);
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 1);

        // pool manager balance before
        uint256 ethBalanceBefore = address(poolManager).balance;
        uint256 usdcBalanceBefore = USDC.balanceOf(address(poolManager));
        uint256 wethBalanceBefore = WETH.balanceOf(address(poolManager));

        // recipient balance before
        uint256 recipientBalanceBefore = address(RECIPIENT).balance;
        uint256 recipientUSDCBalanceBefore = USDC.balanceOf(RECIPIENT);
        uint256 recipientWETHBalanceBefore = WETH.balanceOf(RECIPIENT);

        // approve the UniversalRouter to access the position (instead of permit)
        vm.startPrank(from);
        INonfungiblePositionManager(V3_POSITION_MANAGER).setApprovalForAll(MAINNET_ROUTER, true);

        assertEq(params.value, 9000000000000000000);

        console2.log("from balance is ", address(from).balance);

        // (bool success,) = address(router).call(params.data);
        // require(success, "call failed");

        // // all funds were swept out of contracts
        // assertEq(USDC.balanceOf(MAINNET_ROUTER), 0);
        // assertEq(WETH.balanceOf(MAINNET_ROUTER), 0);
        // assertEq(address(MAINNET_ROUTER).balance, 0);
        // assertEq(USDC.balanceOf(address(v4PositionManager)), 0);
        // assertEq(WETH.balanceOf(address(v4PositionManager)), 0);
        // assertEq(address(v4PositionManager).balance, 0);

        // // pool manager balance after, usdc deposited
        // assertEq(address(poolManager).balance, ethBalanceBefore);
        // assertGt(USDC.balanceOf(address(poolManager)), usdcBalanceBefore);
        // assertEq(WETH.balanceOf(address(poolManager)), wethBalanceBefore);

        // // recipient balance after
        // assertEq(address(RECIPIENT).balance, recipientBalanceBefore);
        // assertGe(USDC.balanceOf(RECIPIENT), recipientUSDCBalanceBefore);
        // assertEq(WETH.balanceOf(RECIPIENT), recipientWETHBalanceBefore);

        // // old position burned, new position minted
        // assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0, "V3 NOT BURNT");
        // assertEq(v4PositionManager.balanceOf(RECIPIENT), 1, "V4 NOT MINTED");
    }

    function test_migrate_v3OutOfRangeIn1_v4InRange() public {
        MethodParameters memory params = readFixture(json, "._MIGRATE_V3RANGE1_TO_V4INRANGE");

        // add the position to v3 so we have something to migrate
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0);
        // USDC < WETH (USDC is token0, WETH is token1)
        // below range v3 position in WETH, tickLower = 204720, tickUpper = 204960, tickCurrent = 205265
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18, 204720, 204960);
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 1);

        // pool manager balance before
        uint256 ethBalanceBefore = address(poolManager).balance;
        uint256 usdcBalanceBefore = USDC.balanceOf(address(poolManager));
        uint256 wethBalanceBefore = WETH.balanceOf(address(poolManager));

        // recipient balance before
        uint256 recipientBalanceBefore = address(RECIPIENT).balance;
        uint256 recipientUSDCBalanceBefore = USDC.balanceOf(RECIPIENT);
        uint256 recipientWETHBalanceBefore = WETH.balanceOf(RECIPIENT);

        // approve the UniversalRouter to access the position (instead of permit)
        vm.prank(from);
        INonfungiblePositionManager(V3_POSITION_MANAGER).setApprovalForAll(MAINNET_ROUTER, true);

        assertEq(params.value, 0);
        USDC.transfer(from, USDC.balanceOf(address(this)));
        // approve the universal router on permit2 to spend USDC
        vm.startPrank(from);
        USDC.approve(MAINNET_PERMIT2, USDC.balanceOf(from));

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

    function test_migrate_v3OutOfRangeIn1_v4OutOfRangeIn0() public {
        MethodParameters memory params = readFixture(json, "._MIGRATE_V3RANGE1_TO_V4RANGE0");

        // add the position to v3 so we have something to migrate
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0);
        // USDC < WETH (USDC is token0, WETH is token1)
        // below range v3 position in WETH, tickLower = 204720, tickUpper = 204960, tickCurrent = 205265
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18, 204720, 204960);
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 1);

        // pool manager balance before
        uint256 ethBalanceBefore = address(poolManager).balance;
        uint256 usdcBalanceBefore = USDC.balanceOf(address(poolManager));
        uint256 wethBalanceBefore = WETH.balanceOf(address(poolManager));

        // recipient balance before
        uint256 recipientBalanceBefore = address(RECIPIENT).balance;
        uint256 recipientUSDCBalanceBefore = USDC.balanceOf(RECIPIENT);
        uint256 recipientWETHBalanceBefore = WETH.balanceOf(RECIPIENT);

        // approve the UniversalRouter to access the position (instead of permit)
        vm.prank(from);
        INonfungiblePositionManager(V3_POSITION_MANAGER).setApprovalForAll(MAINNET_ROUTER, true);

        assertEq(params.value, 0);
        USDC.transfer(from, USDC.balanceOf(address(this)));
        // approve the universal router on permit2 to spend USDC
        vm.startPrank(from);
        USDC.approve(MAINNET_PERMIT2, USDC.balanceOf(from));

        (bool success,) = address(router).call(params.data);
        require(success, "call failed");

        // all funds were swept out of contracts
        assertEq(USDC.balanceOf(MAINNET_ROUTER), 0);
        assertEq(WETH.balanceOf(MAINNET_ROUTER), 0);
        assertEq(address(MAINNET_ROUTER).balance, 0);
        assertEq(USDC.balanceOf(address(v4PositionManager)), 0);
        assertEq(WETH.balanceOf(address(v4PositionManager)), 0);
        assertEq(address(v4PositionManager).balance, 0);

        // pool manager balance after, usdc deposited
        assertEq(address(poolManager).balance, ethBalanceBefore);
        assertGt(USDC.balanceOf(address(poolManager)), usdcBalanceBefore);
        assertEq(WETH.balanceOf(address(poolManager)), wethBalanceBefore);

        // recipient balance after
        assertEq(address(RECIPIENT).balance, recipientBalanceBefore);
        assertGe(USDC.balanceOf(RECIPIENT), recipientUSDCBalanceBefore);
        assertGt(WETH.balanceOf(RECIPIENT), recipientWETHBalanceBefore);

        // old position burned, new position minted
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0, "V3 NOT BURNT");
        assertEq(v4PositionManager.balanceOf(RECIPIENT), 1, "V4 NOT MINTED");
    }

    function test_migrate_v3OutOfRangeIn1_v4OutOfRangeIn1() public {
        MethodParameters memory params = readFixture(json, "._MIGRATE_V3RANGE1_TO_V4RANGE1");

        // add the position to v3 so we have something to migrate
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0);
        // USDC < WETH (USDC is token0, WETH is token1)
        // below range v3 position in WETH, tickLower = 204720, tickUpper = 204960, tickCurrent = 205265
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18, 204720, 204960);
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 1);

        // pool manager balance before
        uint256 ethBalanceBefore = address(poolManager).balance;
        uint256 usdcBalanceBefore = USDC.balanceOf(address(poolManager));
        uint256 wethBalanceBefore = WETH.balanceOf(address(poolManager));

        // recipient balance before
        uint256 recipientBalanceBefore = address(RECIPIENT).balance;
        uint256 recipientUSDCBalanceBefore = USDC.balanceOf(RECIPIENT);
        uint256 recipientWETHBalanceBefore = WETH.balanceOf(RECIPIENT);

        // approve the UniversalRouter to access the position (instead of permit)
        vm.startPrank(from);
        INonfungiblePositionManager(V3_POSITION_MANAGER).setApprovalForAll(MAINNET_ROUTER, true);

        assertEq(params.value, 0);

        (bool success,) = address(router).call(params.data);
        require(success, "call failed");

        // all funds were swept out of contracts
        assertEq(USDC.balanceOf(MAINNET_ROUTER), 0);
        assertEq(WETH.balanceOf(MAINNET_ROUTER), 0);
        assertEq(address(MAINNET_ROUTER).balance, 0);
        assertEq(USDC.balanceOf(address(v4PositionManager)), 0);
        assertEq(WETH.balanceOf(address(v4PositionManager)), 0);
        assertEq(address(v4PositionManager).balance, 0);

        // pool manager balance after, weth deposited
        assertEq(address(poolManager).balance, ethBalanceBefore);
        assertEq(USDC.balanceOf(address(poolManager)), usdcBalanceBefore);
        assertGt(WETH.balanceOf(address(poolManager)), wethBalanceBefore);

        // recipient balance after
        assertEq(address(RECIPIENT).balance, recipientBalanceBefore);
        assertEq(USDC.balanceOf(RECIPIENT), recipientUSDCBalanceBefore);
        assertGe(WETH.balanceOf(RECIPIENT), recipientWETHBalanceBefore);

        // old position burned, new position minted
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0, "V3 NOT BURNT");
        assertEq(v4PositionManager.balanceOf(RECIPIENT), 1, "V4 NOT MINTED");
    }

    function test_migrate_v3OutOfRangeInWETH_to_v4OutOfRangeInETH() public {
        MethodParameters memory params = readFixture(json, "._MIGRATE_V3RANGE_WETH_TO_V4RANGE_ETH");

        // add the position to v3 so we have something to migrate
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0);
        // USDC < WETH (USDC is token0, WETH is token1)
        // below range v3 position in WETH, tickLower = 204720, tickUpper = 204960, tickCurrent = 205265
        mintV3Position(address(USDC), address(WETH), 3000, 2500e6, 1e18, 204720, 204960);
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 1);

        // pool manager balance before
        uint256 ethBalanceBefore = address(poolManager).balance;
        uint256 usdcBalanceBefore = USDC.balanceOf(address(poolManager));
        uint256 wethBalanceBefore = WETH.balanceOf(address(poolManager));

        // recipient balance before
        uint256 recipientBalanceBefore = address(RECIPIENT).balance;
        uint256 recipientUSDCBalanceBefore = USDC.balanceOf(RECIPIENT);
        uint256 recipientWETHBalanceBefore = WETH.balanceOf(RECIPIENT);

        // approve the UniversalRouter to access the position (instead of permit)
        vm.startPrank(from);
        INonfungiblePositionManager(V3_POSITION_MANAGER).setApprovalForAll(MAINNET_ROUTER, true);

        assertEq(params.value, 0);

        (bool success,) = address(router).call(params.data);
        require(success, "call failed");

        // all funds were swept out of contracts
        assertEq(USDC.balanceOf(MAINNET_ROUTER), 0);
        assertEq(WETH.balanceOf(MAINNET_ROUTER), 0);
        assertEq(address(MAINNET_ROUTER).balance, 0);
        assertEq(USDC.balanceOf(address(v4PositionManager)), 0);
        assertEq(WETH.balanceOf(address(v4PositionManager)), 0);
        assertEq(address(v4PositionManager).balance, 0);

        // pool manager balance after, eth deposited
        assertGt(address(poolManager).balance, ethBalanceBefore);
        assertEq(USDC.balanceOf(address(poolManager)), usdcBalanceBefore);
        assertEq(WETH.balanceOf(address(poolManager)), wethBalanceBefore);

        // recipient balance after
        assertEq(address(RECIPIENT).balance, recipientBalanceBefore);
        assertEq(USDC.balanceOf(RECIPIENT), recipientUSDCBalanceBefore);
        assertGe(WETH.balanceOf(RECIPIENT), recipientWETHBalanceBefore);

        // old position burned, new position minted
        assertEq(INonfungiblePositionManager(V3_POSITION_MANAGER).balanceOf(from), 0, "V3 NOT BURNT");
        assertEq(v4PositionManager.balanceOf(RECIPIENT), 1, "V4 NOT MINTED");
    }
}
