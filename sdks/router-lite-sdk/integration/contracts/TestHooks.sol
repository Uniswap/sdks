// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

// ---------------------------------------------------------------------------
// Test hooks for the anvil fork harness.
//
// These are compiled ONCE (see ../artifacts/contracts.json) and installed at
// test time with `anvil_setCode` — never deployed by a constructor. That is
// deliberate: v4 encodes a hook's permissions in the LOW 14 BITS OF ITS
// ADDRESS, so the harness must choose the address, which rules out ordinary
// CREATE deployment (and rules out constructors/immutables — configurable
// state lives in an explicit storage slot written with `anvil_setStorageAt`).
//
// Address flag bits (v4-core `Hooks.sol`):
//   1<<13 beforeInitialize   1<<12 afterInitialize
//   1<<11 beforeAddLiquidity 1<<10 afterAddLiquidity
//   1<<9  beforeRemoveLiquidity 1<<8 afterRemoveLiquidity
//   1<<7  beforeSwap         1<<6  afterSwap
//   1<<5  beforeDonate       1<<4  afterDonate
//   1<<3  beforeSwapReturnsDelta   1<<2 afterSwapReturnsDelta
//   1<<1  afterAddLiquidityReturnsDelta  1<<0 afterRemoveLiquidityReturnsDelta
//
// Note there is no "zero-permission hook": `Hooks.isValidHookAddress` rejects a
// non-zero hook address with no flags on a static-fee pool, so the "none"
// behavior is a PASS-THROUGH beforeSwap hook (flag 0x80) rather than a hook
// with no flags at all.
//
// The v4-core structs are mirrored here rather than imported so the harness has
// no solidity dependency graph — only the ABI shapes matter, and they are
// pinned by the `IHooks` selectors the PoolManager validates against.
// ---------------------------------------------------------------------------

/// Mirror of v4-core `PoolKey` (Currency/IHooks are user-defined value types over `address`).
struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

/// Mirror of v4-core `SwapParams`.
struct SwapParams {
    bool zeroForOne;
    int256 amountSpecified;
    uint160 sqrtPriceLimitX96;
}

/**
 * The two v4-core hook entrypoints these contracts implement. Only used for its `.selector`
 * constants: the PoolManager compares the first 4 bytes of the hook's return data against exactly
 * these, so the signatures must stay byte-identical to v4-core's `IHooks`.
 */
interface IHooks {
    function beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata hookData)
        external
        returns (bytes4, int256, uint24);

    function afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        int256 delta,
        bytes calldata hookData
    ) external returns (bytes4, int128);
}

/// The single PoolManager method the fee hook needs (`Currency` ABI-encodes as `address`).
interface IPoolManager {
    function take(address currency, address to, uint256 amount) external;
}

/**
 * `none` — a real hook contract attached to the pool that changes nothing.
 * Required flags: beforeSwap (0x80).
 */
contract NoopHook {
    function beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        external
        pure
        returns (bytes4, int256, uint24)
    {
        return (IHooks.beforeSwap.selector, int256(0), uint24(0));
    }
}

/**
 * `revert-on-swap` — initializes and accepts liquidity, then reverts every swap. Models a pool that
 * looks routable from discovery (it emits `Initialize`) but can never execute.
 * Required flags: beforeSwap (0x80).
 */
contract RevertOnSwapHook {
    error SwapBlocked();

    function beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        external
        pure
        returns (bytes4, int256, uint24)
    {
        revert SwapBlocked();
    }
}

/**
 * `revert-if-sender-not` — reverts unless the PoolManager's caller (`sender`, i.e. the router
 * contract, NOT the trader EOA) equals `allowedSender`.
 *
 * `allowedSender` MUST occupy storage slot 0: the harness installs this contract with
 * `anvil_setCode`, which does not run constructors, and then writes the allowed address with
 * `anvil_setStorageAt(hook, 0x0, addr)`.
 * Required flags: beforeSwap (0x80).
 */
contract SenderGateHook {
    address public allowedSender; // slot 0 — written via anvil_setStorageAt

    error SenderNotAllowed(address sender);

    function beforeSwap(address sender, PoolKey calldata, SwapParams calldata, bytes calldata)
        external
        view
        returns (bytes4, int256, uint24)
    {
        if (sender != allowedSender) revert SenderNotAllowed(sender);
        return (IHooks.beforeSwap.selector, int256(0), uint24(0));
    }
}

/**
 * `skim-fee-bps-30` — takes 0.30% of the swap's UNSPECIFIED amount for itself via the
 * afterSwap-returns-delta path, so the trader receives measurably less than the pool's own quote.
 * Required flags: afterSwap (0x40) | afterSwapReturnsDelta (0x04) = 0x44.
 *
 * Accounting (v4-core `PoolManager.swap`): the hook `take`s the fee first, which debits the hook by
 * `fee`; the manager then credits the hook by the returned `+fee`, netting the hook's delta to zero
 * while `swapperDelta -= hookDelta` shrinks the trader's output by the same amount.
 */
contract SkimFeeHook {
    uint256 internal constant FEE_BPS = 30;

    receive() external payable {}

    function afterSwap(address, PoolKey calldata key, SwapParams calldata params, int256 delta, bytes calldata)
        external
        returns (bytes4, int128)
    {
        // v4-core: the unspecified side is currency1 iff (exactInput == zeroForOne).
        bool unspecifiedIsOne = (params.amountSpecified < 0) == params.zeroForOne;
        // BalanceDelta packs amount0 in the high 128 bits and amount1 in the low 128 bits.
        int128 unspecified = unspecifiedIsOne ? int128(delta) : int128(delta >> 128);
        if (unspecified <= 0) return (IHooks.afterSwap.selector, int128(0));

        uint256 fee = (uint256(uint128(unspecified)) * FEE_BPS) / 10_000;
        if (fee == 0) return (IHooks.afterSwap.selector, int128(0));

        address currency = unspecifiedIsOne ? key.currency1 : key.currency0;
        IPoolManager(msg.sender).take(currency, address(this), fee);
        return (IHooks.afterSwap.selector, int128(uint128(fee)));
    }
}
