import { getAddress } from '@ethersproject/address'
import { BytesLike, hexZeroPad } from '@ethersproject/bytes'
import { keccak256 } from '@ethersproject/solidity'
import { toUtf8Bytes } from '@ethersproject/strings'

export function computeZksyncCreate2Address(
  sender: string,
  bytecodeHash: BytesLike,
  salt: BytesLike,
  input: BytesLike = ''
) {
  const prefix = keccak256(['bytes'], [toUtf8Bytes('zksyncCreate2')])
  const inputHash = keccak256(['bytes'], [input])
  const addressBytes = keccak256(
    ['bytes', 'bytes', 'bytes', 'bytes', 'bytes'],
    [prefix, hexZeroPad(sender, 32), salt, bytecodeHash, inputHash]
  ).slice(26)
  return getAddress(addressBytes)
}
