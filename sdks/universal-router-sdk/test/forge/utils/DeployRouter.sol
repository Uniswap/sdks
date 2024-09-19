// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/console2.sol";
import {Test} from "forge-std/Test.sol";
import {UniversalRouter} from "universal-router/UniversalRouter.sol";
import {RouterParameters} from "universal-router/base/RouterImmutables.sol";
import {IPermit2} from "permit2/src/interfaces/IPermit2.sol";

contract DeployRouter is Test {
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
                v4PoolManager: V4_POOL_MANAGER_PLACEHOLDER,
                v3NFTPositionManager: V3_POSITION_MANAGER,
                v4PositionManager: V4_POSITION_MANAGER_PLACEHOLDER
            })
        );
    }

    function deployRouterAndPermit2() public {
        bytes memory bytecode = vm.readFileBinary("test/forge/bin/permit2.bin");
        assembly {
            sstore(permit2.slot, create(0, add(bytecode, 0x20), mload(bytecode)))
        }
        deployRouter(address(permit2));
        require(FORGE_ROUTER_ADDRESS == address(router));
    }
}
