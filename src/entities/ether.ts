import { BaseCurrency } from './baseCurrency'

export class Ether extends BaseCurrency {
  public readonly isEther: true = true
  public readonly isToken: false = false

  /**
   * The only instance of the base class `Currency`.
   */
  public static readonly ETHER: Ether = new Ether(18, 'ETH', 'Ether')
}

export const ETHER = Ether.ETHER
