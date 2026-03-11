/**
 * Tests for Exarch builders
 */

import { Address, Hex, parseEther } from 'viem'

import { createExarchDomain } from '../config/exarch'
import { SCALING_FACTOR } from '../lib/priceCurve'

import {
  ExarchBuilder,
  ExarchFillComponentBuilder,
  ExarchFillParametersBuilder,
  ExarchMandateBuilder,
  ExarchAdjustmentBuilder,
  FillInstructionBuilder,
  createExarchSameChainFill,
  createExarchCrossChainFill,
} from './exarch'

describe('Exarch Builders', () => {
  const exarchAddress = '0x1234567890123456789012345678901234567890' as Address
  const adjusterAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Address
  const legateAddress = '0xfedcbafedcbafedcbafedcbafedcbafedcbafedd' as Address
  const recipientAddress = '0x1111111111111111111111111111111111111111' as Address
  const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address
  const bidderAddress = '0x2222222222222222222222222222222222222222' as Address

  describe('ExarchFillComponentBuilder', () => {
    it('should build a fill component', () => {
      const component = new ExarchFillComponentBuilder()
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
      const component = ExarchBuilder.component()
        .fillToken(usdcAddress)
        .minimumFillAmount(1000000n)
        .recipient(recipientAddress)
        .build()

      expect(component.applyScaling).toBe(false)
    })

    it('should throw if required fields are missing', () => {
      expect(() => ExarchBuilder.component().build()).toThrow()
      expect(() => ExarchBuilder.component().fillToken(usdcAddress).build()).toThrow()
      expect(() => ExarchBuilder.component().fillToken(usdcAddress).minimumFillAmount(1000000n).build()).toThrow()
    })
  })

  describe('ExarchFillParametersBuilder', () => {
    it('should build fill parameters with bonding fields', () => {
      const fill = ExarchBuilder.fill()
        .chainId(1n)
        .exarch(exarchAddress)
        .expires(BigInt(Date.now() + 3600000))
        .component((c) => c.fillToken(usdcAddress).minimumFillAmount(1000000n).recipient(recipientAddress))
        .bondAmount(parseEther('0.1'))
        .earnestAmount(parseEther('0.01'))
        .holdPeriod(100n)
        .baselinePriorityFee(1000000000n)
        .scalingFactor(SCALING_FACTOR.ONE_TWENTY_PERCENT)
        .priceCurve([{ blockDuration: 100, scalingFactor: SCALING_FACTOR.ONE_FIFTY_PERCENT }])
        .build()

      expect(fill.chainId).toBe(1n)
      expect(fill.exarch).toBe(exarchAddress)
      expect(fill.components.length).toBe(1)
      expect(fill.bondAmount).toBe(parseEther('0.1'))
      expect(fill.earnestAmount).toBe(parseEther('0.01'))
      expect(fill.holdPeriod).toBe(100n)
      expect(fill.baselinePriorityFee).toBe(1000000000n)
      expect(fill.scalingFactor).toBe(SCALING_FACTOR.ONE_TWENTY_PERCENT)
      expect(fill.priceCurve.length).toBe(1)
    })

    it('should allow adding multiple components', () => {
      const fill = ExarchBuilder.fill()
        .chainId(1n)
        .exarch(exarchAddress)
        .expires(BigInt(Date.now() + 3600000))
        .component((c) => c.fillToken(usdcAddress).minimumFillAmount(1000000n).recipient(recipientAddress))
        .component((c) =>
          c
            .fillToken('0x0000000000000000000000000000000000000000' as Address)
            .minimumFillAmount(1000000000000000000n)
            .recipient(recipientAddress)
        )
        .build()

      expect(fill.components.length).toBe(2)
    })

    it('should default to neutral scaling factor', () => {
      const fill = ExarchBuilder.fill()
        .chainId(1n)
        .exarch(exarchAddress)
        .expires(BigInt(Date.now() + 3600000))
        .component((c) => c.fillToken(usdcAddress).minimumFillAmount(1000000n).recipient(recipientAddress))
        .build()

      expect(fill.scalingFactor).toBe(SCALING_FACTOR.NEUTRAL)
    })

    it('should default bonding parameters to zero', () => {
      const fill = ExarchBuilder.fill()
        .chainId(1n)
        .exarch(exarchAddress)
        .expires(BigInt(Date.now() + 3600000))
        .component((c) => c.fillToken(usdcAddress).minimumFillAmount(1000000n).recipient(recipientAddress))
        .build()

      expect(fill.bondAmount).toBe(0n)
      expect(fill.earnestAmount).toBe(0n)
      expect(fill.holdPeriod).toBe(0n)
    })

    it('should throw if earnestAmount exceeds bondAmount', () => {
      expect(() =>
        ExarchBuilder.fill()
          .chainId(1n)
          .exarch(exarchAddress)
          .expires(BigInt(Date.now() + 3600000))
          .component((c) => c.fillToken(usdcAddress).minimumFillAmount(1000000n).recipient(recipientAddress))
          .bondAmount(parseEther('0.01'))
          .earnestAmount(parseEther('0.1'))
          .build()
      ).toThrow()
    })

    it('should support raw price curve input', () => {
      const rawCurve = [
        (BigInt(100) << 240n) | SCALING_FACTOR.ONE_FIFTY_PERCENT,
        (BigInt(50) << 240n) | SCALING_FACTOR.NEUTRAL,
      ]

      const fill = ExarchBuilder.fill()
        .chainId(1n)
        .exarch(exarchAddress)
        .expires(BigInt(Date.now() + 3600000))
        .component((c) => c.fillToken(usdcAddress).minimumFillAmount(1000000n).recipient(recipientAddress))
        .priceCurveRaw(rawCurve)
        .build()

      expect(fill.priceCurve).toEqual(rawCurve)
    })
  })

  describe('ExarchMandateBuilder', () => {
    it('should build a mandate with legate', () => {
      const mandate = ExarchBuilder.mandate()
        .adjuster(adjusterAddress)
        .legate(legateAddress)
        .fill((f) =>
          f
            .chainId(1n)
            .exarch(exarchAddress)
            .expires(BigInt(Date.now() + 3600000))
            .component((c) => c.fillToken(usdcAddress).minimumFillAmount(1000000n).recipient(recipientAddress))
        )
        .build()

      expect(mandate.adjuster).toBe(adjusterAddress)
      expect(mandate.legate).toBe(legateAddress)
      expect(mandate.fills.length).toBe(1)
      expect(mandate.fills[0].chainId).toBe(1n)
    })

    it('should allow multiple fills', () => {
      const mandate = ExarchBuilder.mandate()
        .adjuster(adjusterAddress)
        .legate(legateAddress)
        .fill((f) =>
          f
            .chainId(1n)
            .exarch(exarchAddress)
            .expires(BigInt(Date.now() + 3600000))
            .component((c) => c.fillToken(usdcAddress).minimumFillAmount(1000000n).recipient(recipientAddress))
        )
        .fill((f) =>
          f
            .chainId(10n)
            .exarch(exarchAddress)
            .expires(BigInt(Date.now() + 3600000))
            .component((c) => c.fillToken(usdcAddress).minimumFillAmount(2000000n).recipient(recipientAddress))
        )
        .build()

      expect(mandate.fills.length).toBe(2)
      expect(mandate.fills[0].chainId).toBe(1n)
      expect(mandate.fills[1].chainId).toBe(10n)
    })

    it('should throw if adjuster is not set', () => {
      expect(() =>
        ExarchBuilder.mandate()
          .legate(legateAddress)
          .fill((f) =>
            f
              .chainId(1n)
              .exarch(exarchAddress)
              .expires(BigInt(Date.now() + 3600000))
              .component((c) => c.fillToken(usdcAddress).minimumFillAmount(1000000n).recipient(recipientAddress))
          )
          .build()
      ).toThrow()
    })

    it('should throw if legate is not set', () => {
      expect(() =>
        ExarchBuilder.mandate()
          .adjuster(adjusterAddress)
          .fill((f) =>
            f
              .chainId(1n)
              .exarch(exarchAddress)
              .expires(BigInt(Date.now() + 3600000))
              .component((c) => c.fillToken(usdcAddress).minimumFillAmount(1000000n).recipient(recipientAddress))
          )
          .build()
      ).toThrow()
    })

    it('should throw if no fills are added', () => {
      expect(() => ExarchBuilder.mandate().adjuster(adjusterAddress).legate(legateAddress).build()).toThrow()
    })
  })

  describe('ExarchAdjustmentBuilder', () => {
    const domain = createExarchDomain({ chainId: 1, exarchAddress })
    const claimHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex

    it('should build an adjustment for signing', () => {
      const { adjustment, typedData, hash } = ExarchBuilder.adjustment(domain)
        .adjuster(adjusterAddress)
        .fillIndex(0n)
        .targetBlock(1000n)
        .nonce(12345n)
        .build(claimHash)

      expect(adjustment.adjuster).toBe(adjusterAddress)
      expect(adjustment.fillIndex).toBe(0n)
      expect(adjustment.targetBlock).toBe(1000n)
      expect(adjustment.nonce).toBe(12345n)
      expect(adjustment.supplementalPriceCurve).toEqual([])
      expect(typedData.domain).toEqual(domain)
      expect(typedData.primaryType).toBe('Adjustment')
      expect(hash).toBeDefined()
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/)
    })

    it('should support supplemental price curve', () => {
      const { adjustment } = ExarchBuilder.adjustment(domain)
        .adjuster(adjusterAddress)
        .fillIndex(0n)
        .targetBlock(1000n)
        .nonce(12345n)
        .supplementalPriceCurve([{ blockDuration: 50, scalingFactor: SCALING_FACTOR.ONE_TWENTY_PERCENT }])
        .build(claimHash)

      expect(adjustment.supplementalPriceCurve.length).toBe(1)
    })

    it('should support exclusive bidder', () => {
      const { adjustment } = ExarchBuilder.adjustment(domain)
        .adjuster(adjusterAddress)
        .fillIndex(0n)
        .targetBlock(1000n)
        .nonce(12345n)
        .exclusiveBidder(bidderAddress)
        .build(claimHash)

      // Lower 160 bits should contain bidder address
      const bidderFromConditions = BigInt(adjustment.validityConditions) & ((1n << 160n) - 1n)
      expect(bidderFromConditions).toBe(BigInt(bidderAddress))
    })

    it('should support block window', () => {
      const { adjustment } = ExarchBuilder.adjustment(domain)
        .adjuster(adjusterAddress)
        .fillIndex(0n)
        .targetBlock(1000n)
        .nonce(12345n)
        .blockWindow(10)
        .build(claimHash)

      // Upper 96 bits should contain block window
      const blockWindow = BigInt(adjustment.validityConditions) >> 160n
      expect(blockWindow).toBe(10n)
    })

    it('should combine exclusive bidder and block window', () => {
      const { adjustment } = ExarchBuilder.adjustment(domain)
        .adjuster(adjusterAddress)
        .fillIndex(0n)
        .targetBlock(1000n)
        .nonce(12345n)
        .exclusiveBidder(bidderAddress)
        .blockWindow(10)
        .build(claimHash)

      const bidderFromConditions = BigInt(adjustment.validityConditions) & ((1n << 160n) - 1n)
      const blockWindow = BigInt(adjustment.validityConditions) >> 160n

      expect(bidderFromConditions).toBe(BigInt(bidderAddress))
      expect(blockWindow).toBe(10n)
    })

    it('should build with signature', () => {
      const signature =
        '0xabcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234567890ab1c' as Hex

      const adjustment = ExarchBuilder.adjustment(domain)
        .adjuster(adjusterAddress)
        .fillIndex(0n)
        .targetBlock(1000n)
        .nonce(12345n)
        .buildWithSignature(claimHash, signature)

      expect(adjustment.adjustmentAuthorization).toBe(signature)
    })

    it('should support random nonce', () => {
      const builder1 = ExarchBuilder.adjustment(domain)
        .adjuster(adjusterAddress)
        .fillIndex(0n)
        .targetBlock(1000n)
        .randomNonce()

      const builder2 = ExarchBuilder.adjustment(domain)
        .adjuster(adjusterAddress)
        .fillIndex(0n)
        .targetBlock(1000n)
        .randomNonce()

      const { adjustment: adj1 } = builder1.build(claimHash)
      const { adjustment: adj2 } = builder2.build(claimHash)

      // Nonces should be different (with extremely high probability)
      expect(adj1.nonce).not.toBe(adj2.nonce)
    })

    it('should throw if required fields are missing', () => {
      expect(() =>
        ExarchBuilder.adjustment(domain).fillIndex(0n).targetBlock(1000n).nonce(1n).build(claimHash)
      ).toThrow()
      expect(() =>
        ExarchBuilder.adjustment(domain).adjuster(adjusterAddress).targetBlock(1000n).nonce(1n).build(claimHash)
      ).toThrow()
      expect(() =>
        ExarchBuilder.adjustment(domain).adjuster(adjusterAddress).fillIndex(0n).nonce(1n).build(claimHash)
      ).toThrow()
      expect(() =>
        ExarchBuilder.adjustment(domain).adjuster(adjusterAddress).fillIndex(0n).targetBlock(1000n).build(claimHash)
      ).toThrow()
    })
  })

  describe('FillInstructionBuilder', () => {
    it('should build fill instruction', () => {
      const instruction = ExarchBuilder.fillInstruction()
        .fillToken(usdcAddress)
        .fillAmount(1000000n)
        .recipient(recipientAddress)
        .build()

      expect(instruction.fillToken).toBe(usdcAddress)
      expect(instruction.fillAmount).toBe(1000000n)
      expect(instruction.recipient).toBe(recipientAddress)
    })

    it('should throw if required fields are missing', () => {
      expect(() => ExarchBuilder.fillInstruction().build()).toThrow()
    })
  })

  describe('ExarchBuilder static methods', () => {
    it('should create builders via static methods', () => {
      expect(ExarchBuilder.mandate()).toBeInstanceOf(ExarchMandateBuilder)
      expect(ExarchBuilder.fill()).toBeInstanceOf(ExarchFillParametersBuilder)
      expect(ExarchBuilder.component()).toBeInstanceOf(ExarchFillComponentBuilder)
      expect(ExarchBuilder.fillInstruction()).toBeInstanceOf(FillInstructionBuilder)
    })

    it('should create adjustment builder with domain', () => {
      const domain = createExarchDomain({ chainId: 1, exarchAddress })
      expect(ExarchBuilder.adjustment(domain)).toBeInstanceOf(ExarchAdjustmentBuilder)
    })

    it('should create adjustment builder for chain', () => {
      expect(ExarchBuilder.adjustmentForChain({ chainId: 1, exarchAddress })).toBeInstanceOf(ExarchAdjustmentBuilder)
    })
  })

  describe('convenience functions', () => {
    it('should create same-chain fill', () => {
      const fill = createExarchSameChainFill({
        chainId: 1n,
        exarch: exarchAddress,
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

    it('should create same-chain fill with bonding params', () => {
      const fill = createExarchSameChainFill({
        chainId: 1n,
        exarch: exarchAddress,
        expires: BigInt(Date.now() + 3600000),
        fillToken: usdcAddress,
        minimumFillAmount: 1000000n,
        recipient: recipientAddress,
        bondAmount: parseEther('0.1'),
        earnestAmount: parseEther('0.01'),
        holdPeriod: 100n,
      })

      expect(fill.bondAmount).toBe(parseEther('0.1'))
      expect(fill.earnestAmount).toBe(parseEther('0.01'))
      expect(fill.holdPeriod).toBe(100n)
    })

    it('should create cross-chain fill with callback', () => {
      const targetCompact = {
        arbiter: exarchAddress,
        sponsor: recipientAddress,
        nonce: 1n,
        expires: BigInt(Date.now() + 3600000),
        commitments: [
          {
            lockTag: '0x000000000000000000000001' as Hex,
            token: usdcAddress,
            amount: 1000000n,
          },
        ],
      }

      const fill = createExarchCrossChainFill({
        sourceChainId: 1n,
        targetChainId: 10n,
        sourceExarch: exarchAddress,
        expires: BigInt(Date.now() + 3600000),
        fillToken: usdcAddress,
        minimumFillAmount: 1000000n,
        bridgeRecipient: recipientAddress,
        bondAmount: parseEther('0.1'),
        earnestAmount: parseEther('0.01'),
        holdPeriod: 100n,
        targetCompact,
        targetMandateHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      })

      expect(fill.chainId).toBe(1n)
      expect(fill.bondAmount).toBe(parseEther('0.1'))
      expect(fill.earnestAmount).toBe(parseEther('0.01'))
      expect(fill.holdPeriod).toBe(100n)
      expect(fill.recipientCallback.length).toBe(1)
      expect(fill.recipientCallback[0].chainId).toBe(10n)
      expect(fill.recipientCallback[0].compact).toEqual(targetCompact)
    })
  })

  describe('complex mandate example', () => {
    it('should build a bonded cross-chain swap mandate', () => {
      const expires = BigInt(Date.now() + 3600000)

      const mandate = ExarchBuilder.mandate()
        .adjuster(adjusterAddress)
        .legate(legateAddress)
        // Cross-chain fill with bonding
        .fill((f) =>
          f
            .chainId(1n)
            .exarch(exarchAddress)
            .expires(expires)
            .component((c) =>
              c
                .fillToken(usdcAddress)
                .minimumFillAmount(10000000n) // 10 USDC
                .recipient(recipientAddress)
                .applyScaling(true)
            )
            .bondAmount(parseEther('0.1'))
            .earnestAmount(parseEther('0.01'))
            .holdPeriod(100n)
            .baselinePriorityFee(1000000000n) // 1 gwei
            .scalingFactor(SCALING_FACTOR.ONE_FIFTY_PERCENT)
            .priceCurve([
              { blockDuration: 30, scalingFactor: SCALING_FACTOR.ONE_FIFTY_PERCENT },
              { blockDuration: 40, scalingFactor: SCALING_FACTOR.ONE_TWENTY_PERCENT },
              { blockDuration: 30, scalingFactor: SCALING_FACTOR.NEUTRAL },
            ])
        )
        // Same-chain fill as fallback (no bonding needed)
        .fill((f) =>
          f
            .chainId(1n)
            .exarch(exarchAddress)
            .expires(expires + 3600n)
            .component((c) =>
              c
                .fillToken('0x0000000000000000000000000000000000000000' as Address)
                .minimumFillAmount(1000000000000000000n) // 1 ETH
                .recipient(recipientAddress)
            )
            .priceCurve([{ blockDuration: 100, scalingFactor: SCALING_FACTOR.NINETY_PERCENT }])
        )
        .build()

      expect(mandate.adjuster).toBe(adjusterAddress)
      expect(mandate.legate).toBe(legateAddress)
      expect(mandate.fills.length).toBe(2)
      expect(mandate.fills[0].bondAmount).toBe(parseEther('0.1'))
      expect(mandate.fills[0].earnestAmount).toBe(parseEther('0.01'))
      expect(mandate.fills[0].holdPeriod).toBe(100n)
      expect(mandate.fills[0].components[0].applyScaling).toBe(true)
      expect(mandate.fills[1].bondAmount).toBe(0n)
      expect(mandate.fills[1].components[0].fillToken).toBe('0x0000000000000000000000000000000000000000')
    })
  })
})
