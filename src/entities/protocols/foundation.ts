import abi from '../../../abis/Foundation.json'
import { Interface } from '@ethersproject/abi'
import { NFTTrade, BuyItem } from '../NFTTrade'
import { RoutePlanner, CommandType } from '../../utils/routerCommands'
import { ethers, BigNumber } from 'ethers'
import { Currency, CurrencyAmount } from '@uniswap/sdk-core'

export type FoundationData = {
  referrer: string // address
}

export class FoundationTrade extends NFTTrade<FoundationData> {
  public static INTERFACE: Interface = new Interface(abi)

  constructor(recipient: string, buyItems: BuyItem<FoundationData>[]) {
    super(recipient, buyItems)
  }

  encode(planner: RoutePlanner): void {
    for (const item of this.buyItems) {
      const value = item.priceInfo.quotient.toString()
      const calldata = FoundationTrade.INTERFACE.encodeFunctionData('buyV2', [
        item.address,
        item.tokenId,
        value,
        item.data.referrer,
      ])
      planner.addCommand(CommandType.FOUNDATION, [value, calldata, this.recipient, item.address, item.tokenId])
    }
  }
}
