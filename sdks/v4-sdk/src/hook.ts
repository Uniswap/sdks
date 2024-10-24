import invariant from 'tiny-invariant'
import { isAddress } from 'ethers/lib/utils'

export type HookPermissions = {
  beforeInitialize: boolean
  afterInitialize: boolean
  beforeAddLiquidity: boolean
  afterAddLiquidity: boolean
  beforeRemoveLiquidity: boolean
  afterRemoveLiquidity: boolean
  beforeSwap: boolean
  afterSwap: boolean
  beforeDonate: boolean
  afterDonate: boolean
  beforeSwapReturnsDelta: boolean
  afterSwapReturnsDelta: boolean
  afterAddLiquidityReturnsDelta: boolean
  afterRemoveLiquidityReturnsDelta: boolean
}

export enum HookOptions {
  AfterRemoveLiquidityReturnsDelta,
  AfterAddLiquidityReturnsDelta,
  AfterSwapReturnsDelta,
  BeforeSwapReturnsDelta,
  AfterDonate,
  BeforeDonate,
  AfterSwap,
  BeforeSwap,
  AfterRemoveLiquidity,
  BeforeRemoveLiquidity,
  AfterAddLiquidity,
  BeforeAddLiquidity,
  AfterInitialize,
  BeforeInitialize,
}

export class Hook {
  public static permissions(address: string): HookPermissions {
    invariant(isAddress(address), 'invalid address')
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

  private static hasPermission(address: string, permissionIndex: HookOptions) {
    return !!(parseInt(address.slice(36), 16) & (1 << permissionIndex))
  }
}
