// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Test, stdJson, console2} from "forge-std/Test.sol";
import {ISignatureTransfer} from "../permit2/src/interfaces/ISignatureTransfer.sol";
import {IAllowanceTransfer} from "../permit2/src/interfaces/IAllowanceTransfer.sol";
import {PermitHash} from "../permit2/src/libraries/PermitHash.sol";

interface IPermit2 is ISignatureTransfer, IAllowanceTransfer {}

contract PermitHashConstants {
    function _PERMIT_TYPEHASH() external pure returns (bytes32) {
        return PermitHash._PERMIT_TYPEHASH;
    }

    function _PERMIT_BATCH_TYPEHASH() external pure returns (bytes32) {
        return PermitHash._PERMIT_BATCH_TYPEHASH;
    }

    function _PERMIT_TRANSFER_FROM_TYPEHASH() external pure returns (bytes32) {
        return PermitHash._PERMIT_TRANSFER_FROM_TYPEHASH;
    }

    function _PERMIT_BATCH_TRANSFER_FROM_TYPEHASH() external pure returns (bytes32) {
        return PermitHash._PERMIT_BATCH_TRANSFER_FROM_TYPEHASH;
    }

    function _PERMIT_TRANSFER_FROM_WITNESS_TYPEHASH_STUB() external pure returns (string memory) {
        return PermitHash._PERMIT_TRANSFER_FROM_WITNESS_TYPEHASH_STUB;
    }

    function _PERMIT_BATCH_WITNESS_TRANSFER_FROM_TYPEHASH_STUB() external pure returns (string memory) {
        return PermitHash._PERMIT_BATCH_WITNESS_TRANSFER_FROM_TYPEHASH_STUB;
    }
}

contract AllowanceTransferTest is Test {
    using stdJson for string;

    address from;
    uint256 fromPrivateKey;
    PermitHashConstants permitHashConstants;
    IPermit2 permit2;
    string json;

    function setUp() public {
        fromPrivateKey = 0x1234;
        from = vm.addr(fromPrivateKey);
        permitHashConstants = new PermitHashConstants();
        string memory root = vm.projectRoot();
        permit2 = IPermit2(deployCode(string.concat(root, "/permit2/out/Permit2.sol/Permit2.json")));
        json = vm.readFile(string.concat(root, "/test/interop.json"));
    }

    function testConstants() public {
        assertEq(json.readBytes32("._PERMIT_TYPEHASH"), permitHashConstants._PERMIT_TYPEHASH());
        assertEq(json.readBytes32("._PERMIT_BATCH_TYPEHASH"), permitHashConstants._PERMIT_BATCH_TYPEHASH());
        assertEq(
            json.readBytes32("._PERMIT_TRANSFER_FROM_TYPEHASH"), permitHashConstants._PERMIT_TRANSFER_FROM_TYPEHASH()
        );
        assertEq(
            json.readBytes32("._PERMIT_BATCH_TRANSFER_FROM_TYPEHASH"),
            permitHashConstants._PERMIT_BATCH_TRANSFER_FROM_TYPEHASH()
        );
        assertEq(
            json.readString("._PERMIT_TRANSFER_FROM_WITNESS_TYPEHASH_STUB"),
            permitHashConstants._PERMIT_TRANSFER_FROM_WITNESS_TYPEHASH_STUB()
        );
        assertEq(
            json.readString("._PERMIT_BATCH_WITNESS_TRANSFER_FROM_TYPEHASH_STUB"),
            permitHashConstants._PERMIT_BATCH_WITNESS_TRANSFER_FROM_TYPEHASH_STUB()
        );
    }
}
