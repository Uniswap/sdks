import invariant from 'tiny-invariant'
import { isAddress } from 'ethers/lib/utils'

export type HookPermissions = { [key in HookOptions]: boolean }

export enum HookOptions {
  AfterRemoveLiquidityReturnsDelta = 'afterRemoveLiquidityReturnsDelta',
  AfterAddLiquidityReturnsDelta = 'afterAddLiquidityReturnsDelta',
  AfterSwapReturnsDelta = 'afterSwapReturnsDelta',
  BeforeSwapReturnsDelta = 'beforeSwapReturnsDelta',
  AfterDonate = 'afterDonate',
  BeforeDonate = 'beforeDonate',
  AfterSwap = 'afterSwap',
  BeforeSwap = 'beforeSwap',
  AfterRemoveLiquidity = 'afterRemoveLiquidity',
  BeforeRemoveLiquidity = 'beforeRemoveLiquidity',
  AfterAddLiquidity = 'afterAddLiquidity',
  BeforeAddLiquidity = 'beforeAddLiquidity',
  AfterInitialize = 'afterInitialize',
  BeforeInitialize = 'beforeInitialize',
}

export const hookFlagIndex = {
  [HookOptions.AfterRemoveLiquidityReturnsDelta]: 0,
  [HookOptions.AfterAddLiquidityReturnsDelta]: 1,
  [HookOptions.AfterSwapReturnsDelta]: 2,
  [HookOptions.BeforeSwapReturnsDelta]: 3,
  [HookOptions.AfterDonate]: 4,
  [HookOptions.BeforeDonate]: 5,
  [HookOptions.AfterSwap]: 6,
  [HookOptions.BeforeSwap]: 7,
  [HookOptions.AfterRemoveLiquidity]: 8,
  [HookOptions.BeforeRemoveLiquidity]: 9,
  [HookOptions.AfterAddLiquidity]: 10,
  [HookOptions.BeforeAddLiquidity]: 11,
  [HookOptions.AfterInitialize]: 12,
  [HookOptions.BeforeInitialize]: 13,
}

export class Hook {
  public static permissions(address: string): HookPermissions {
    invariant(isAddress(address), 'invalid address')
    // addresses with and without the '0x' prefix are considered valid but we must remove the 0x prefix to normalize
    // all addresses in order to slice the last 14 bits representing hook flags
    if (/0x/.test(address)) address = address.slice(2)

    return {
      beforeInitialize: this.hasPermission(address, HookOptions.BeforeInitialize),
      afterInitialize: this.hasPermission(address, HookOptions.AfterInitialize),
      beforeAddLiquidity: this.hasPermission(address, HookOptions.BeforeAddLiquidity),
      afterAddLiquidity: this.hasPermission(address, HookOptions.AfterAddLiquidity),
      beforeRemoveLiquidity: this.hasPermission(address, HookOptions.BeforeRemoveLiquidity),
      afterRemoveLiquidity: this.hasPermission(address, HookOptions.AfterRemoveLiquidity),
      beforeSwap: this.hasPermission(address, HookOptions.BeforeSwap),
      afterSwap: this.hasPermission(address, HookOptions.AfterSwap),
      beforeDonate: this.hasPermission(address, HookOptions.BeforeDonate),
      afterDonate: this.hasPermission(address, HookOptions.AfterDonate),
      beforeSwapReturnsDelta: this.hasPermission(address, HookOptions.BeforeSwapReturnsDelta),
      afterSwapReturnsDelta: this.hasPermission(address, HookOptions.AfterSwapReturnsDelta),
      afterAddLiquidityReturnsDelta: this.hasPermission(address, HookOptions.AfterAddLiquidityReturnsDelta),
      afterRemoveLiquidityReturnsDelta: this.hasPermission(address, HookOptions.AfterRemoveLiquidityReturnsDelta),
    }
  }

  private static hasPermission(address: string, hookOption: HookOptions) {
    // slice only the last 14 bits which are the hook flags and compare with the specific hookOption
    return !!(parseInt(address.slice(36), 16) & (1 << hookFlagIndex[hookOption]))
  }
}
