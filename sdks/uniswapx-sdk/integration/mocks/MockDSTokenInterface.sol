// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockDSTokenInterface {
    uint256 private responseCode;
    string private responseReason;

    function setPreTransferCheckResponse(uint256 code, string memory reason) external {
        responseCode = code;
        responseReason = reason;
    }

    function preTransferCheck(address from, address to, uint256 value) 
        external 
        view 
        returns (uint256, string memory) 
    {
        return (responseCode, responseReason);
    }
}
