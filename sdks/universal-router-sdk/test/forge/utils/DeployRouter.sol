// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {console2} from "forge-std/console2.sol";
import {Test} from "forge-std/Test.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {UniversalRouter} from "universal-router/UniversalRouter.sol";
import {PoolManager} from "v4-core/PoolManager.sol";
import {IERC20Minimal} from "v4-core/interfaces/external/IERC20Minimal.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {RouterParameters} from "universal-router/base/RouterImmutables.sol";
import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";

contract DeployRouter is Test {
    using PoolIdLibrary for PoolKey;

    address public constant V2_FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    address public constant V3_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
    bytes32 public constant PAIR_INIT_CODE_HASH = 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f;
    bytes32 public constant POOL_INIT_CODE_HASH = 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54;
    address public constant WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant V4_POOL_MANAGER_PLACEHOLDER = 0x4444444444444444444444444444444444444444;
    address public constant V4_POSITION_MANAGER_PLACEHOLDER = 0x4444444444444444400000000000000000000000;
    address public constant V3_POSITION_MANAGER = 0xC36442b4a4522E871399CD717aBDD847Ab11FE88;

    address internal constant RECIPIENT = 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa;
    address internal constant FEE_RECIPIENT = 0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB;
    address internal constant MAINNET_PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    address internal constant FORGE_ROUTER_ADDRESS = 0xE808C1cfeebb6cb36B537B82FA7c9EEf31415a05;

    UniversalRouter public router;
    IPermit2 public permit2;
    IPoolManager public poolManager;

    address from;
    uint256 fromPrivateKey;
    string json;

    function deployRouter(address _permit2) public {
        router = new UniversalRouter(
            RouterParameters({
                permit2: _permit2,
                weth9: WETH9,
                v2Factory: V2_FACTORY,
                v3Factory: V3_FACTORY,
                pairInitCodeHash: PAIR_INIT_CODE_HASH,
                poolInitCodeHash: POOL_INIT_CODE_HASH,
                v4PoolManager: address(poolManager),
                v3NFTPositionManager: V3_POSITION_MANAGER,
                v4PositionManager: V4_POSITION_MANAGER_PLACEHOLDER
            })
        );
    }

    function deployRouterAndPermit2() public {
        bytes memory bytecode = vm.readFileBinary("test/forge/bin/permit2.bin");
        assembly ("memory-safe") {
            sstore(permit2.slot, create(0, add(bytecode, 0x20), mload(bytecode)))
        }
        deployRouter(address(permit2));
        require(FORGE_ROUTER_ADDRESS == address(router), "Invalid Router Address");
    }

    ////////////////////////////////////////////////////////////////
    //////////////////////// V4 SETUP //////////////////////////////
    ////////////////////////////////////////////////////////////////

    function deployV4Contracts() public {
        poolManager = new PoolManager();
    }

    function initializeV4Pools(ERC20 WETH, ERC20 USDC, ERC20 DAI) public {
        Currency eth = Currency.wrap(address(0));
        Currency weth = Currency.wrap(address(WETH));
        Currency usdc = Currency.wrap(address(USDC));
        Currency dai = Currency.wrap(address(DAI));

        uint256 amount = 10000 ether;

        deal(address(USDC), address(this), amount);
        USDC.approve(address(poolManager), amount);

        deal(address(WETH), address(this), amount);
        WETH.approve(address(poolManager), amount);

        deal(address(DAI), address(this), amount);
        DAI.approve(address(poolManager), amount);

        vm.deal(address(this), amount * 2);

        poolManager.unlock(
            abi.encode(
                [
                    PoolKey(eth, usdc, 3000, 60, IHooks(address(0))),
                    PoolKey(dai, usdc, 3000, 60, IHooks(address(0))),
                    PoolKey(usdc, weth, 3000, 60, IHooks(address(0)))
                ]
            )
        );
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        PoolKey[3] memory poolKeys = abi.decode(data, (PoolKey[3]));

        for (uint256 i = 0; i < poolKeys.length; i++) {
            PoolKey memory poolKey = poolKeys[i];
            poolManager.initialize(poolKey, 79228162514264337593543950336, bytes(""));

            (BalanceDelta delta, BalanceDelta feesAccrued) = poolManager.modifyLiquidity(
                poolKey,
                IPoolManager.ModifyLiquidityParams({
                    tickLower: -60,
                    tickUpper: 60,
                    liquidityDelta: 1000000 ether,
                    salt: 0
                }),
                bytes("")
            );

            settle(poolKey.currency0, uint256((uint128(-delta.amount0()))));
            settle(poolKey.currency1, uint256((uint128(-delta.amount1()))));
        }
    }

    function settle(Currency currency, uint256 amount) internal {
        if (currency.isAddressZero()) {
            poolManager.settle{value: amount}();
        } else {
            poolManager.sync(currency);
            IERC20Minimal(Currency.unwrap(currency)).transfer(address(poolManager), amount);
            poolManager.settle();
        }
    }
}
