// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "solmate/src/tokens/ERC20.sol";

/// @notice ERC-20 that burns `feeBips` of every transfer, so the receiver gets less than the sender sent.
contract MockFeeOnTransferERC20 is ERC20 {
    uint256 public immutable feeBips;

    constructor(uint256 _feeBips) ERC20("FeeOnTransfer", "FOT", 18) {
        feeBips = _feeBips;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        uint256 fee = (amount * feeBips) / 10_000;
        _burn(msg.sender, fee);
        return super.transfer(to, amount - fee);
    }

    function transferFrom(address owner, address to, uint256 amount) public override returns (bool) {
        uint256 fee = (amount * feeBips) / 10_000;
        _burn(owner, fee);
        return super.transferFrom(owner, to, amount - fee);
    }
}
