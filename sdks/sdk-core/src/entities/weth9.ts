import { Token } from './token'
import { ChainId } from '../chains'

/**
 * Known WETH9 implementation addresses, used in our implementation of Ether#wrapped
 */
export const WETH9: { [chainId in ChainId]: Token } = {
  [ChainId.XDC]: new Token(ChainId.XDC, '0x951857744785e80e2de051c32ee7b25f9c458c42', 18, 'WXDC', 'Wrapped XDC'),
  [ChainId.APOTHEM]: new Token(
      ChainId.APOTHEM,
      '0x2a5c77b016df1b3b0ae4e79a68f8adf64ee741ba',
      18,
      'WXDC',
      'Wrapped XDC',
  ),
}
