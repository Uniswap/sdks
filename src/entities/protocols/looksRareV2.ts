import abi from '../../../abis/LooksRareV2.json'
import { Interface } from '@ethersproject/abi'
import { BuyItem, Market, NFTTrade, TokenType } from '../NFTTrade'
import { TradeConfig } from '../Command'
import { RoutePlanner, CommandType } from '../../utils/routerCommands'
import { BigNumber } from 'ethers'
import { ZERO_ADDRESS } from '../../utils/constants'

export type MakerOrder = {
  quoteType: number
  globalNonce: string
  subsetNonce: string
  orderNonce: string
  strategyId: number
  collectionType: number
  collection: string
  currency: string
  signer: string
  startTime: number
  endTime: number
  price: string
  itemIds: string[]
  amounts: string[]
  additionalParameters: string
}

export type TakerOrder = {
  recipient: string
  additionalParameters: string
}

export type MerkleProof = {
  value: string
  position: number
}

export type MerkleTree = {
  root: string
  proof: MerkleProof[]
}

export type LRV2APIOrder = MakerOrder & {
  id: string
  hash: string
  signature: string
  createdAt: string
  merkleRoot: string
  merkleProof: MerkleProof[]
  status: string
}

export type LooksRareV2Data = {
  apiOrder: LRV2APIOrder
  taker: string
}

export class LooksRareV2Trade extends NFTTrade<LooksRareV2Data> {
  public static INTERFACE: Interface = new Interface(abi)
  private static ERC721_ORDER = 0

  constructor(orders: LooksRareV2Data[]) {
    super(Market.LooksRareV2, orders)
  }

  encode(planner: RoutePlanner, config: TradeConfig): void {
    for (const item of this.orders) {
      const { takerBid, makerOrder, makerSignature, value, merkleTree } = this.refactorAPIData(item)
      const calldata = LooksRareV2Trade.INTERFACE.encodeFunctionData('executeTakerBid', [
        takerBid,
        makerOrder,
        makerSignature,
        merkleTree,
        ZERO_ADDRESS, // affiliate
      ])

      planner.addCommand(CommandType.LOOKS_RARE_V2, [value, calldata], config.allowRevert)
    }
  }

  getBuyItems(): BuyItem[] {
    let buyItems: BuyItem[] = []
    for (const item of this.orders) {
      const tokenAddress = item.apiOrder.collection
      const tokenType =
        item.apiOrder.collectionType == LooksRareV2Trade.ERC721_ORDER ? TokenType.ERC721 : TokenType.ERC1155
      for (const tokenId of item.apiOrder.itemIds)
        buyItems.push({
          tokenAddress,
          tokenId,
          tokenType,
        })
    }
    return buyItems
  }

  getTotalPrice(): BigNumber {
    let total = BigNumber.from(0)
    for (const item of this.orders) {
      total = total.add(item.apiOrder.price)
    }
    return total
  }

  private refactorAPIData(data: LooksRareV2Data): {
    takerBid: TakerOrder
    makerOrder: MakerOrder
    makerSignature: string
    value: BigNumber
    merkleTree: MerkleTree
  } {
    const makerOrder: MakerOrder = { ...data.apiOrder }

    const makerSignature: string = data.apiOrder.signature

    const takerBid: TakerOrder = {
      recipient: data.taker,
      additionalParameters: '0x',
    }

    const value: BigNumber = BigNumber.from(data.apiOrder.price)

    const merkleTree: MerkleTree = {
      root: data.apiOrder.merkleRoot,
      proof: data.apiOrder.merkleProof,
    }

    return { takerBid, makerOrder, makerSignature, value, merkleTree }
  }
}
