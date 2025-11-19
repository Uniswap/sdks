/**
 * Tests for Tribunal builders
 */

import { SCALING_FACTOR } from '../lib/priceCurve'

import { TribunalBuilder, createSameChainFill, createCrossChainFill } from './tribunal'

describe('Tribunal Builders', () => {
  const tribunalAddress = '0x1234567890123456789012345678901234567890' as `0x${string}`
  const adjusterAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`
  const recipientAddress = '0xfedcbafedcbafedcbafedcbafedcbafedcbafedd' as `0x${string}`
  const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`

  describe('FillComponentBuilder', () => {
    it('should build a fill component', () => {
      const component = TribunalBuilder.component()
        .fillToken(usdcAddress)
        .minimumFillAmount(1000000n)
        .recipient(recipientAddress)
        .applyScaling(true)
        .build()

      expect(component.fillToken).toBe(usdcAddress)
      expect(component.minimumFillAmount).toBe(1000000n)
      expect(component.recipient).toBe(recipientAddress)
      expect(component.applyScaling).toBe(true)
    })

    it('should default applyScaling to false', () => {
      const component = TribunalBuilder.component()
        .fillToken(usdcAddress)
        .minimumFillAmount(1000000n)
        .recipient(recipientAddress)
        .build()

      expect(component.applyScaling).toBe(false)
    })

    it('should throw if required fields are missing', () => {
      expect(() => TribunalBuilder.component().build()).toThrow()
    })
  })

  describe('FillParametersBuilder', () => {
    it('should build fill parameters', () => {
      const fill = TribunalBuilder.fill()
        .chainId(1n)
        .tribunal(tribunalAddress)
        .expires(BigInt(Date.now() + 3600000))
        .component((c) => c.fillToken(usdcAddress).minimumFillAmount(1000000n).recipient(recipientAddress))
        .baselinePriorityFee(1000000000n)
        .scalingFactor(SCALING_FACTOR.ONE_TWENTY_PERCENT)
        .priceCurve([{ blockDuration: 100, scalingFactor: SCALING_FACTOR.ONE_FIFTY_PERCENT }])
        .build()

      expect(fill.chainId).toBe(1n)
      expect(fill.tribunal).toBe(tribunalAddress)
      expect(fill.components.length).toBe(1)
      expect(fill.components[0].fillToken).toBe(usdcAddress)
      expect(fill.baselinePriorityFee).toBe(1000000000n)
      expect(fill.scalingFactor).toBe(SCALING_FACTOR.ONE_TWENTY_PERCENT)
      expect(fill.priceCurve.length).toBe(1)
    })

    it('should allow adding multiple components', () => {
      const fill = TribunalBuilder.fill()
        .chainId(1n)
        .tribunal(tribunalAddress)
        .expires(BigInt(Date.now() + 3600000))
        .component((c) => c.fillToken(usdcAddress).minimumFillAmount(1000000n).recipient(recipientAddress))
        .component((c) =>
          c
            .fillToken('0x0000000000000000000000000000000000000000' as `0x${string}`)
            .minimumFillAmount(1000000000000000000n)
            .recipient(recipientAddress)
        )
        .build()

      expect(fill.components.length).toBe(2)
    })

    it('should default to neutral scaling factor', () => {
      const fill = TribunalBuilder.fill()
        .chainId(1n)
        .tribunal(tribunalAddress)
        .expires(BigInt(Date.now() + 3600000))
        .component((c) => c.fillToken(usdcAddress).minimumFillAmount(1000000n).recipient(recipientAddress))
        .build()

      expect(fill.scalingFactor).toBe(SCALING_FACTOR.NEUTRAL)
    })

    it('should handle empty price curve', () => {
      const fill = TribunalBuilder.fill()
        .chainId(1n)
        .tribunal(tribunalAddress)
        .expires(BigInt(Date.now() + 3600000))
        .component((c) => c.fillToken(usdcAddress).minimumFillAmount(1000000n).recipient(recipientAddress))
        .priceCurve([])
        .build()

      expect(fill.priceCurve.length).toBe(0)
    })
  })

  describe('MandateBuilder', () => {
    it('should build a mandate with fills', () => {
      const mandate = TribunalBuilder.mandate()
        .adjuster(adjusterAddress)
        .fill((f) =>
          f
            .chainId(1n)
            .tribunal(tribunalAddress)
            .expires(BigInt(Date.now() + 3600000))
            .component((c) => c.fillToken(usdcAddress).minimumFillAmount(1000000n).recipient(recipientAddress))
        )
        .build()

      expect(mandate.adjuster).toBe(adjusterAddress)
      expect(mandate.fills.length).toBe(1)
      expect(mandate.fills[0].chainId).toBe(1n)
    })

    it('should allow multiple fills', () => {
      const mandate = TribunalBuilder.mandate()
        .adjuster(adjusterAddress)
        .fill((f) =>
          f
            .chainId(1n)
            .tribunal(tribunalAddress)
            .expires(BigInt(Date.now() + 3600000))
            .component((c) => c.fillToken(usdcAddress).minimumFillAmount(1000000n).recipient(recipientAddress))
        )
        .fill((f) =>
          f
            .chainId(137n)
            .tribunal(tribunalAddress)
            .expires(BigInt(Date.now() + 3600000))
            .component((c) => c.fillToken(usdcAddress).minimumFillAmount(2000000n).recipient(recipientAddress))
        )
        .build()

      expect(mandate.fills.length).toBe(2)
      expect(mandate.fills[0].chainId).toBe(1n)
      expect(mandate.fills[1].chainId).toBe(137n)
    })

    it('should throw if adjuster is not set', () => {
      expect(() => TribunalBuilder.mandate().build()).toThrow()
    })

    it('should throw if no fills are added', () => {
      expect(() => TribunalBuilder.mandate().adjuster(adjusterAddress).build()).toThrow()
    })
  })

  describe('convenience functions', () => {
    it('should create same-chain fill', () => {
      const fill = createSameChainFill({
        chainId: 1n,
        tribunal: tribunalAddress,
        expires: BigInt(Date.now() + 3600000),
        fillToken: usdcAddress,
        minimumFillAmount: 1000000n,
        recipient: recipientAddress,
        priceCurve: [{ blockDuration: 100, scalingFactor: SCALING_FACTOR.ONE_FIFTY_PERCENT }],
      })

      expect(fill.chainId).toBe(1n)
      expect(fill.components.length).toBe(1)
      expect(fill.components[0].fillToken).toBe(usdcAddress)
      expect(fill.priceCurve.length).toBe(1)
    })

    it('should create cross-chain fill with callback', () => {
      const targetCompact = {
        arbiter: tribunalAddress,
        sponsor: recipientAddress,
        nonce: 1n,
        expires: BigInt(Date.now() + 3600000),
        commitments: [
          {
            lockTag: '0x000000000000000000000001' as `0x${string}`,
            token: usdcAddress,
            amount: 1000000n,
          },
        ],
      }

      const fill = createCrossChainFill({
        sourceChainId: 1n,
        targetChainId: 137n,
        sourceTribunal: tribunalAddress,
        expires: BigInt(Date.now() + 3600000),
        fillToken: usdcAddress,
        minimumFillAmount: 1000000n,
        bridgeRecipient: recipientAddress,
        targetCompact,
        targetMandateHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      })

      expect(fill.chainId).toBe(1n)
      expect(fill.recipientCallback.length).toBe(1)
      expect(fill.recipientCallback[0].chainId).toBe(137n)
      expect(fill.recipientCallback[0].compact).toEqual(targetCompact)
    })
  })

  describe('complex mandate example', () => {
    it('should build a cross-chain swap mandate', () => {
      const expires = BigInt(Date.now() + 3600000)

      const mandate = TribunalBuilder.mandate()
        .adjuster(adjusterAddress)
        // Cross-chain fill on source chain
        .fill((f) =>
          f
            .chainId(1n)
            .tribunal(tribunalAddress)
            .expires(expires)
            .component((c) =>
              c
                .fillToken(usdcAddress)
                .minimumFillAmount(10000000n) // 10 USDC
                .recipient(recipientAddress)
                .applyScaling(true)
            )
            .baselinePriorityFee(1000000000n) // 1 gwei
            .scalingFactor(SCALING_FACTOR.ONE_FIFTY_PERCENT)
            .priceCurve([
              { blockDuration: 30, scalingFactor: SCALING_FACTOR.ONE_FIFTY_PERCENT },
              { blockDuration: 40, scalingFactor: SCALING_FACTOR.ONE_TWENTY_PERCENT },
              { blockDuration: 30, scalingFactor: SCALING_FACTOR.NEUTRAL },
            ])
        )
        // Same-chain fill as fallback
        .fill((f) =>
          f
            .chainId(1n)
            .tribunal(tribunalAddress)
            .expires(expires + 3600n)
            .component((c) =>
              c
                .fillToken('0x0000000000000000000000000000000000000000' as `0x${string}`)
                .minimumFillAmount(1000000000000000000n) // 1 ETH
                .recipient(recipientAddress)
            )
            .priceCurve([{ blockDuration: 100, scalingFactor: SCALING_FACTOR.NINETY_PERCENT }])
        )
        .build()

      expect(mandate.adjuster).toBe(adjusterAddress)
      expect(mandate.fills.length).toBe(2)
      expect(mandate.fills[0].components[0].applyScaling).toBe(true)
      expect(mandate.fills[1].components[0].fillToken).toBe('0x0000000000000000000000000000000000000000')
    })
  })
})
