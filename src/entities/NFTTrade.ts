import invariant from 'tiny-invariant'
import { BigNumber, BigNumberish } from 'ethers'
import { SeaportData } from './protocols/seaport'
import { FoundationData } from './protocols/foundation'
import { NFTXData } from './protocols/nftx'
import { NFT20Data } from './protocols/nft20'
import { RoutePlanner } from '../utils/routerCommands'
import { Command, RouterTradeType, TradeConfig } from './Command'
import { LooksRareData } from './protocols/looksRare'
import { SudoswapData } from './protocols/sudoswap'
import { CryptopunkData } from './protocols/cryptopunk'
import { X2Y2Data } from './protocols/x2y2'

export type SupportedProtocolsData =
  | SeaportData
  | FoundationData
  | NFTXData
  | LooksRareData
  | X2Y2Data
  | CryptopunkData
  | NFT20Data
  | SudoswapData

export abstract class NFTTrade<T> implements Command {
  readonly tradeType: RouterTradeType = RouterTradeType.NFTTrade
  readonly orders: T[]
  readonly market: Market

  constructor(market: Market, orders: T[]) {
    invariant(orders.length > 0, 'no buy Items')
    this.market = market
    this.orders = orders
  }

  abstract encode(planner: RoutePlanner, config: TradeConfig): void

  abstract getBuyItems(): BuyItem[]

  // optional parameter for the markets that accept ERC20s not just ETH
  abstract getTotalPrice(token?: string): BigNumber
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
