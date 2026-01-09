import { Hook, HookOptions, hookFlagIndex } from './hook'

export function constructHookAddress(hookOptions: HookOptions[]): string {
  let hookFlags = 0
  for (const hookOption of hookOptions) {
    hookFlags = hookFlags | (1 << hookFlagIndex[hookOption])
  }

  const addressFlag = hookFlags.toString(16)
  return `0x${'0'.repeat(40 - addressFlag.length)}${addressFlag}`
}

describe('Hook', () => {
  const allHooksAddress = '0x0000000000000000000000000000000000003fff'
  const emptyHookAddress = '0x0000000000000000000000000000000000000000'
  const hookBeforeInitialize = constructHookAddress([HookOptions.BeforeInitialize])
  const hookAfterInitialize = constructHookAddress([HookOptions.AfterInitialize])
  const hookBeforeAddLiquidity = constructHookAddress([HookOptions.BeforeAddLiquidity])
  const hookAfterAddLiquidity = constructHookAddress([HookOptions.AfterAddLiquidity])
  const hookBeforeRemoveLiquidity = constructHookAddress([HookOptions.BeforeRemoveLiquidity])
  const hookAfterRemoveLiquidity = constructHookAddress([HookOptions.AfterRemoveLiquidity])
  const hookBeforeSwap = constructHookAddress([HookOptions.BeforeSwap])
  const hookAfterSwap = constructHookAddress([HookOptions.AfterSwap])
  const hookBeforeDonate = constructHookAddress([HookOptions.BeforeDonate])
  const hookAfterDonate = constructHookAddress([HookOptions.AfterDonate])
  const hookBeforeSwapReturnsDelta = constructHookAddress([HookOptions.BeforeSwapReturnsDelta])
  const hookAfterSwapReturnsDelta = constructHookAddress([HookOptions.AfterSwapReturnsDelta])
  const hookAfterAddLiquidityReturnsDelta = constructHookAddress([HookOptions.AfterAddLiquidityReturnsDelta])
  const hookAfterRemoveLiquidityReturnsDelta = constructHookAddress([HookOptions.AfterRemoveLiquidityReturnsDelta])

  describe('permissions', () => {
    it('throws for an invalid address', () => {
      expect(() => Hook.permissions('0x123')).toThrow('Invariant failed: invalid address')
    })

    it('works if address has no 0x prefix', () => {
      expect(Hook.permissions(hookBeforeInitialize.slice(2)).beforeInitialize).toEqual(true)
    })

    it('returns the correct results for beforeInitialize', () => {
      expect(Hook.permissions(hookBeforeInitialize).beforeInitialize).toEqual(true)
      expect(Hook.permissions(allHooksAddress).beforeInitialize).toEqual(true)
      expect(Hook.permissions(hookAfterInitialize).beforeInitialize).toEqual(false)
      expect(Hook.permissions(emptyHookAddress).beforeInitialize).toEqual(false)
    })

    it('returns the correct results for afterInitialize', () => {
      expect(Hook.permissions(hookAfterInitialize).afterInitialize).toEqual(true)
      expect(Hook.permissions(allHooksAddress).afterInitialize).toEqual(true)
      expect(Hook.permissions(hookBeforeInitialize).afterInitialize).toEqual(false)
      expect(Hook.permissions(hookBeforeAddLiquidity).afterInitialize).toEqual(false)
      expect(Hook.permissions(emptyHookAddress).afterInitialize).toEqual(false)
    })

    it('returns the correct results for beforeAddLiquidity', () => {
      expect(Hook.permissions(hookBeforeAddLiquidity).beforeAddLiquidity).toEqual(true)
      expect(Hook.permissions(allHooksAddress).beforeAddLiquidity).toEqual(true)
      expect(Hook.permissions(hookBeforeInitialize).beforeAddLiquidity).toEqual(false)
      expect(Hook.permissions(hookAfterAddLiquidity).beforeAddLiquidity).toEqual(false)
      expect(Hook.permissions(emptyHookAddress).beforeAddLiquidity).toEqual(false)
    })

    it('returns the correct results for afterAddLiquidity', () => {
      expect(Hook.permissions(hookAfterAddLiquidity).afterAddLiquidity).toEqual(true)
      expect(Hook.permissions(allHooksAddress).afterAddLiquidity).toEqual(true)
      expect(Hook.permissions(hookBeforeAddLiquidity).afterAddLiquidity).toEqual(false)
      expect(Hook.permissions(hookBeforeRemoveLiquidity).afterAddLiquidity).toEqual(false)
      expect(Hook.permissions(emptyHookAddress).afterAddLiquidity).toEqual(false)
    })

    it('returns the correct results for beforeRemoveLiquidity', () => {
      expect(Hook.permissions(hookBeforeRemoveLiquidity).beforeRemoveLiquidity).toEqual(true)
      expect(Hook.permissions(allHooksAddress).beforeRemoveLiquidity).toEqual(true)
      expect(Hook.permissions(hookAfterAddLiquidity).beforeRemoveLiquidity).toEqual(false)
      expect(Hook.permissions(hookAfterRemoveLiquidity).beforeRemoveLiquidity).toEqual(false)
      expect(Hook.permissions(emptyHookAddress).beforeRemoveLiquidity).toEqual(false)
    })

    it('returns the correct results for afterRemoveLiquidity', () => {
      expect(Hook.permissions(hookAfterRemoveLiquidity).afterRemoveLiquidity).toEqual(true)
      expect(Hook.permissions(allHooksAddress).afterRemoveLiquidity).toEqual(true)
      expect(Hook.permissions(hookBeforeRemoveLiquidity).afterRemoveLiquidity).toEqual(false)
      expect(Hook.permissions(hookBeforeSwap).afterRemoveLiquidity).toEqual(false)
      expect(Hook.permissions(emptyHookAddress).afterRemoveLiquidity).toEqual(false)
    })

    it('returns the correct results for beforeSwap', () => {
      expect(Hook.permissions(hookBeforeSwap).beforeSwap).toEqual(true)
      expect(Hook.permissions(allHooksAddress).beforeSwap).toEqual(true)
      expect(Hook.permissions(hookAfterRemoveLiquidity).beforeSwap).toEqual(false)
      expect(Hook.permissions(hookAfterSwap).beforeSwap).toEqual(false)
      expect(Hook.permissions(emptyHookAddress).beforeSwap).toEqual(false)
    })

    it('returns the correct results for afterSwap', () => {
      expect(Hook.permissions(hookAfterSwap).afterSwap).toEqual(true)
      expect(Hook.permissions(allHooksAddress).afterSwap).toEqual(true)
      expect(Hook.permissions(hookBeforeSwap).afterSwap).toEqual(false)
      expect(Hook.permissions(hookBeforeDonate).afterSwap).toEqual(false)
      expect(Hook.permissions(emptyHookAddress).afterSwap).toEqual(false)
    })

    it('returns the correct results for beforeDonate', () => {
      expect(Hook.permissions(hookBeforeDonate).beforeDonate).toEqual(true)
      expect(Hook.permissions(allHooksAddress).beforeDonate).toEqual(true)
      expect(Hook.permissions(hookAfterSwap).beforeDonate).toEqual(false)
      expect(Hook.permissions(hookAfterDonate).beforeDonate).toEqual(false)
      expect(Hook.permissions(emptyHookAddress).beforeDonate).toEqual(false)
    })

    it('returns the correct results for afterDonate', () => {
      expect(Hook.permissions(hookAfterDonate).afterDonate).toEqual(true)
      expect(Hook.permissions(allHooksAddress).afterDonate).toEqual(true)
      expect(Hook.permissions(hookBeforeDonate).afterDonate).toEqual(false)
      expect(Hook.permissions(hookBeforeSwapReturnsDelta).afterDonate).toEqual(false)
      expect(Hook.permissions(emptyHookAddress).afterDonate).toEqual(false)
    })

    it('returns the correct results for beforeSwapReturnsDelta', () => {
      expect(Hook.permissions(hookBeforeSwapReturnsDelta).beforeSwapReturnsDelta).toEqual(true)
      expect(Hook.permissions(allHooksAddress).beforeSwapReturnsDelta).toEqual(true)
      expect(Hook.permissions(hookAfterDonate).beforeSwapReturnsDelta).toEqual(false)
      expect(Hook.permissions(hookAfterSwapReturnsDelta).beforeSwapReturnsDelta).toEqual(false)
      expect(Hook.permissions(emptyHookAddress).beforeSwapReturnsDelta).toEqual(false)
    })

    it('returns the correct results for afterSwapReturnsDelta', () => {
      expect(Hook.permissions(hookAfterSwapReturnsDelta).afterSwapReturnsDelta).toEqual(true)
      expect(Hook.permissions(allHooksAddress).afterSwapReturnsDelta).toEqual(true)
      expect(Hook.permissions(hookBeforeSwapReturnsDelta).afterSwapReturnsDelta).toEqual(false)
      expect(Hook.permissions(hookAfterAddLiquidityReturnsDelta).afterSwapReturnsDelta).toEqual(false)
      expect(Hook.permissions(emptyHookAddress).afterSwapReturnsDelta).toEqual(false)
    })

    it('returns the correct results for afterAddLiquidityReturnsDelta', () => {
      expect(Hook.permissions(hookAfterAddLiquidityReturnsDelta).afterAddLiquidityReturnsDelta).toEqual(true)
      expect(Hook.permissions(allHooksAddress).afterAddLiquidityReturnsDelta).toEqual(true)
      expect(Hook.permissions(hookAfterSwapReturnsDelta).afterAddLiquidityReturnsDelta).toEqual(false)
      expect(Hook.permissions(hookAfterRemoveLiquidityReturnsDelta).afterAddLiquidityReturnsDelta).toEqual(false)
      expect(Hook.permissions(emptyHookAddress).afterAddLiquidityReturnsDelta).toEqual(false)
    })

    it('returns the correct results for afterRemoveLiquidityReturnsDelta', () => {
      expect(Hook.permissions(hookAfterRemoveLiquidityReturnsDelta).afterRemoveLiquidityReturnsDelta).toEqual(true)
      expect(Hook.permissions(allHooksAddress).afterRemoveLiquidityReturnsDelta).toEqual(true)
      expect(Hook.permissions(hookAfterAddLiquidityReturnsDelta).afterRemoveLiquidityReturnsDelta).toEqual(false)
      expect(Hook.permissions(hookBeforeSwapReturnsDelta).afterRemoveLiquidityReturnsDelta).toEqual(false)
      expect(Hook.permissions(emptyHookAddress).afterRemoveLiquidityReturnsDelta).toEqual(false)
    })
  })

  describe('hasPermission', () => {
    it('throws for an invalid address', () => {
      expect(() => Hook.hasPermission('0x123', HookOptions.BeforeInitialize)).toThrow(
        'Invariant failed: invalid address'
      )
    })

    it('works if address has no 0x prefix', () => {
      expect(Hook.hasPermission(hookBeforeInitialize.slice(2), HookOptions.BeforeInitialize)).toEqual(true)
    })

    it('returns the correct results for beforeInitialize', () => {
      expect(Hook.hasPermission(hookBeforeInitialize, HookOptions.BeforeInitialize)).toEqual(true)
      expect(Hook.hasPermission(emptyHookAddress, HookOptions.BeforeInitialize)).toEqual(false)
    })

    it('returns the correct results for afterInitialize', () => {
      expect(Hook.hasPermission(hookAfterInitialize, HookOptions.AfterInitialize)).toEqual(true)
      expect(Hook.hasPermission(emptyHookAddress, HookOptions.AfterInitialize)).toEqual(false)
    })

    it('returns the correct results for beforeAddLiquidity', () => {
      expect(Hook.hasPermission(hookBeforeAddLiquidity, HookOptions.BeforeAddLiquidity)).toEqual(true)
      expect(Hook.hasPermission(emptyHookAddress, HookOptions.BeforeAddLiquidity)).toEqual(false)
    })

    it('returns the correct results for afterAddLiquidity', () => {
      expect(Hook.hasPermission(hookAfterAddLiquidity, HookOptions.AfterAddLiquidity)).toEqual(true)
      expect(Hook.hasPermission(emptyHookAddress, HookOptions.AfterAddLiquidity)).toEqual(false)
    })

    it('returns the correct results for beforeRemoveLiquidity', () => {
      expect(Hook.hasPermission(hookBeforeRemoveLiquidity, HookOptions.BeforeRemoveLiquidity)).toEqual(true)
      expect(Hook.hasPermission(emptyHookAddress, HookOptions.BeforeRemoveLiquidity)).toEqual(false)
    })

    it('returns the correct results for afterRemoveLiquidity', () => {
      expect(Hook.hasPermission(hookAfterRemoveLiquidity, HookOptions.AfterRemoveLiquidity)).toEqual(true)
      expect(Hook.hasPermission(emptyHookAddress, HookOptions.AfterRemoveLiquidity)).toEqual(false)
    })

    it('returns the correct results for beforeSwap', () => {
      expect(Hook.hasPermission(hookBeforeSwap, HookOptions.BeforeSwap)).toEqual(true)
      expect(Hook.hasPermission(emptyHookAddress, HookOptions.BeforeSwap)).toEqual(false)
    })

    it('returns the correct results for afterSwap', () => {
      expect(Hook.hasPermission(hookAfterSwap, HookOptions.AfterSwap)).toEqual(true)
      expect(Hook.hasPermission(emptyHookAddress, HookOptions.AfterSwap)).toEqual(false)
    })

    it('returns the correct results for beforeDonate', () => {
      expect(Hook.hasPermission(hookBeforeDonate, HookOptions.BeforeDonate)).toEqual(true)
      expect(Hook.hasPermission(emptyHookAddress, HookOptions.BeforeDonate)).toEqual(false)
    })

    it('returns the correct results for afterDonate', () => {
      expect(Hook.hasPermission(hookAfterDonate, HookOptions.AfterDonate)).toEqual(true)
      expect(Hook.hasPermission(emptyHookAddress, HookOptions.AfterDonate)).toEqual(false)
    })

    it('returns the correct results for beforeSwapReturnsDelta', () => {
      expect(Hook.hasPermission(hookBeforeSwapReturnsDelta, HookOptions.BeforeSwapReturnsDelta)).toEqual(true)
      expect(Hook.hasPermission(hookAfterDonate, HookOptions.BeforeSwapReturnsDelta)).toEqual(false)
    })

    it('returns the correct results for afterSwapReturnsDelta', () => {
      expect(Hook.hasPermission(hookAfterSwapReturnsDelta, HookOptions.AfterSwapReturnsDelta)).toEqual(true)
      expect(Hook.hasPermission(hookBeforeSwapReturnsDelta, HookOptions.AfterSwapReturnsDelta)).toEqual(false)
    })

    it('returns the correct results for afterAddLiquidityReturnsDelta', () => {
      expect(Hook.hasPermission(hookAfterAddLiquidityReturnsDelta, HookOptions.AfterAddLiquidityReturnsDelta)).toEqual(
        true
      )
      expect(Hook.hasPermission(hookAfterSwapReturnsDelta, HookOptions.AfterAddLiquidityReturnsDelta)).toEqual(false)
    })

    it('returns the correct results for afterRemoveLiquidityReturnsDelta', () => {
      expect(
        Hook.hasPermission(hookAfterRemoveLiquidityReturnsDelta, HookOptions.AfterRemoveLiquidityReturnsDelta)
      ).toEqual(true)
      expect(
        Hook.hasPermission(hookAfterAddLiquidityReturnsDelta, HookOptions.AfterRemoveLiquidityReturnsDelta)
      ).toEqual(false)
    })
  })

  describe('hasInitializePermissions', () => {
    it('returns the correct results for beforeSwap', () => {
      expect(Hook.hasInitializePermissions(hookBeforeInitialize)).toEqual(true)
    })

    it('returns the correct results for afterInitialize', () => {
      expect(Hook.hasInitializePermissions(hookAfterInitialize)).toEqual(true)
    })

    it('returns false for non-donate hooks', () => {
      expect(Hook.hasInitializePermissions(hookAfterSwap)).toEqual(false)
    })
  })

  describe('hasLiquidityPermissions', () => {
    it('returns the correct results for beforeAddLiquidity', () => {
      expect(Hook.hasLiquidityPermissions(hookBeforeAddLiquidity)).toEqual(true)
    })

    it('returns the correct results for afterAddLiquidity', () => {
      expect(Hook.hasLiquidityPermissions(hookAfterAddLiquidity)).toEqual(true)
    })

    it('returns the correct results for beforeRemoveLiquidity', () => {
      expect(Hook.hasLiquidityPermissions(hookBeforeRemoveLiquidity)).toEqual(true)
    })

    it('returns the correct results for afterRemoveLiquidity', () => {
      expect(Hook.hasLiquidityPermissions(hookAfterRemoveLiquidity)).toEqual(true)
    })

    it('returns false if only delta flag is flagged (an incorrect address)', () => {
      expect(Hook.hasLiquidityPermissions(hookAfterRemoveLiquidityReturnsDelta)).toEqual(false)
    })
  })

  describe('hasSwapPermissions', () => {
    it('returns the correct results for beforeSwap', () => {
      expect(Hook.hasSwapPermissions(hookBeforeSwap)).toEqual(true)
    })

    it('returns the correct results for afterSwap', () => {
      expect(Hook.hasSwapPermissions(hookAfterSwap)).toEqual(true)
    })

    it('returns false if only delta flag is flagged (an incorrect address)', () => {
      expect(Hook.hasSwapPermissions(hookBeforeSwapReturnsDelta)).toEqual(false)
    })
  })

  describe('hasDonatePermissions', () => {
    it('returns the correct results for beforeSwap', () => {
      expect(Hook.hasDonatePermissions(hookBeforeDonate)).toEqual(true)
    })

    it('returns the correct results for afterDonate', () => {
      expect(Hook.hasDonatePermissions(hookAfterDonate)).toEqual(true)
    })

    it('returns false for non-donate hooks', () => {
      expect(Hook.hasDonatePermissions(hookAfterSwap)).toEqual(false)
    })
  })
})
