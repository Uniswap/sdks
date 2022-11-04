import abi from '../../../abis/X2Y2.json'
import { Interface } from '@ethersproject/abi'
import { NFTTrade, Market, BuyItem, TokenType } from '../NFTTrade'
import { RoutePlanner, CommandType } from '../../utils/routerCommands'
import { BigNumber, BigNumberish } from 'ethers'

export type X2Y2Data = {
  signedInput: string
  recipient: string
  tokenAddress: string
  tokenId: BigNumberish
  price: BigNumberish
}

export class X2Y2Trade extends NFTTrade<X2Y2Data> {
  public static INTERFACE: Interface = new Interface(abi)

  constructor(orders: X2Y2Data[]) {
    super(Market.X2Y2, orders)
  }

  encode(planner: RoutePlanner): void {
    for (const item of this.orders) {
      const functionSelector = X2Y2Trade.INTERFACE.getSighash(X2Y2Trade.INTERFACE.getFunction('run'))
      const calldata = functionSelector + item.signedInput.slice(2)

      planner.addCommand(CommandType.X2Y2_721, [item.price, calldata, item.recipient, item.tokenAddress, item.tokenId])
    }
  }

  getBuyItems(): BuyItem[] {
    let buyItems: BuyItem[] = []
    for (const item of this.orders) {
      buyItems.push({
        tokenAddress: item.tokenAddress,
        tokenId: item.tokenId,
        tokenType: TokenType.ERC721,
      })
    }
    return buyItems
  }

  getTotalPrice(): BigNumberish {
    let total = BigNumber.from(0)
    for (const item of this.orders) {
      total = total.add(item.price)
    }
    return total
  }
}
