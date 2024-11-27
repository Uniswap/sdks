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
    this._checkAddress(address)
    return {
      beforeInitialize: this._hasPermission(address, HookOptions.BeforeInitialize),
      afterInitialize: this._hasPermission(address, HookOptions.AfterInitialize),
      beforeAddLiquidity: this._hasPermission(address, HookOptions.BeforeAddLiquidity),
      afterAddLiquidity: this._hasPermission(address, HookOptions.AfterAddLiquidity),
      beforeRemoveLiquidity: this._hasPermission(address, HookOptions.BeforeRemoveLiquidity),
      afterRemoveLiquidity: this._hasPermission(address, HookOptions.AfterRemoveLiquidity),
      beforeSwap: this._hasPermission(address, HookOptions.BeforeSwap),
      afterSwap: this._hasPermission(address, HookOptions.AfterSwap),
      beforeDonate: this._hasPermission(address, HookOptions.BeforeDonate),
      afterDonate: this._hasPermission(address, HookOptions.AfterDonate),
      beforeSwapReturnsDelta: this._hasPermission(address, HookOptions.BeforeSwapReturnsDelta),
      afterSwapReturnsDelta: this._hasPermission(address, HookOptions.AfterSwapReturnsDelta),
      afterAddLiquidityReturnsDelta: this._hasPermission(address, HookOptions.AfterAddLiquidityReturnsDelta),
      afterRemoveLiquidityReturnsDelta: this._hasPermission(address, HookOptions.AfterRemoveLiquidityReturnsDelta),
    }
  }

  public static hasPermission(address: string, hookOption: HookOptions) {
    this._checkAddress(address)
    return this._hasPermission(address, hookOption)
  }

  public static hasInitializePermissions(address: string) {
    this._checkAddress(address)
    return (
      this._hasPermission(address, HookOptions.BeforeInitialize) ||
      Hook._hasPermission(address, HookOptions.AfterInitialize)
    )
  }

  public static hasLiquidityPermissions(address: string) {
    this._checkAddress(address)
    // this implicitly encapsulates liquidity delta permissions
    return (
      this._hasPermission(address, HookOptions.BeforeAddLiquidity) ||
      Hook._hasPermission(address, HookOptions.AfterAddLiquidity) ||
      Hook._hasPermission(address, HookOptions.BeforeRemoveLiquidity) ||
      Hook._hasPermission(address, HookOptions.AfterRemoveLiquidity)
    )
  }

  public static hasSwapPermissions(address: string) {
    this._checkAddress(address)
    // this implicitly encapsulates swap delta permissions
    return this._hasPermission(address, HookOptions.BeforeSwap) || Hook._hasPermission(address, HookOptions.AfterSwap)
  }

  public static hasDonatePermissions(address: string) {
    this._checkAddress(address)
    return (
      this._hasPermission(address, HookOptions.BeforeDonate) || Hook._hasPermission(address, HookOptions.AfterDonate)
    )
  }

  private static _hasPermission(address: string, hookOption: HookOptions) {
    return !!(parseInt(address, 16) & (1 << hookFlagIndex[hookOption]))
  }

  private static _checkAddress(address: string) {
    invariant(isAddress(address), 'invalid address')
  }
}
