// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Test, stdJson, console2} from "forge-std/Test.sol";
import {ISignatureTransfer} from "../permit2/src/interfaces/ISignatureTransfer.sol";
import {IAllowanceTransfer} from "../permit2/src/interfaces/IAllowanceTransfer.sol";
import {Permit2} from "../permit2/src/Permit2.sol";
import {IAllowanceTransfer} from "../permit2/src/interfaces/IAllowanceTransfer.sol";
import {PermitHash} from "../permit2/src/libraries/PermitHash.sol";

contract Permit2Test is Test {
    using stdJson for string;

    address constant SPENDER_ADDRESS = address(1);
    address constant TOKEN_ADDRESS = address(2);
    uint48 constant EXPIRATION = 10000000000000;

    address from;
    uint256 fromPrivateKey;
    Permit2 permit2;
    string json;

    function setUp() public {
        fromPrivateKey = 0x1234;
        from = vm.addr(fromPrivateKey);
        string memory root = vm.projectRoot();
        permit2 = new Permit2{salt: 0x00}();
        json = vm.readFile(string.concat(root, "/test/interop.json"));
    }

    function testPermitHash() public {
        bytes32 msgHash = json.readBytes32("._PERMIT_HASH");
        permit2.permit(
            from,
            IAllowanceTransfer.PermitSingle({
                details: IAllowanceTransfer.PermitDetails({
                    token: TOKEN_ADDRESS,
                    amount: 0,
                    expiration: EXPIRATION,
                    nonce: 0
                }),
                spender: SPENDER_ADDRESS,
                sigDeadline: EXPIRATION
            }),
            sign(msgHash)
        );
    }

    function sign(bytes32 msgHash) public returns (bytes memory sig) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(fromPrivateKey, msgHash);
        return bytes.concat(r, s, bytes1(v));
    }
}
