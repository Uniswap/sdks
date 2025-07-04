// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockSuperstateTokenV4 {
    mapping(address => bool) private allowed;

    function setIsAllowed(address addr, bool value) external {
        allowed[addr] = value;
    }

    function isAllowed(address addr) external view returns (bool) {
        return allowed[addr];
    }
}
