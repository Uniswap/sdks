import { Multicall } from './multicall'

describe('Multicall', () => {
  describe('#encodeMulticall', () => {
    it('works for string', async () => {
      const calldata = Multicall.encodeMulticall('0x01')
      expect(calldata).toBe('0x01')
    })

    it('works for string array with length 1', async () => {
      const calldata = Multicall.encodeMulticall(['0x01'])
      expect(calldata).toBe('0x01')
    })

    it('works for string array with length >1', async () => {
      const calldata = Multicall.encodeMulticall([
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ])
      expect(calldata).toBe(
        '0xac9650d800000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000020aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000000000000000000000000000000000000000000000000000000020bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      )
    })
  })

  describe('#decodeMulticall', () => {
    it('works for string array with length >1', async () => {
      const calldatas: string[] = [
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ]

      // first encode it
      const multicall = Multicall.encodeMulticall(calldatas)
      expect(multicall).toBe(
        '0xac9650d800000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000020aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0000000000000000000000000000000000000000000000000000000000000020bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      )

      // then decode it
      const decodedCalldata = Multicall.decodeMulticall(multicall)
      expect(decodedCalldata.length).toBe(calldatas.length)
      expect(decodedCalldata[0]).toBe(calldatas[0])
      expect(decodedCalldata[1]).toBe(calldatas[1])
    })
  })
})
