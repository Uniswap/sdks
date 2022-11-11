// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import {Router} from "narwhal/Router.sol";
import {Permit2} from "permit2/src/Permit2.sol";

contract DeployRouter is Test {
    address public constant LOOKS_TOKEN = 0xf4d2888d29D722226FafA5d9B24F9164c092421E;
    address public constant V2_FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    address public constant V3_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
    bytes32 public constant PAIR_INIT_CODE_HASH = 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f;
    bytes32 public constant POOL_INIT_CODE_HASH = 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54;

    function deployRouterMainnetConfig() public returns (Router router) {
        return new Router(
            address(0), // TODO: update with permit2 address
            address(0), // TODO: update with routerRewardsDistributor
            address(0), // TODO: update with looksRareRewardsDistributor
            address(LOOKS_TOKEN),
            address(V2_FACTORY),
            address(V3_FACTORY),
            PAIR_INIT_CODE_HASH,
            POOL_INIT_CODE_HASH
        );
    }
    
}
