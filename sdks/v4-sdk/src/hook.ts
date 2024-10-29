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
    invariant(isAddress(address), 'invalid address')
    return this._hasPermission(address, hookOption)
  }

  private static _hasPermission(address: string, hookOption: HookOptions) {
    return !!(parseInt(address, 16) & (1 << hookFlagIndex[hookOption]))
  }
}
