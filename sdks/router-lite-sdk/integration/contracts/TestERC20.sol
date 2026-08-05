// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * Minimal permissionlessly-mintable ERC20 for the fork harness. Deliberately NOT audited-grade: it
 * exists so `worldBuilder` can conjure a currency with arbitrary supply on a fork, nothing else.
 * `mint` is open (any caller) because the harness mints to traders and pools freely.
 */
contract TestERC20 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        return true;
    }

    /// Overridden by the fee-on-transfer variant; the base moves the full amount.
    function _transfer(address from, address to, uint256 amount) internal virtual {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

/**
 * Fee-on-transfer variant: every `transfer`/`transferFrom` skims `feeBps` basis points of the moved
 * amount into the token contract itself, so the recipient always receives strictly less than the
 * amount the sender named. This is the shape that breaks naive quoting (quoted-out != received).
 */
contract TestFeeOnTransferERC20 is TestERC20 {
    uint256 public immutable feeBps;

    constructor(string memory name_, string memory symbol_, uint256 feeBps_) TestERC20(name_, symbol_) {
        require(feeBps_ < 10_000, "fee too high");
        feeBps = feeBps_;
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        uint256 fee = (amount * feeBps) / 10_000;
        balanceOf[from] -= amount;
        balanceOf[to] += amount - fee;
        if (fee > 0) {
            balanceOf[address(this)] += fee;
            emit Transfer(from, address(this), fee);
        }
        emit Transfer(from, to, amount - fee);
    }
}
