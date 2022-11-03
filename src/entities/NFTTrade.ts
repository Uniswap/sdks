import invariant from 'tiny-invariant'
import { BigNumber, BigNumberish } from 'ethers'
import { CurrencyAmount, WETH9, Ether, Currency } from '@uniswap/sdk-core'
import { SeaportData } from './protocols/seaport'
import { FoundationData } from './protocols/foundation'
import { NFTXData } from './protocols/nftx'
import { RoutePlanner } from '../utils/routerCommands'
import { getNativeCurrencyValue } from '../utils/getNativeCurrencyValue'

export type SupportedProtocolsData = SeaportData | FoundationData | NFTXData

export abstract class NFTTrade<T> {
  readonly recipient: string //address
  readonly buyItems: BuyItem<T>[]
  readonly nativeCurrencyValue: CurrencyAmount<Currency>

  constructor(recipient: string, buyItems: BuyItem<T>[]) {
    invariant(buyItems.length > 0, 'no buy Items')
    invariant(recipient.length > 0, 'no recipient')
    invariant(!!buyItems[0].priceInfo.currency.isNative, 'only native currency supported')
    this.recipient = recipient
    this.buyItems = buyItems
    this.nativeCurrencyValue = getNativeCurrencyValue(buyItems.map((i) => i.priceInfo))
  }

  abstract encode(planner: RoutePlanner): void
}

export type BuyItem<T> = {
  address: string
  tokenId: BigNumberish
  priceInfo: CurrencyAmount<Currency>
  tokenType: TokenTypes
  data: T
}

export enum Markets {
  Foundation = 'foundation',
  LooksRare = 'looksrare',
  NFT20 = 'nft20',
  NFTX = 'nftx',
  Seaport = 'seaport',
  Sudoswap = 'Sudoswap',
  Cryptopunks = 'cryptopunks',
  X2Y2 = 'x2y2',
}

export enum TokenTypes {
  ERC721 = 'ERC721',
  ERC1155 = 'ERC1155',
  Cryptopunk = 'Cryptopunk',
}
