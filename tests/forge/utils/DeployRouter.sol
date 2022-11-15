// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {console2} from "forge-std/console2.sol";
import {Test} from "forge-std/Test.sol";
import {Router} from "narwhal/Router.sol";
import {ERC20} from "solmate/tokens/ERC20.sol";
import {Permit2} from "permit2/src/Permit2.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

contract DeployRouter is Test {
    address public constant LOOKS_TOKEN = 0xf4d2888d29D722226FafA5d9B24F9164c092421E;
    address public constant V2_FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    address public constant V3_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
    bytes32 public constant PAIR_INIT_CODE_HASH = 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f;
    bytes32 public constant POOL_INIT_CODE_HASH = 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54;

    function deployRouterMainnetConfig() public returns (Router router) {
        return new Router(
            IAllowanceTransfer(address(0)), // TODO: update with permit2 address
            address(0), // TODO: update with routerRewardsDistributor
            address(0), // TODO: update with looksRareRewardsDistributor
            ERC20(LOOKS_TOKEN),
            address(V2_FACTORY),
            address(V3_FACTORY),
            PAIR_INIT_CODE_HASH,
            POOL_INIT_CODE_HASH
        );
    }

    function deployFixtureMainnetConfig() public returns (Router router, Permit2 permit2) {
        try vm.envBool("USE_MAINNET_DEPLOYMENT") returns (bool useMainnet) {
            if (useMainnet) return useMainnetDeployment();
        } catch {
            permit2 = new Permit2();
            router = new Router(
                    IAllowanceTransfer(permit2),
                    address(0), // TODO: update with routerRewardsDistributor
                    address(0), // TODO: update with looksRareRewardsDistributor
                    ERC20(LOOKS_TOKEN),
                    address(V2_FACTORY),
                    address(V3_FACTORY),
                    PAIR_INIT_CODE_HASH,
                    POOL_INIT_CODE_HASH
                    );
        }
    }

    function useMainnetDeployment() public pure returns (Router router, Permit2 permit2) {
        router = Router(payable(0x5393904db506415D941726f3Cf0404Bb167537A0));
        permit2 = Permit2(0x6fEe9BeC3B3fc8f9DA5740f0efc6BbE6966cd6A6);
    }
}
