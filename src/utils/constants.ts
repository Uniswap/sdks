export const PERMIT2_ADDRESS = (chainId: number) => {
  switch (chainId) {
    case 1:
      return '0x6fEe9BeC3B3fc8f9DA5740f0efc6BbE6966cd6A6'
    default:
      throw new Error(`Permit2 not deployed on chain ${chainId}`)
  }
}
