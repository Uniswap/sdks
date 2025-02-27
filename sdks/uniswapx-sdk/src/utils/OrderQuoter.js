"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelayOrderQuoter = exports.UniswapXOrderQuoter = exports.OrderValidation = void 0;
const ethers_1 = require("ethers");
const constants_1 = require("../constants");
const contracts_1 = require("../contracts");
const errors_1 = require("../errors");
const validation_1 = require("../order/validation");
const NonceManager_1 = require("./NonceManager");
const multicall_1 = require("./multicall");
var OrderValidation;
(function (OrderValidation) {
    OrderValidation[OrderValidation["Expired"] = 0] = "Expired";
    OrderValidation[OrderValidation["NonceUsed"] = 1] = "NonceUsed";
    OrderValidation[OrderValidation["InsufficientFunds"] = 2] = "InsufficientFunds";
    OrderValidation[OrderValidation["InvalidSignature"] = 3] = "InvalidSignature";
    OrderValidation[OrderValidation["InvalidOrderFields"] = 4] = "InvalidOrderFields";
    OrderValidation[OrderValidation["UnknownError"] = 5] = "UnknownError";
    OrderValidation[OrderValidation["ValidationFailed"] = 6] = "ValidationFailed";
    OrderValidation[OrderValidation["ExclusivityPeriod"] = 7] = "ExclusivityPeriod";
    OrderValidation[OrderValidation["OrderNotFillableYet"] = 8] = "OrderNotFillableYet";
    OrderValidation[OrderValidation["InvalidGasPrice"] = 9] = "InvalidGasPrice";
    OrderValidation[OrderValidation["InvalidCosignature"] = 10] = "InvalidCosignature";
    OrderValidation[OrderValidation["OK"] = 11] = "OK";
})(OrderValidation || (exports.OrderValidation = OrderValidation = {}));
const BASIC_ERROR = "0x08c379a0";
const KNOWN_ERRORS = {
    "8baa579f": OrderValidation.InvalidSignature,
    "815e1d64": OrderValidation.InvalidSignature,
    "756688fe": OrderValidation.NonceUsed,
    // invalid dutch decay time
    "302e5b7c": OrderValidation.InvalidOrderFields,
    // invalid dutch decay time
    "773a6187": OrderValidation.InvalidOrderFields,
    // invalid reactor address
    "4ddf4a64": OrderValidation.InvalidOrderFields,
    // both input and output decay
    d303758b: OrderValidation.InvalidOrderFields,
    // Incorrect amounts
    "7c1f8113": OrderValidation.InvalidOrderFields,
    // invalid dutch decay time
    "43133453": OrderValidation.InvalidOrderFields,
    "48fee69c": OrderValidation.InvalidOrderFields,
    "70f65caa": OrderValidation.Expired,
    ee3b3d4b: OrderValidation.NonceUsed,
    "0a0b0d79": OrderValidation.ValidationFailed,
    b9ec1e96: OrderValidation.ExclusivityPeriod,
    "062dec56": OrderValidation.ExclusivityPeriod,
    "75c1bb14": OrderValidation.ExclusivityPeriod,
    // invalid cosigner output
    a305df82: OrderValidation.InvalidOrderFields,
    // invalid cosigner input
    ac9143e7: OrderValidation.InvalidOrderFields,
    // duplicate fee output
    fff08303: OrderValidation.InvalidOrderFields,
    // invalid cosignature
    d7815be1: OrderValidation.InvalidCosignature,
    TRANSFER_FROM_FAILED: OrderValidation.InsufficientFunds,
    // invalid fee escalation amounts
    d856fc5a: OrderValidation.InvalidOrderFields,
    // Signature expired
    cd21db4f: OrderValidation.Expired,
    // PriorityOrderReactor:InvalidDeadline() 
    "769d11e4": OrderValidation.Expired,
    // PriorityOrderReactor:OrderNotFillable()
    c6035520: OrderValidation.OrderNotFillableYet,
    // PriorityOrderReactor:InputOutputScaling()
    a6b844f5: OrderValidation.InvalidOrderFields,
    // PriorityOrderReactor:InvalidGasPrice()
    f3eb44e5: OrderValidation.InvalidGasPrice,
};
// Offchain orders have one quirk
// all reactors check expiry before anything else, so old but already filled orders will return as expired
// so this function takes orders in expired state and double checks them
async function checkTerminalStates(provider, nonceManager, orders, validations) {
    return await Promise.all(validations.map(async (validation, i) => {
        const order = orders[i];
        if (validation === OrderValidation.Expired ||
            order.order.info.deadline < Math.floor(new Date().getTime() / 1000)) {
            const maker = order.order.getSigner(order.signature);
            const cancelled = await nonceManager.isUsed(maker, order.order.info.nonce);
            return cancelled ? OrderValidation.NonceUsed : OrderValidation.Expired;
        }
        // if the order has block overrides AND order validation is OK, it is invalid if current block number is < block override
        else if (order.order.blockOverrides && order.order.blockOverrides.number && validation === OrderValidation.OK) {
            const blockNumber = await provider.getBlockNumber();
            if (blockNumber < parseInt(order.order.blockOverrides.number, 16)) {
                return OrderValidation.OrderNotFillableYet;
            }
        }
        return validation;
    }));
}
/**
 * UniswapX order quoter
 */
class UniswapXOrderQuoter {
    provider;
    chainId;
    quoter;
    constructor(provider, chainId, orderQuoterAddress) {
        this.provider = provider;
        this.chainId = chainId;
        if (orderQuoterAddress) {
            this.quoter = contracts_1.OrderQuoter__factory.connect(orderQuoterAddress, provider);
        }
        else if (constants_1.UNISWAPX_ORDER_QUOTER_MAPPING[chainId]) {
            this.quoter = contracts_1.OrderQuoter__factory.connect(constants_1.UNISWAPX_ORDER_QUOTER_MAPPING[chainId], this.provider);
        }
        else {
            throw new errors_1.MissingConfiguration("quoter", chainId.toString());
        }
    }
    async quote(order) {
        return (await this.quoteBatch([order]))[0];
    }
    async quoteBatch(orders) {
        const results = await this.getMulticallResults("quote", orders);
        const validations = await this.getValidations(orders, results);
        const quotes = results.map(({ success, returnData }) => {
            if (!success) {
                return undefined;
            }
            return this.quoter.interface.decodeFunctionResult("quote", returnData)
                .result;
        });
        return validations.map((validation, i) => {
            return {
                validation,
                quote: quotes[i],
            };
        });
    }
    async getValidations(orders, results) {
        const validations = results.map((result, idx) => {
            if (result.success) {
                return OrderValidation.OK;
            }
            else {
                let returnData = result.returnData;
                // Parse traditional string error messages
                if (returnData.startsWith(BASIC_ERROR)) {
                    returnData = new ethers_1.ethers.utils.AbiCoder().decode(["string"], "0x" + returnData.slice(10))[0];
                }
                for (const key of Object.keys(KNOWN_ERRORS)) {
                    if (returnData.includes(key)) {
                        if (key === "0a0b0d79") {
                            const fillerValidation = (0, validation_1.parseExclusiveFillerData)(orders[idx].order.info.additionalValidationData);
                            if (fillerValidation.type === validation_1.ValidationType.ExclusiveFiller &&
                                fillerValidation.data.filler !== ethers_1.ethers.constants.AddressZero) {
                                return OrderValidation.ExclusivityPeriod;
                            }
                            return OrderValidation.ValidationFailed;
                        }
                        return KNOWN_ERRORS[key];
                    }
                }
                return OrderValidation.UnknownError;
            }
        });
        return await checkTerminalStates(this.provider, new NonceManager_1.NonceManager(this.provider, this.chainId, constants_1.PERMIT2_MAPPING[this.chainId]), orders, validations);
    }
    /// Get the results of a multicall for a given function
    /// Each order with a blockOverride is multicalled separately
    async getMulticallResults(functionName, orders) {
        const ordersWithBlockOverrides = orders.filter((order) => order.order.blockOverrides);
        const promises = [];
        ordersWithBlockOverrides.map((order) => {
            promises.push((0, multicall_1.multicallSameContractManyFunctions)(this.provider, {
                address: this.quoter.address,
                contractInterface: this.quoter.interface,
                functionName: functionName,
                functionParams: [[order.order.serialize(), order.signature]],
            }, undefined, order.order.blockOverrides));
        });
        const ordersWithoutBlockOverrides = orders.filter((order) => !order.order.blockOverrides);
        const calls = ordersWithoutBlockOverrides.map((order) => {
            return [order.order.serialize(), order.signature];
        });
        promises.push((0, multicall_1.multicallSameContractManyFunctions)(this.provider, {
            address: this.quoter.address,
            contractInterface: this.quoter.interface,
            functionName: functionName,
            functionParams: calls,
        }));
        const results = await Promise.all(promises);
        return results.flat();
    }
    get orderQuoterAddress() {
        return this.quoter.address;
    }
}
exports.UniswapXOrderQuoter = UniswapXOrderQuoter;
/**
 * Relay order quoter
 */
class RelayOrderQuoter {
    provider;
    chainId;
    quoter;
    quoteFunctionSelector = "0x3f62192e"; // function execute((bytes, bytes))
    constructor(provider, chainId, reactorAddress) {
        this.provider = provider;
        this.chainId = chainId;
        if (reactorAddress) {
            this.quoter = contracts_1.RelayOrderReactor__factory.connect(reactorAddress, provider);
        }
        else if (constants_1.REACTOR_ADDRESS_MAPPING[chainId][constants_1.OrderType.Relay]) {
            this.quoter = contracts_1.RelayOrderReactor__factory.connect(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            constants_1.REACTOR_ADDRESS_MAPPING[chainId][constants_1.OrderType.Relay], this.provider);
        }
        else {
            throw new errors_1.MissingConfiguration("quoter", chainId.toString());
        }
    }
    async quote(order) {
        return (await this.quoteBatch([order]))[0];
    }
    async quoteBatch(orders) {
        const results = await this.getMulticallResults(this.quoteFunctionSelector, orders);
        const validations = await this.getValidations(orders, results);
        const quotes = results.map(
        // no return data
        ({ success }, idx) => {
            if (!success) {
                return undefined;
            }
            // TODO:
            return orders[idx].order.resolve({
                timestamp: Math.floor(new Date().getTime() / 1000),
            });
        });
        return validations.map((validation, i) => {
            return {
                validation,
                quote: quotes[i],
            };
        });
    }
    /// Get the results of a multicall for a given function
    /// Each order with a blockOverride is multicalled separately
    async getMulticallResults(functionName, orders) {
        const ordersWithBlockOverrides = orders.filter((order) => order.order.blockOverrides);
        const promises = [];
        ordersWithBlockOverrides.map((order) => {
            promises.push((0, multicall_1.multicallSameContractManyFunctions)(this.provider, {
                address: this.quoter.address,
                contractInterface: this.quoter.interface,
                functionName: functionName,
                functionParams: [
                    [
                        {
                            order: order.order.serialize(),
                            sig: order.signature,
                        },
                    ],
                ],
            }, undefined, order.order.blockOverrides));
        });
        const ordersWithoutBlockOverrides = orders.filter((order) => !order.order.blockOverrides);
        const calls = ordersWithoutBlockOverrides.map((order) => {
            return [
                {
                    order: order.order.serialize(),
                    sig: order.signature,
                },
            ];
        });
        promises.push((0, multicall_1.multicallSameContractManyFunctions)(this.provider, {
            address: this.quoter.address,
            contractInterface: this.quoter.interface,
            functionName: functionName,
            functionParams: calls,
        }));
        const results = await Promise.all(promises);
        return results.flat();
    }
    async getValidations(orders, results) {
        const validations = results.map((result) => {
            if (result.success) {
                return OrderValidation.OK;
            }
            else {
                let returnData = result.returnData;
                // Parse traditional string error messages
                if (returnData.startsWith(BASIC_ERROR)) {
                    returnData = new ethers_1.ethers.utils.AbiCoder().decode(["string"], "0x" + returnData.slice(10))[0];
                }
                for (const key of Object.keys(KNOWN_ERRORS)) {
                    if (returnData.includes(key)) {
                        return KNOWN_ERRORS[key];
                    }
                }
                return OrderValidation.UnknownError;
            }
        });
        return await checkTerminalStates(this.provider, new NonceManager_1.NonceManager(this.provider, this.chainId, constants_1.PERMIT2_MAPPING[this.chainId]), orders, validations);
    }
    get orderQuoterAddress() {
        return this.quoter.address;
    }
}
exports.RelayOrderQuoter = RelayOrderQuoter;
//# sourceMappingURL=OrderQuoter.js.map