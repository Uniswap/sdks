import { SeaportData, ConsiderationItem, SeaportVersion } from '../../src/entities/protocols/seaport'
import { BigNumber } from 'ethers'
import { TEST_RECIPIENT_ADDRESS } from '../utils/addresses'

export const seaportV1_4Data: SeaportData = {
  items: [
    {
      parameters: {
        offerer: '0xab0d2ad721399c2e8ec6f340d1e09cbbed7c5f2b',
        offer: [
          {
            itemType: 3,
            token: '0x4f3adef2f4096740774a955e912b5f03f2c7ba2b',
            identifierOrCriteria: '1',
            startAmount: '3',
            endAmount: '3',
          },
        ],
        consideration: [
          {
            itemType: 0,
            token: '0x0000000000000000000000000000000000000000',
            identifierOrCriteria: '0',
            startAmount: '80550000000000000',
            endAmount: '80550000000000000',
            recipient: '0xab0d2ad721399c2e8ec6f340d1e09cbbed7c5f2b',
          },
          {
            itemType: 0,
            token: '0x0000000000000000000000000000000000000000',
            identifierOrCriteria: '0',
            startAmount: '450000000000000',
            endAmount: '450000000000000',
            recipient: '0x0000a26b00c1f0df003000390027140000faa719',
          },
          {
            itemType: 0,
            token: '0x0000000000000000000000000000000000000000',
            identifierOrCriteria: '0',
            startAmount: '9000000000000000',
            endAmount: '9000000000000000',
            recipient: '0x4401a1667dafb63cff06218a69ce11537de9a101',
          },
        ],
        startTime: '1678725221',
        endTime: '1678811621',
        orderType: 1,
        zone: '0x004c00500000ad104d7dbd00e3ae0a5c00560c00',
        zoneHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
        salt: '24446860302761739304752683030156737591518664810215442929816957436415552570299',
        conduitKey: '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000',
        totalOriginalConsiderationItems: 3,
      },
      signature:
        '0x898c4e840db735a6ffb9f4a42920aa36a182940d85c44af97bd0c0bc672573d6b08a70a06c55a125d9ec3c484950b6e86981b4ac937037375f56d4df237bbf9f',
    },
  ],
  recipient: TEST_RECIPIENT_ADDRESS,
  version: SeaportVersion.V1_4,
}

export const seaportV1_4Value = calculateSeaportValue(seaportV1_4Data.items[0].parameters.consideration)

function calculateSeaportValue(considerations: ConsiderationItem[]): BigNumber {
  return considerations.reduce(
    (amt: BigNumber, consideration: ConsiderationItem) => amt.add(consideration.startAmount),
    BigNumber.from(0)
  )
}
