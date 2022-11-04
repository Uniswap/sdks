import invariant from 'tiny-invariant'
import { BigNumberish } from 'ethers'
import { CurrencyAmount, Currency } from '@uniswap/sdk-core'
import { SeaportData } from './protocols/seaport'
import { FoundationData } from './protocols/foundation'
import { NFTXData } from './protocols/nftx'
import { RoutePlanner } from '../utils/routerCommands'
import { getNativeCurrencyValue } from '../utils/getNativeCurrencyValue'
import { LooksRareData } from './protocols/looksRare'
import { X2Y2Data } from './protocols/x2y2'

export type SupportedProtocolsData = SeaportData | FoundationData | NFTXData | LooksRareData | X2Y2Data

export type TradeConfig = {
  allowRevert: boolean
}

export abstract class NFTTrade<T> {
  readonly orders: T[]
  readonly market: Market

  constructor(market: Market, orders: T[]) {
    invariant(orders.length > 0, 'no buy Items')
    this.market = market
    this.orders = orders
  }

  abstract encode(planner: RoutePlanner, config: TradeConfig): void

  abstract getBuyItems(): BuyItem[]

  abstract getTotalPrice(): BigNumberish
}

export type BuyItem = {
  tokenAddress: string
  tokenId: BigNumberish
  tokenType: TokenType
  amount?: BigNumberish // for 1155
}

export enum Market {
  Foundation = 'foundation',
  LooksRare = 'looksrare',
  NFT20 = 'nft20',
  NFTX = 'nftx',
  Seaport = 'seaport',
  Sudoswap = 'Sudoswap',
  Cryptopunks = 'cryptopunks',
  X2Y2 = 'x2y2',
}

export enum TokenType {
  ERC721 = 'ERC721',
  ERC1155 = 'ERC1155',
  Cryptopunk = 'Cryptopunk',
}
