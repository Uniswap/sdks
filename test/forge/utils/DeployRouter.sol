// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {console2} from "forge-std/console2.sol";
import {Test} from "forge-std/Test.sol";
import {UniversalRouter} from "universal-router/UniversalRouter.sol";
import {RouterParameters} from "universal-router/base/RouterImmutables.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {Permit2} from "permit2/src/Permit2.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";

contract DeployRouter is Test {
    address public constant LOOKS_TOKEN = 0xf4d2888d29D722226FafA5d9B24F9164c092421E;
    address public constant V2_FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    address public constant V3_FACTORY = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
    bytes32 public constant PAIR_INIT_CODE_HASH = 0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f;
    bytes32 public constant POOL_INIT_CODE_HASH = 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54;
    address public constant WETH9 = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant SEAPORT = 0x00000000006c3852cbEf3e08E8dF289169EdE581;
    address public constant NFTX_ZAP = 0x0fc584529a2AEfA997697FAfAcbA5831faC0c22d;
    address public constant X2Y2 = 0x74312363e45DCaBA76c59ec49a7Aa8A65a67EeD3;
    address public constant FOUNDATION = 0xcDA72070E455bb31C7690a170224Ce43623d0B6f;
    address public constant SUDOSWAP = 0x2B2e8cDA09bBA9660dCA5cB6233787738Ad68329;
    address public constant NFT20_ZAP = 0xA42f6cADa809Bcf417DeefbdD69C5C5A909249C0;
    address public constant CRYPTOPUNKS = 0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB;
    address public constant LOOKS_RARE = 0x59728544B08AB483533076417FbBB2fD0B17CE3a;
    address public constant ROUTER_REWARDS_DISTRIBUTOR = 0x0000000000000000000000000000000000000000;
    address public constant LOOKSRARE_REWARDS_DISTRIBUTOR = 0x0554f068365eD43dcC98dcd7Fd7A8208a5638C72;

    function deployRouterMainnetConfig() public returns (UniversalRouter router) {
        return deployRouter(address(0));
    }

    function deployFixtureMainnetConfig() public returns (UniversalRouter router, Permit2 permit2) {
        try vm.envBool("USE_MAINNET_DEPLOYMENT") returns (bool useMainnet) {
            if (useMainnet) return useMainnetDeployment();
        } catch {}
        permit2 = new Permit2();
        router = deployRouter(address(permit2));
    }

    function deployRouter(address permit2) public returns (UniversalRouter router) {
        return new UniversalRouter(
            RouterParameters({
                permit2: permit2,
                weth9: WETH9,
                seaport: SEAPORT,
                nftxZap: NFTX_ZAP,
                x2y2: X2Y2,
                foundation: FOUNDATION,
                sudoswap: SUDOSWAP,
                nft20Zap: NFT20_ZAP,
                cryptopunks: CRYPTOPUNKS,
                looksRare: LOOKS_RARE,
                routerRewardsDistributor: ROUTER_REWARDS_DISTRIBUTOR,
                looksRareRewardsDistributor: LOOKSRARE_REWARDS_DISTRIBUTOR,
                looksRareToken: LOOKS_TOKEN,
                v2Factory: V2_FACTORY,
                v3Factory: V3_FACTORY,
                pairInitCodeHash: PAIR_INIT_CODE_HASH,
                poolInitCodeHash: POOL_INIT_CODE_HASH
            })
        );
    }

    function useMainnetDeployment() public pure returns (UniversalRouter router, Permit2 permit2) {
        router = UniversalRouter(payable(0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B));
        permit2 = Permit2(0x000000000022D473030F116dDEE9F6B43aC78BA3);
    }
}
