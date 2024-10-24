import { Hook, HookOptions } from './hook'

function constructAddress(hookOptions: HookOptions[]): string {
  let hookFlags = 0
  for (const hookOption of hookOptions) {
    hookFlags = hookFlags | (1 << hookOption)
  }

  const addressFlag = hookFlags.toString(16)
  return `0x${'0'.repeat(40 - addressFlag.length)}${addressFlag}`
}

describe('Hook', () => {
  const allHooksAddress = '0x0000000000000000000000000000000000003fff'
  const emptyHookAddress = '0x0000000000000000000000000000000000000000'
  const hookBeforeInitialize = constructAddress([HookOptions.BeforeInitialize])
  const hookAfterInitialize = constructAddress([HookOptions.AfterInitialize])
  const hookBeforeAddLiquidity = constructAddress([HookOptions.BeforeAddLiquidity])
  const hookAfterAddLiquidity = constructAddress([HookOptions.AfterAddLiquidity])
  const hookBeforeRemoveLiquidity = constructAddress([HookOptions.BeforeRemoveLiquidity])
  const hookAfterRemoveLiquidity = constructAddress([HookOptions.AfterRemoveLiquidity])
  const hookBeforeSwap = constructAddress([HookOptions.BeforeSwap])
  const hookAfterSwap = constructAddress([HookOptions.AfterSwap])
  const hookBeforeDonate = constructAddress([HookOptions.BeforeDonate])
  const hookAfterDonate = constructAddress([HookOptions.AfterDonate])
  const hookBeforeSwapReturnsDelta = constructAddress([HookOptions.BeforeSwapReturnsDelta])
  const hookAfterSwapReturnsDelta = constructAddress([HookOptions.AfterSwapReturnsDelta])
  const hookAfterAddLiquidityReturnsDelta = constructAddress([HookOptions.AfterAddLiquidityReturnsDelta])
  const hookAfterRemoveLiquidityReturnsDelta = constructAddress([HookOptions.AfterRemoveLiquidityReturnsDelta])

  describe('hookPermissions', () => {
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
})
