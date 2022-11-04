import abi from '../../../abis/Seaport.json'
import { BigNumber, BigNumberish, ethers } from 'ethers'
import { Interface } from '@ethersproject/abi'
import { NFTTrade, BuyItem, Market, TokenType } from '../NFTTrade'
import { RoutePlanner, CommandType } from '../../utils/routerCommands'
import { Currency, CurrencyAmount } from '@uniswap/sdk-core'

export type SeaportData = {
  parameters: {
    offerer: string // address
    offer: OfferItem[]
    consideration: ConsiderationItem[]
    orderType: BigNumberish // enum
    startTime: BigNumberish
    endTime: BigNumberish
    zone: string //address
    zoneHash: string // bytes32
    salt: BigNumberish
    conduitKey: string // bytes32,
    totalOriginalConsiderationItems: BigNumberish
  }
  signature: string
  recipient: string // address
}

export type FulfillmentComponent = {
  orderIndex: BigNumberish
  itemIndex: BigNumberish
}

export type OfferItem = {
  itemType: BigNumberish // enum
  token: string // address
  identifierOrCriteria: BigNumberish
  startAmount: BigNumberish
  endAmount: BigNumberish
}

export type ConsiderationItem = OfferItem & {
  recipient: string
}

export type Order = {
  parameters: {
    offerer: string // address,
    offer: OfferItem[]
    consideration: ConsiderationItem[]
    orderType: BigNumberish // enum
    startTime: BigNumberish
    endTime: BigNumberish
    zoneHash: string // bytes32
    salt: BigNumberish
    conduitKey: string // bytes32,
    totalOriginalConsiderationItems: BigNumberish
  }
  signature: string
}

export type AdvancedOrder = Order & {
  numerator: BigNumber // uint120
  denominator: BigNumber // uint120
  extraData: string // bytes
}

export class SeaportTrade extends NFTTrade<SeaportData> {
  public static INTERFACE: Interface = new Interface(abi)
  public static OPENSEA_CONDUIT_KEY: string = '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000'

  constructor(orders: SeaportData[]) {
    super(Market.Seaport, orders)
  }

  encode(planner: RoutePlanner): void {
    let advancedOrders: AdvancedOrder[] = []
    let orderFulfillments: FulfillmentComponent[][] = this.orders.map((x, index) => [
      { orderIndex: index, itemIndex: 0 },
    ])
    let considerationFulFillments: FulfillmentComponent[][] = this.getConsiderationFulfillments(this.orders)

    for (const item of this.orders) {
      const { advancedOrder } = this.getAdvancedOrderParams(item)
      advancedOrders.push(advancedOrder)
    }

    let calldata: string
    if (advancedOrders.length == 1) {
      calldata = SeaportTrade.INTERFACE.encodeFunctionData('fulfillAdvancedOrder', [
        advancedOrders[0],
        [],
        SeaportTrade.OPENSEA_CONDUIT_KEY,
        this.orders[0].recipient,
      ])
    } else {
      calldata = SeaportTrade.INTERFACE.encodeFunctionData('fulfillAvailableAdvancedOrders', [
        advancedOrders,
        [],
        orderFulfillments,
        considerationFulFillments,
        SeaportTrade.OPENSEA_CONDUIT_KEY,
        this.orders[0].recipient,
        100,
      ])
    }
    planner.addCommand(CommandType.SEAPORT, [this.getTotalPrice().toString(), calldata])
  }

  getBuyItems(): BuyItem[] {
    let buyItems: BuyItem[] = []
    for (const order of this.orders) {
      for (const item of order.parameters.offer) {
        buyItems.push({
          tokenAddress: item.token,
          tokenId: item.identifierOrCriteria,
          tokenType: TokenType.ERC721,
        })
      }
    }
    return buyItems
  }

  getTotalPrice(): BigNumber {
    return this.orders.reduce(
      (prevAmt, order) => prevAmt.add(this.calculateValue(order.parameters.consideration)),
      BigNumber.from(0)
    )
  }

  private getConsiderationFulfillments(protocolDatas: SeaportData[]): FulfillmentComponent[][] {
    let considerationFulfillments: FulfillmentComponent[][] = []
    const considerationRecipients: string[] = []

    for (const i in protocolDatas) {
      const protocolData = protocolDatas[i]

      for (const j in protocolData.parameters.consideration) {
        const item = protocolData.parameters.consideration[j]

        if (considerationRecipients.findIndex((x) => x === item.recipient) === -1) {
          considerationRecipients.push(item.recipient)
        }

        const recipientIndex = considerationRecipients.findIndex((x) => x === item.recipient)

        if (!considerationFulfillments[recipientIndex]) {
          considerationFulfillments.push([
            {
              orderIndex: i,
              itemIndex: j,
            },
          ])
        } else {
          considerationFulfillments[recipientIndex].push({
            orderIndex: i,
            itemIndex: j,
          })
        }
      }
    }
    return considerationFulfillments
  }

  private getAdvancedOrderParams(data: SeaportData): { advancedOrder: AdvancedOrder; value: BigNumber } {
    const advancedOrder = {
      parameters: data.parameters,
      numerator: BigNumber.from('1'),
      denominator: BigNumber.from('1'),
      signature: data.signature,
      extraData: '0x00',
    }
    const value = this.calculateValue(data.parameters.consideration)
    return { advancedOrder, value }
  }

  private calculateValue(considerations: ConsiderationItem[]): BigNumber {
    return considerations.reduce(
      (amt: BigNumber, consideration: ConsiderationItem) => amt.add(consideration.startAmount),
      BigNumber.from(0)
    )
  }
}
