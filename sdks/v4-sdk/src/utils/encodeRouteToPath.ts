export const encodeRouteToPath = (poolKeys: any[], currencyIn: string): any[] => {
  let pathKeys = []
  for (let i = 0; i < poolKeys.length; i++) {
    let currencyOut = currencyIn == poolKeys[i].currency0 ? poolKeys[i].currency1 : poolKeys[i].currency0
    let pathKey = {
      intermediateCurrency: currencyOut,
      fee: poolKeys[i].fee,
      tickSpacing: poolKeys[i].tickSpacing,
      hooks: poolKeys[i].hooks,
      hookData: '0x',
    }
    pathKeys.push(pathKey)
    currencyIn = currencyOut
  }
  return pathKeys
}
