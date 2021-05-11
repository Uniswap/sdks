import { BaseCurrency } from './baseCurrency'

/**
 * Represents the currency Ether
 */
export class Ether extends BaseCurrency {
  public readonly isEther: true = true
  public readonly isToken: false = false

  /**
   * Only called once by this class
   * @protected
   */
  protected constructor() {
    super(18, 'ETH', 'Ether')
  }

  /**
   * The only instance of the class `Ether`.
   */
  public static readonly ETHER: Ether = new Ether()
}

export const ETHER = Ether.ETHER
