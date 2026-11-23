// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BeforeSwapDelta, toBeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {DeployRouter} from "./utils/DeployRouter.sol";
import {MethodParameters, Interop} from "./utils/Interop.sol";

/// @notice A hook that takes a swap's whole exact input in `beforeSwap`, spends `SPEND_BPS` of it,
/// pays one output unit per input unit spent, and settles the input it did not spend back to the
/// swap's caller, as a hook filling from a limit-order book returns what it could not fill. The
/// pool never prices anything: the hook's delta takes the whole specified amount.
contract RemainderHook {
    uint256 public constant SPEND_BPS = 6_000;

    IPoolManager public immutable manager;

    constructor(IPoolManager manager_) {
        manager = manager_;
    }

    function beforeSwap(address sender, PoolKey calldata key, IPoolManager.SwapParams calldata params, bytes calldata)
        external
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        require(msg.sender == address(manager), "not the pool manager");
        require(params.amountSpecified < 0, "exact input only");
        uint256 input = uint256(-params.amountSpecified);
        (Currency currencyIn, Currency currencyOut) =
            params.zeroForOne ? (key.currency0, key.currency1) : (key.currency1, key.currency0);
        uint256 spent = input * SPEND_BPS / 10_000;
        // the input must already be in the pool manager: only a settle-first plan works here
        manager.take(currencyIn, address(this), input);
        _pay(currencyOut, spent);
        // the unspent input becomes a credit of the swap's caller, which its plan has to take
        manager.sync(currencyIn);
        ERC20(Currency.unwrap(currencyIn)).transfer(address(manager), input - spent);
        manager.settleFor(sender);
        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(int128(int256(input)), -int128(int256(spent))), 0);
    }

    function _pay(Currency currency, uint256 amount) internal {
        manager.sync(currency);
        ERC20(Currency.unwrap(currency)).transfer(address(manager), amount);
        manager.settle();
    }
}

/// @notice Runs the calldata the SDK encodes for a route through a hook in `settleBeforeSwapHooks` that
/// returns part of its input: the plan settles the input, swaps, takes the output and takes back the unused
/// input, which goes to the payer in the currency it paid, not to the recipient.
contract SettleBeforeSwapRemainderTest is Test, Interop, DeployRouter {
    // BEFORE_SWAP_FLAG | BEFORE_SWAP_RETURNS_DELTA_FLAG in the low bits; matches REMAINDER_HOOK in uniswapTrades.test.ts
    address constant HOOK = 0x1111111111111111111111111111111111110088;
    uint160 constant SQRT_PRICE_1_1 = 79228162514264337593543950336;
    uint256 constant BALANCE = 3000 ether;

    function setUp() public {
        fromPrivateKey = 0x1234;
        from = vm.addr(fromPrivateKey);
        string memory root = vm.projectRoot();
        json = vm.readFile(string.concat(root, "/test/forge/interop.json"));

        vm.createSelectFork(vm.envString("FORK_URL"), 16075500);
        deployV4Contracts();
        initializeV4Pools();
        // the hook keeps no storage (its pool manager is an immutable in its code), so its code can be etched at the
        // flagged address
        vm.etch(HOOK, address(new RemainderHook(poolManager)).code);
        // the pool manager holds none of the output for the hook to draw on: the hook pays it
        deal(address(DAI), HOOK, 1_000_000 ether);
        poolManager.initialize(_hookedPool(Currency.wrap(address(USDC))), SQRT_PRICE_1_1);
        poolManager.initialize(_hookedPool(Currency.wrap(address(WETH))), SQRT_PRICE_1_1);

        vm.startPrank(from);
        deployRouter();
        vm.deal(from, BALANCE);
    }

    /// @notice The hooked pool of DAI and `other`, as the SDK fixture names it.
    function _hookedPool(Currency other) internal view returns (PoolKey memory) {
        Currency dai = Currency.wrap(address(DAI));
        (Currency c0, Currency c1) = Currency.unwrap(dai) < Currency.unwrap(other) ? (dai, other) : (other, dai);
        return PoolKey(c0, c1, 0, 60, IHooks(HOOK));
    }

    function _spent(uint256 input) internal pure returns (uint256) {
        return input * 6_000 / 10_000;
    }

    function testSettleBeforeSwapHookReturnsUnspentInputToThePayer() public {
        MethodParameters memory params =
            readFixture(json, "._UNISWAP_V4_SETTLE_BEFORE_SWAP_1000_USDC_FOR_DAI_REMAINDER");
        uint256 input = 1000 * ONE_USDC;
        deal(address(USDC), from, BALANCE);
        USDC.approve(address(permit2), BALANCE);
        permit2.approve(address(USDC), address(router), uint160(BALANCE), uint48(block.timestamp + 1000));
        uint256 managerUsdc = USDC.balanceOf(address(poolManager));

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");

        // the payer pays only what the hook spent; the 400 USDC it did not spend comes back to the payer
        assertEq(USDC.balanceOf(from), BALANCE - _spent(input), "the payer paid only what the hook spent");
        assertEq(USDC.balanceOf(RECIPIENT), 0, "the recipient gets none of the payer's input");
        assertEq(DAI.balanceOf(RECIPIENT), _spent(input), "the recipient gets the output");
        assertEq(USDC.balanceOf(address(router)), 0, "nothing left on the router");
        assertEq(USDC.balanceOf(address(poolManager)), managerUsdc, "nothing left in the pool manager");
    }

    function testSettleBeforeSwapHookRefundsWrappedInputAsEthToThePayer() public {
        MethodParameters memory params = readFixture(json, "._UNISWAP_V4_SETTLE_BEFORE_SWAP_1_ETH_FOR_DAI_REMAINDER");
        uint256 input = 1 ether;
        assertEq(params.value, input);
        uint256 managerWeth = WETH.balanceOf(address(poolManager));

        (bool success,) = address(router).call{value: params.value}(params.data);
        require(success, "call failed");

        // the router wrapped the ETH and the hook returned WETH: it comes back unwrapped, to the payer
        assertEq(from.balance, BALANCE - _spent(input), "the payer paid only what the hook spent, in ETH");
        assertEq(WETH.balanceOf(from), 0, "the refund is ETH, not WETH");
        assertEq(DAI.balanceOf(RECIPIENT), _spent(input), "the recipient gets the output");
        assertEq(WETH.balanceOf(address(router)), 0, "no WETH left on the router");
        assertEq(address(router).balance, 0, "no ETH left on the router");
        assertEq(WETH.balanceOf(address(poolManager)), managerWeth, "nothing left in the pool manager");
    }
}
