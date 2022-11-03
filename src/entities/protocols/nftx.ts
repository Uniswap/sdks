import abi from '../../../abis/NFTXZap.json'
import { Interface } from '@ethersproject/abi'
import { NFTTrade, BuyItem, Market, TokenType } from '../NFTTrade'
import { RoutePlanner, CommandType } from '../../utils/routerCommands'
import { ethers, BigNumber, BigNumberish } from 'ethers'
import { Currency, CurrencyAmount, Ether } from '@uniswap/sdk-core'
import { assert } from 'console'
import JSBI from 'jsbi'

export type NFTXData = {
  recipient: string
  tokenAddress: string
  price: BigNumberish
  tokenId: BigNumberish
  vaultId: BigNumberish
  vaultAddress: string
}

type NFTXVaultPurchase = {
  vaultAddress: string
  recipient: string
  price: BigNumber
  tokenIds: BigNumberish[]
}

export class NFTXTrade extends NFTTrade<NFTXData> {
  public static INTERFACE: Interface = new Interface(abi)

  constructor(orders: NFTXData[]) {
    super(Market.NFTX, orders)
  }

  encode(planner: RoutePlanner): void {
    let vaultPurchases: { [keys: string]: NFTXVaultPurchase } = {}
    for (const item of this.orders) {
      const vaultId = item.vaultId.toString()
      if (!vaultPurchases[vaultId]) {
        vaultPurchases[vaultId] = {
          vaultAddress: item.vaultAddress,
          recipient: item.recipient,
          price: BigNumber.from(0),
          tokenIds: [],
        }
      }
      assert(vaultPurchases[vaultId].recipient == item.recipient)
      vaultPurchases[vaultId].tokenIds.push(item.tokenId)
      vaultPurchases[vaultId].price = vaultPurchases[vaultId].price.add(item.price)
    }

    for (const vaultId of Object.keys(vaultPurchases)) {
      const purchase = vaultPurchases[vaultId]
      const calldata = NFTXTrade.INTERFACE.encodeFunctionData('buyAndRedeem', [
        vaultId,
        purchase.tokenIds.length,
        purchase.tokenIds,
        [Ether.onChain(1).wrapped.address, purchase.vaultAddress],
        purchase.recipient,
      ])
      planner.addCommand(CommandType.NFTX, [purchase.price, calldata])
    }
  }

  getBuyItems(): BuyItem[] {
    let buyItems: BuyItem[] = []
    for (const item of this.orders) {
      buyItems.push({
        tokenAddress: item.tokenAddress,
        tokenId: item.tokenId,
        priceInfo: item.price,
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
