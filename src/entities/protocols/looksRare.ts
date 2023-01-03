import invariant from 'tiny-invariant'
import abi from '../../../abis/LooksRare.json'
import { Interface } from '@ethersproject/abi'
import { BuyItem, Market, NFTTrade, TokenType } from '../NFTTrade'
import { TradeConfig } from '../Command'
import { RoutePlanner, CommandType } from '../../utils/routerCommands'
import { BigNumber, BigNumberish } from 'ethers'

export type MakerOrder = {
  collection: string
  tokenId: BigNumberish
  isOrderAsk: true
  signer: string
  strategy: string
  currency: string
  amount: BigNumberish
  price: BigNumberish
  minPercentageToAsk: BigNumberish
  nonce: BigNumberish
  startTime: BigNumberish
  endTime: BigNumberish
  v: BigNumberish
  r: string
  s: string
  params: string
}

export type TakerOrder = {
  minPercentageToAsk: BigNumberish
  price: BigNumberish
  taker: string
  tokenId: BigNumberish
  isOrderAsk: boolean
  params: string
}

export type LooksRareData = {
  makerOrder: MakerOrder
  takerOrder: TakerOrder
  recipient: string
  tokenType: TokenType
}

export class LooksRareTrade extends NFTTrade<LooksRareData> {
  public static INTERFACE: Interface = new Interface(abi)

  constructor(orders: LooksRareData[]) {
    super(Market.LooksRare, orders)
  }

  encode(planner: RoutePlanner, config: TradeConfig): void {
    for (const item of this.orders) {
      const calldata = LooksRareTrade.INTERFACE.encodeFunctionData('matchAskWithTakerBidUsingETHAndWETH', [
        item.takerOrder,
        item.makerOrder,
      ])

      if (item.tokenType == TokenType.ERC721) {
        invariant(item.makerOrder.amount == 1, 'ERC721 token amount must be 1')
        planner.addCommand(
          CommandType.LOOKS_RARE_721,
          [item.makerOrder.price, calldata, item.recipient, item.makerOrder.collection, item.makerOrder.tokenId],
          config.allowRevert
        )
      } else if (item.tokenType == TokenType.ERC1155) {
        planner.addCommand(
          CommandType.LOOKS_RARE_1155,
          [
            item.makerOrder.price,
            calldata,
            item.recipient,
            item.makerOrder.collection,
            item.makerOrder.tokenId,
            item.makerOrder.amount,
          ],
          config.allowRevert
        )
      }
    }
  }

  getBuyItems(): BuyItem[] {
    let buyItems: BuyItem[] = []
    for (const item of this.orders) {
      buyItems.push({
        tokenAddress: item.makerOrder.collection,
        tokenId: item.makerOrder.tokenId,
        tokenType: item.tokenType,
      })
    }
    return buyItems
  }

  getTotalPrice(): BigNumber {
    let total = BigNumber.from(0)
    for (const item of this.orders) {
      total = total.add(item.makerOrder.price)
    }
    return total
  }
}
