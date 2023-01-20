import { MakerOrder, TakerOrder } from '../../src/entities/protocols/looksRare'
import { BigNumber } from 'ethers'
export type APIOrder = Omit<MakerOrder, 'collection' | 'currency'> & {
  collectionAddress: string
  currencyAddress: string
}

export function createLooksRareOrders(
  apiOrder: APIOrder,
  taker: string
): { makerOrder: MakerOrder; takerOrder: TakerOrder; value: BigNumber } {
  const collection = apiOrder.collectionAddress
  const currency = apiOrder.currencyAddress
  if (apiOrder.params == '') apiOrder.params = '0x'

  const makerOrder = { ...apiOrder, collection, currency }

  delete makerOrder.collectionAddress
  delete makerOrder.currencyAddress

  const takerOrder = {
    minPercentageToAsk: apiOrder.minPercentageToAsk,
    price: apiOrder.price,
    taker,
    tokenId: apiOrder.tokenId,
    isOrderAsk: false,
    params: apiOrder.params,
  }

  const value = BigNumber.from(apiOrder.price)
  return { makerOrder, takerOrder, value }
}

export const looksRareOrders: APIOrder[] = [
  {
    collectionAddress: '0x5180db8F5c931aaE63c74266b211F580155ecac8',
    tokenId: '4331',
    isOrderAsk: true,
    signer: '0x22E86ab483084053562cE713e94431C29D1Adb8b',
    strategy: '0x56244Bb70CbD3EA9Dc8007399F61dFC065190031',
    currencyAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    amount: 1,
    price: '32000000000000000000',
    nonce: '45',
    startTime: 1650697012,
    endTime: 1666245407,
    minPercentageToAsk: 8500,
    params: '0x',
    v: 27,
    r: '0x2d89300623b02e6305d770925d6a34006de07723fd0910a0b1f7780c6964a41b',
    s: '0x1430768f23a5ad85c14de1a97fcc428fd001944dfcb659fd73f3f70e653e4507',
  },
  {
    collectionAddress: '0x60E4d786628Fea6478F785A6d7e704777c86a7c6',
    tokenId: '4767',
    isOrderAsk: true,
    signer: '0x40e84785b0BB9833622ACc497467E1059188Ae5c',
    strategy: '0x56244Bb70CbD3EA9Dc8007399F61dFC065190031',
    currencyAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    amount: 1,
    price: '269000000000000000000',
    nonce: '11',
    startTime: 1660061159,
    endTime: 1664553900,
    minPercentageToAsk: 9550,
    params: '0x',
    v: 27,
    r: '0xdbff387529724227d5450a9abcad68fdff6ff5292084c34e82b9d6560633f62c',
    s: '0x1abb2a4fdacf7cde0d6119b1b3655eb415a2436ccf4261d6e98167f9d2ac06a0',
  },
  {
    collectionAddress: '0xf4680c917A873E2dd6eAd72f9f433e74EB9c623C',
    tokenId: '40',
    isOrderAsk: true,
    signer: '0x8246137C39BB05261972655186A868bdC8a9Eb11',
    strategy: '0x56244Bb70CbD3EA9Dc8007399F61dFC065190031',
    currencyAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    amount: 1,
    price: '200000000000000000',
    nonce: '82',
    startTime: 1650475038,
    endTime: 1666027031,
    minPercentageToAsk: 8500,
    params: '0x',
    v: 27,
    r: '0x4353a91cb2f3d9eba1136514a3eba255b7043244886ea3d0bb89d0ccea6a40cd',
    s: '0x0608814e41edd6852ceb3f1a2a0ab6fc1851b20baf92f26e7c3b570a5408ccd6',
  },
  {
    collectionAddress: '0x5180db8F5c931aaE63c74266b211F580155ecac8',
    tokenId: '10',
    isOrderAsk: true,
    signer: '0xBE5BE517537e53F09e88bcDf61Da238477dca226',
    strategy: '0x579af6FD30BF83a5Ac0D636bc619f98DBdeb930c',
    currencyAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    amount: '1',
    price: '33870000000000000000',
    nonce: '49',
    startTime: 1667401406,
    endTime: 1682953405,
    minPercentageToAsk: 9800,
    params: '0x',
    v: 27,
    r: '0xa3f427485460946b4e3abbae3ea1634bfe38c670b4f1502d16545e205923373f',
    s: '0x60e8089d8eb32dced0ab84005aa27bf8ec19961680a8ebebbffb6c40b197decc',
  },
]
