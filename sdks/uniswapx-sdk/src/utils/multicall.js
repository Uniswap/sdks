"use strict";
// Uses deployless multicall to fetch responses and errors for multiple calls at once
// https://github.com/Destiner/deployless-multicall
Object.defineProperty(exports, "__esModule", { value: true });
exports.multicallSameContractManyFunctions = multicallSameContractManyFunctions;
exports.multicallSameFunctionManyContracts = multicallSameFunctionManyContracts;
exports.multicall = multicall;
const tslib_1 = require("tslib");
const abi_1 = require("@ethersproject/abi");
const bytes_1 = require("@ethersproject/bytes");
const ethers_1 = require("ethers");
const deploylessMulticall2_json_1 = tslib_1.__importDefault(require("../../abis/deploylessMulticall2.json"));
const multicall2_json_1 = tslib_1.__importDefault(require("../../abis/multicall2.json"));
const constants_1 = require("../constants");
const contracts_1 = require("../contracts");
const DEPLOYLESS_MULTICALL_BYTECODE = "0x608060405234801561001057600080fd5b5060405161087538038061087583398181016040528101906100329190610666565b6000815167ffffffffffffffff81111561004f5761004e610358565b5b60405190808252806020026020018201604052801561008857816020015b6100756102da565b81526020019060019003908161006d5790505b50905060005b82518110156101d3576000808483815181106100ad576100ac6106c2565b5b60200260200101516000015173ffffffffffffffffffffffffffffffffffffffff168584815181106100e2576100e16106c2565b5b6020026020010151602001516040516100fb9190610738565b6000604051808303816000865af19150503d8060008114610138576040519150601f19603f3d011682016040523d82523d6000602084013e61013d565b606091505b509150915085156101895781610188576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161017f906107d2565b60405180910390fd5b5b60405180604001604052808315158152602001828152508484815181106101b3576101b26106c2565b5b6020026020010181905250505080806101cb9061082b565b91505061008e565b50602081516040028260405103030160408160405103036001835111156102535760005b8351811015610251578060200260208501018160200260400183018261021f57855160200281525b6000831115610244576020808303510151602083510151038060208303510180835250505b50506001810190506101f7565b505b60005b8351811015610281578060200260208501018051516040602083510151035250600181019050610256565b5060005b83518110156102ae57806020026020850101604060208083510151035250600181019050610285565b506001835114156102cb5760208301604082018451602002815250505b60208152825160208201528181f35b6040518060400160405280600015158152602001606081525090565b6000604051905090565b600080fd5b600080fd5b60008115159050919050565b61031f8161030a565b811461032a57600080fd5b50565b60008151905061033c81610316565b92915050565b600080fd5b6000601f19601f8301169050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b61039082610347565b810181811067ffffffffffffffff821117156103af576103ae610358565b5b80604052505050565b60006103c26102f6565b90506103ce8282610387565b919050565b600067ffffffffffffffff8211156103ee576103ed610358565b5b602082029050602081019050919050565b600080fd5b600080fd5b600080fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006104398261040e565b9050919050565b6104498161042e565b811461045457600080fd5b50565b60008151905061046681610440565b92915050565b600080fd5b600067ffffffffffffffff82111561048c5761048b610358565b5b61049582610347565b9050602081019050919050565b60005b838110156104c05780820151818401526020810190506104a5565b838111156104cf576000848401525b50505050565b60006104e86104e384610471565b6103b8565b9050828152602081018484840111156105045761050361046c565b5b61050f8482856104a2565b509392505050565b600082601f83011261052c5761052b610342565b5b815161053c8482602086016104d5565b91505092915050565b60006040828403121561055b5761055a610404565b5b61056560406103b8565b9050600061057584828501610457565b600083015250602082015167ffffffffffffffff81111561059957610598610409565b5b6105a584828501610517565b60208301525092915050565b60006105c46105bf846103d3565b6103b8565b905080838252602082019050602084028301858111156105e7576105e66103ff565b5b835b8181101561062e57805167ffffffffffffffff81111561060c5761060b610342565b5b8086016106198982610545565b855260208501945050506020810190506105e9565b5050509392505050565b600082601f83011261064d5761064c610342565b5b815161065d8482602086016105b1565b91505092915050565b6000806040838503121561067d5761067c610300565b5b600061068b8582860161032d565b925050602083015167ffffffffffffffff8111156106ac576106ab610305565b5b6106b885828601610638565b9150509250929050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052603260045260246000fd5b600081519050919050565b600081905092915050565b6000610712826106f1565b61071c81856106fc565b935061072c8185602086016104a2565b80840191505092915050565b60006107448284610707565b915081905092915050565b600082825260208201905092915050565b7f4d756c746963616c6c32206167677265676174653a2063616c6c206661696c6560008201527f6400000000000000000000000000000000000000000000000000000000000000602082015250565b60006107bc60218361074f565b91506107c782610760565b604082019050919050565b600060208201905081810360008301526107eb816107af565b9050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601160045260246000fd5b6000819050919050565b600061083682610821565b91507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff821415610869576108686107f2565b5b60018201905091905056fe";
// Perform multiple on-chain calls in a single http request
// return all results including errors
// Uses deployless method to function properly even on chains with no multicall contract deployed
async function multicallSameContractManyFunctions(provider, params, stateOverrrides, blockOverrides) {
    const { address, contractInterface, functionName, functionParams } = params;
    const fragment = contractInterface.getFunction(functionName);
    const calls = functionParams.map((functionParam) => {
        const callData = contractInterface.encodeFunctionData(fragment, functionParam);
        return {
            target: address,
            callData,
        };
    });
    return multicall(provider, calls, stateOverrrides, blockOverrides);
}
async function multicallSameFunctionManyContracts(provider, params, stateOverrrides, blockOverrides) {
    const { addresses, contractInterface, functionName, functionParam } = params;
    const fragment = contractInterface.getFunction(functionName);
    const callData = contractInterface.encodeFunctionData(fragment, functionParam);
    const calls = addresses.map((address) => {
        return {
            target: address,
            callData,
        };
    });
    return multicall(provider, calls, stateOverrrides, blockOverrides);
}
async function multicall(provider, calls, stateOverrides, blockOverrides) {
    const chainId = (await provider.getNetwork()).chainId;
    const code = await provider.getCode((0, constants_1.multicallAddressOn)(chainId));
    let response;
    if (code.length > 2) {
        const multicall = contracts_1.Multicall2__factory.connect((0, constants_1.multicallAddressOn)(chainId), provider);
        const params = [
            {
                from: ethers_1.ethers.constants.AddressZero,
                to: multicall.address,
                data: multicall.interface.encodeFunctionData("tryAggregate", [false, calls]),
            },
            'latest',
            (stateOverrides ? stateOverrides : {}),
        ];
        if (blockOverrides)
            params.push(blockOverrides);
        response = await provider.send("eth_call", params);
    }
    else {
        const deploylessInterface = new abi_1.Interface(deploylessMulticall2_json_1.default);
        const args = deploylessInterface.encodeDeploy([false, calls]);
        const data = (0, bytes_1.hexConcat)([DEPLOYLESS_MULTICALL_BYTECODE, args]);
        const params = [
            {
                from: ethers_1.ethers.constants.AddressZero,
                to: ethers_1.ethers.constants.AddressZero,
                data,
            },
            'latest',
            (stateOverrides ? stateOverrides : {}),
        ];
        if (blockOverrides)
            params.push(blockOverrides);
        response = await provider.send("eth_call", params);
    }
    const multicallInterface = new abi_1.Interface(multicall2_json_1.default);
    return multicallInterface.decodeFunctionResult("tryAggregate", response)
        .returnData;
}
//# sourceMappingURL=multicall.js.map