"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MPS = exports.BPS = exports.REVERSE_REACTOR_MAPPING = exports.RELAY_SENTINEL_RECIPIENT = exports.multicallAddressOn = exports.REACTOR_CONTRACT_MAPPING = exports.REACTOR_ADDRESS_MAPPING = exports.OrderType = exports.KNOWN_EVENT_SIGNATURES = exports.EXCLUSIVE_FILLER_VALIDATION_MAPPING = exports.UNISWAPX_ORDER_QUOTER_MAPPING = exports.PERMIT2_MAPPING = void 0;
exports.constructSameAddressMap = constructSameAddressMap;
const sdk_core_1 = require("@uniswap/sdk-core");
const ethers_1 = require("ethers");
const NETWORKS_WITH_SAME_ADDRESS = [
    sdk_core_1.ChainId.MAINNET,
    sdk_core_1.ChainId.GOERLI,
    sdk_core_1.ChainId.POLYGON,
    sdk_core_1.ChainId.BASE,
    sdk_core_1.ChainId.UNICHAIN,
];
function constructSameAddressMap(address, additionalNetworks = []) {
    return NETWORKS_WITH_SAME_ADDRESS.concat(additionalNetworks).reduce((memo, chainId) => {
        memo[chainId] = address;
        return memo;
    }, {});
}
exports.PERMIT2_MAPPING = {
    ...constructSameAddressMap("0x000000000022d473030f116ddee9f6b43ac78ba3", [11155111, 42161]),
    12341234: "0x000000000022d473030f116ddee9f6b43ac78ba3",
};
exports.UNISWAPX_ORDER_QUOTER_MAPPING = {
    ...constructSameAddressMap("0x54539967a06Fc0E3C3ED0ee320Eb67362D13C5fF"),
    11155111: "0xAA6187C48096e093c37d2cF178B1e8534A6934f7",
    42161: "0x88440407634F89873c5D9439987Ac4BE9725fea8",
    12341234: "0xbea0901A41177811b099F787D753436b2c47690E",
    8453: "0x88440407634f89873c5d9439987ac4be9725fea8",
    130: "0x88440407634F89873c5D9439987Ac4BE9725fea8",
};
exports.EXCLUSIVE_FILLER_VALIDATION_MAPPING = {
    ...constructSameAddressMap("0x8A66A74e15544db9688B68B06E116f5d19e5dF90"),
    5: "0x0000000000000000000000000000000000000000",
    11155111: "0x0000000000000000000000000000000000000000",
    42161: "0x0000000000000000000000000000000000000000",
    12341234: "0x8A66A74e15544db9688B68B06E116f5d19e5dF90",
};
var KNOWN_EVENT_SIGNATURES;
(function (KNOWN_EVENT_SIGNATURES) {
    KNOWN_EVENT_SIGNATURES["ERC20_TRANSFER"] = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
})(KNOWN_EVENT_SIGNATURES || (exports.KNOWN_EVENT_SIGNATURES = KNOWN_EVENT_SIGNATURES = {}));
var OrderType;
(function (OrderType) {
    OrderType["Dutch"] = "Dutch";
    OrderType["Relay"] = "Relay";
    OrderType["Dutch_V2"] = "Dutch_V2";
    OrderType["Dutch_V3"] = "Dutch_V3";
    OrderType["Limit"] = "Limit";
    OrderType["Priority"] = "Priority";
})(OrderType || (exports.OrderType = OrderType = {}));
exports.REACTOR_ADDRESS_MAPPING = {
    ...constructSameAddressMap({
        [OrderType.Dutch]: "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4",
        [OrderType.Dutch_V2]: "0x0000000000000000000000000000000000000000",
        [OrderType.Relay]: "0x0000000000A4e21E2597DCac987455c48b12edBF",
    }),
    //test contract is only on mainnet
    1: {
        [OrderType.Dutch]: "0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4",
        [OrderType.Dutch_V2]: "0x00000011F84B9aa48e5f8aA8B9897600006289Be",
        [OrderType.Priority]: "0x0000000000000000000000000000000000000000",
        [OrderType.Relay]: "0x0000000000A4e21E2597DCac987455c48b12edBF",
    },
    12341234: {
        [OrderType.Dutch]: "0xbD7F9D0239f81C94b728d827a87b9864972661eC",
        [OrderType.Dutch_V2]: "0x0000000000000000000000000000000000000000",
        [OrderType.Relay]: "0x0000000000A4e21E2597DCac987455c48b12edBF",
    },
    11155111: {
        [OrderType.Dutch_V2]: "0x0e22B6638161A89533940Db590E67A52474bEBcd",
        [OrderType.Dutch]: "0xD6c073F2A3b676B8f9002b276B618e0d8bA84Fad",
        [OrderType.Relay]: "0x0000000000A4e21E2597DCac987455c48b12edBF",
    },
    42161: {
        [OrderType.Dutch_V2]: "0x1bd1aAdc9E230626C44a139d7E70d842749351eb",
        [OrderType.Dutch]: "0x0000000000000000000000000000000000000000",
        [OrderType.Relay]: "0x0000000000000000000000000000000000000000",
        [OrderType.Dutch_V3]: "0xB274d5F4b833b61B340b654d600A864fB604a87c",
    },
    8453: {
        [OrderType.Dutch]: "0x0000000000000000000000000000000000000000",
        [OrderType.Dutch_V2]: "0x0000000000000000000000000000000000000000",
        [OrderType.Relay]: "0x0000000000000000000000000000000000000000",
        [OrderType.Priority]: "0x000000001Ec5656dcdB24D90DFa42742738De729",
    },
    130: {
        [OrderType.Dutch]: "0x0000000000000000000000000000000000000000",
        [OrderType.Dutch_V2]: "0x0000000000000000000000000000000000000000",
        [OrderType.Relay]: "0x0000000000000000000000000000000000000000",
        [OrderType.Priority]: "0x00000006021a6Bce796be7ba509BBBA71e956e37",
    },
};
// aliasing for backwards compatibility
exports.REACTOR_CONTRACT_MAPPING = exports.REACTOR_ADDRESS_MAPPING;
// https://github.com/mds1/multicall
const multicallAddressOn = (chainId = 1) => {
    switch (chainId) {
        // multicall3 is deployed to a different address on zksync than all other EVM chains
        // due to differences in create2 address derivation
        // deployment address from: https://github.com/mds1/multicall/blob/d7b62458c99c650ce1efa7464ffad69d2059ad56/deployments.json#L927
        case 324:
            return "0xF9cda624FBC7e059355ce98a31693d299FACd963";
        default:
            return "0xcA11bde05977b3631167028862bE2a173976CA11";
    }
};
exports.multicallAddressOn = multicallAddressOn;
exports.RELAY_SENTINEL_RECIPIENT = "0x0000000000000000000000000000000000000000";
exports.REVERSE_REACTOR_MAPPING = Object.entries(exports.REACTOR_ADDRESS_MAPPING
// eslint-disable-next-line @typescript-eslint/no-unused-vars
).reduce((acc, [_, orderTypes]) => {
    for (const [orderType, reactorAddress] of Object.entries(orderTypes)) {
        // lowercase for consistency when parsing orders
        acc[reactorAddress.toLowerCase()] = {
            orderType: OrderType[orderType],
        };
    }
    return acc;
}, {});
exports.BPS = 10000;
exports.MPS = ethers_1.BigNumber.from(10).pow(7);
//# sourceMappingURL=constants.js.map