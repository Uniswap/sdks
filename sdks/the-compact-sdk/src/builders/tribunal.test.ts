/**
 * Tests for Tribunal builders
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { Address, Hex } from 'viem'

import {
  FillComponentBuilder,
  FillParametersBuilder,
  MandateBuilder,
  TribunalBuilder,
  TribunalAdjustmentBuilder,
  createSameChainFill,
} from './tribunal'
import { createTribunalDomain } from '../config/tribunal'
import { deriveTribunalAdjustmentHash } from '../encoding/tribunal'

// Test addresses
const testFillToken = '0x0000000000000000000000000000000000000001' as Address
const testRecipient = '0x0000000000000000000000000000000000000002' as Address
const testTribunal = '0x0000000000000000000000000000000000000003' as Address
const testAdjuster = '0x0000000000000000000000000000000000000004' as Address
const testFiller = '0x1234567890123456789012345678901234567890' as Address
const testSalt = '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex
const testClaimHash = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd' as Hex

describe('FillComponentBuilder', () => {
  it('builds a valid component with all fields', () => {
    const component = new FillComponentBuilder()
      .fillToken(testFillToken)
      .minimumFillAmount(1000000n)
      .recipient(testRecipient)
      .applyScaling(true)
      .build()

    expect(component.fillToken).toBe(testFillToken)
    expect(component.minimumFillAmount).toBe(1000000n)
    expect(component.recipient).toBe(testRecipient)
    expect(component.applyScaling).toBe(true)
  })

  it('defaults applyScaling to false', () => {
    const component = new FillComponentBuilder()
      .fillToken(testFillToken)
      .minimumFillAmount(1000000n)
      .recipient(testRecipient)
      .build()

    expect(component.applyScaling).toBe(false)
  })

  it('throws without fillToken', () => {
    expect(() => new FillComponentBuilder().minimumFillAmount(1000000n).recipient(testRecipient).build()).toThrow(
      'fillToken is required'
    )
  })

  it('throws without minimumFillAmount', () => {
    expect(() => new FillComponentBuilder().fillToken(testFillToken).recipient(testRecipient).build()).toThrow(
      'minimumFillAmount is required'
    )
  })

  it('throws without recipient', () => {
    expect(() => new FillComponentBuilder().fillToken(testFillToken).minimumFillAmount(1000000n).build()).toThrow(
      'recipient is required'
    )
  })
})

describe('FillParametersBuilder', () => {
  it('builds a valid fill with all required fields', () => {
    const fill = new FillParametersBuilder()
      .chainId(1n)
      .tribunal(testTribunal)
      .expires(1000000n)
      .addComponent({
        fillToken: testFillToken,
        minimumFillAmount: 1000000n,
        recipient: testRecipient,
        applyScaling: false,
      })
      .salt(testSalt)
      .build()

    expect(fill.chainId).toBe(1n)
    expect(fill.tribunal).toBe(testTribunal)
    expect(fill.expires).toBe(1000000n)
    expect(fill.components).toHaveLength(1)
    expect(fill.baselinePriorityFee).toBe(0n)
    expect(fill.scalingFactor).toBe(1000000000000000000n)
    expect(fill.priceCurve).toHaveLength(0)
    expect(fill.recipientCallback).toHaveLength(0)
    expect(fill.salt).toBe(testSalt)
  })

  it('builds with component builder function', () => {
    const fill = new FillParametersBuilder()
      .chainId(1n)
      .tribunal(testTribunal)
      .expires(1000000n)
      .component((c) =>
        c.fillToken(testFillToken).minimumFillAmount(1000000n).recipient(testRecipient).applyScaling(true)
      )
      .build()

    expect(fill.components).toHaveLength(1)
    expect(fill.components[0].applyScaling).toBe(true)
  })

  it('generates random salt when not specified', () => {
    const fill1 = new FillParametersBuilder()
      .chainId(1n)
      .tribunal(testTribunal)
      .expires(1000000n)
      .addComponent({
        fillToken: testFillToken,
        minimumFillAmount: 1000000n,
        recipient: testRecipient,
        applyScaling: false,
      })
      .build()

    const fill2 = new FillParametersBuilder()
      .chainId(1n)
      .tribunal(testTribunal)
      .expires(1000000n)
      .addComponent({
        fillToken: testFillToken,
        minimumFillAmount: 1000000n,
        recipient: testRecipient,
        applyScaling: false,
      })
      .build()

    // Salts should be different (unless we're astronomically unlucky)
    expect(fill1.salt).not.toBe(fill2.salt)
  })

  it('throws without chainId', () => {
    expect(() =>
      new FillParametersBuilder()
        .tribunal(testTribunal)
        .expires(1000000n)
        .addComponent({
          fillToken: testFillToken,
          minimumFillAmount: 1000000n,
          recipient: testRecipient,
          applyScaling: false,
        })
        .build()
    ).toThrow('chainId is required')
  })

  it('throws without tribunal', () => {
    expect(() =>
      new FillParametersBuilder()
        .chainId(1n)
        .expires(1000000n)
        .addComponent({
          fillToken: testFillToken,
          minimumFillAmount: 1000000n,
          recipient: testRecipient,
          applyScaling: false,
        })
        .build()
    ).toThrow('tribunal is required')
  })

  it('throws without expires', () => {
    expect(() =>
      new FillParametersBuilder()
        .chainId(1n)
        .tribunal(testTribunal)
        .addComponent({
          fillToken: testFillToken,
          minimumFillAmount: 1000000n,
          recipient: testRecipient,
          applyScaling: false,
        })
        .build()
    ).toThrow('expires is required')
  })

  it('throws without components', () => {
    expect(() => new FillParametersBuilder().chainId(1n).tribunal(testTribunal).expires(1000000n).build()).toThrow(
      'at least one component is required'
    )
  })
})

describe('MandateBuilder', () => {
  it('builds a valid mandate', () => {
    const mandate = new MandateBuilder()
      .adjuster(testAdjuster)
      .addFill({
        chainId: 1n,
        tribunal: testTribunal,
        expires: 1000000n,
        components: [
          {
            fillToken: testFillToken,
            minimumFillAmount: 1000000n,
            recipient: testRecipient,
            applyScaling: false,
          },
        ],
        baselinePriorityFee: 0n,
        scalingFactor: 1000000000000000000n,
        priceCurve: [],
        recipientCallback: [],
        salt: testSalt,
      })
      .build()

    expect(mandate.adjuster).toBe(testAdjuster)
    expect(mandate.fills).toHaveLength(1)
  })

  it('builds with fill builder function', () => {
    const mandate = new MandateBuilder()
      .adjuster(testAdjuster)
      .fill((f) =>
        f
          .chainId(1n)
          .tribunal(testTribunal)
          .expires(1000000n)
          .component((c) => c.fillToken(testFillToken).minimumFillAmount(1000000n).recipient(testRecipient))
      )
      .build()

    expect(mandate.fills).toHaveLength(1)
  })

  it('throws without adjuster', () => {
    expect(() =>
      new MandateBuilder()
        .addFill({
          chainId: 1n,
          tribunal: testTribunal,
          expires: 1000000n,
          components: [
            {
              fillToken: testFillToken,
              minimumFillAmount: 1000000n,
              recipient: testRecipient,
              applyScaling: false,
            },
          ],
          baselinePriorityFee: 0n,
          scalingFactor: 1000000000000000000n,
          priceCurve: [],
          recipientCallback: [],
          salt: testSalt,
        })
        .build()
    ).toThrow('adjuster is required')
  })

  it('throws without fills', () => {
    expect(() => new MandateBuilder().adjuster(testAdjuster).build()).toThrow('at least one fill is required')
  })
})

describe('TribunalBuilder', () => {
  it('provides mandate() factory method', () => {
    const builder = TribunalBuilder.mandate()
    expect(builder).toBeInstanceOf(MandateBuilder)
  })

  it('provides fill() factory method', () => {
    const builder = TribunalBuilder.fill()
    expect(builder).toBeInstanceOf(FillParametersBuilder)
  })

  it('provides component() factory method', () => {
    const builder = TribunalBuilder.component()
    expect(builder).toBeInstanceOf(FillComponentBuilder)
  })
})

describe('TribunalAdjustmentBuilder', () => {
  let domain: ReturnType<typeof createTribunalDomain>

  beforeEach(() => {
    domain = createTribunalDomain({
      chainId: 1,
      tribunalAddress: testTribunal,
    })
  })

  it('builds a valid adjustment', () => {
    const builder = new TribunalAdjustmentBuilder(domain).adjuster(testAdjuster).fillIndex(0n).targetBlock(12345n)

    const { adjustment, typedData, hash } = builder.build(testClaimHash)

    expect(adjustment.adjuster).toBe(testAdjuster)
    expect(adjustment.fillIndex).toBe(0n)
    expect(adjustment.targetBlock).toBe(12345n)
    expect(adjustment.supplementalPriceCurve).toEqual([])
    expect(adjustment.validityConditions).toBe('0x0000000000000000000000000000000000000000000000000000000000000000')

    expect(typedData.domain).toBe(domain)
    expect(typedData.primaryType).toBe('Adjustment')
    expect(hash).toMatch(/^0x[a-f0-9]{64}$/i)
  })

  it('builds with supplemental price curve', () => {
    const builder = new TribunalAdjustmentBuilder(domain)
      .adjuster(testAdjuster)
      .fillIndex(0n)
      .targetBlock(12345n)
      .supplementalPriceCurveRaw([1100000000000000000n, 1200000000000000000n])

    const { adjustment } = builder.build(testClaimHash)

    expect(adjustment.supplementalPriceCurve).toEqual([1100000000000000000n, 1200000000000000000n])
  })

  it('builds with exclusive filler', () => {
    const builder = new TribunalAdjustmentBuilder(domain)
      .adjuster(testAdjuster)
      .fillIndex(0n)
      .targetBlock(12345n)
      .exclusiveFiller(testFiller)

    const { adjustment } = builder.build(testClaimHash)

    // Lower 160 bits should be the filler address
    const lower160 = BigInt(adjustment.validityConditions) & ((1n << 160n) - 1n)
    expect(lower160).toBe(BigInt(testFiller))
  })

  it('builds with block window', () => {
    const builder = new TribunalAdjustmentBuilder(domain)
      .adjuster(testAdjuster)
      .fillIndex(0n)
      .targetBlock(12345n)
      .blockWindow(10)

    const { adjustment } = builder.build(testClaimHash)

    // Upper 96 bits should be the block window
    const upper96 = BigInt(adjustment.validityConditions) >> 160n
    expect(upper96).toBe(10n)
  })

  it('builds with both exclusive filler and block window', () => {
    const builder = new TribunalAdjustmentBuilder(domain)
      .adjuster(testAdjuster)
      .fillIndex(0n)
      .targetBlock(12345n)
      .exclusiveFiller(testFiller)
      .blockWindow(10)

    const { adjustment } = builder.build(testClaimHash)

    // Lower 160 bits = filler address
    const lower160 = BigInt(adjustment.validityConditions) & ((1n << 160n) - 1n)
    expect(lower160).toBe(BigInt(testFiller))

    // Upper 96 bits = block window
    const upper96 = BigInt(adjustment.validityConditions) >> 160n
    expect(upper96).toBe(10n)
  })

  it('builds with signature', () => {
    const builder = new TribunalAdjustmentBuilder(domain).adjuster(testAdjuster).fillIndex(0n).targetBlock(12345n)

    const mockSignature = '0xabcd' as Hex
    const adjustment = builder.buildWithSignature(testClaimHash, mockSignature)

    expect(adjustment.adjustmentAuthorization).toBe(mockSignature)
    expect(adjustment.adjuster).toBe(testAdjuster)
  })

  it('hash matches deriveTribunalAdjustmentHash', () => {
    const builder = new TribunalAdjustmentBuilder(domain)
      .adjuster(testAdjuster)
      .fillIndex(0n)
      .targetBlock(12345n)
      .supplementalPriceCurveRaw([1100000000000000000n])

    const { adjustment, hash } = builder.build(testClaimHash)

    // Verify hash matches the encoding function
    const expectedHash = deriveTribunalAdjustmentHash(
      {
        fillIndex: adjustment.fillIndex,
        targetBlock: adjustment.targetBlock,
        supplementalPriceCurve: adjustment.supplementalPriceCurve,
        validityConditions: adjustment.validityConditions,
      },
      testClaimHash
    )

    expect(hash).toBe(expectedHash)
  })

  it('throws without adjuster', () => {
    const builder = new TribunalAdjustmentBuilder(domain).fillIndex(0n).targetBlock(12345n)

    expect(() => builder.build(testClaimHash)).toThrow('adjuster is required')
  })

  it('throws without fillIndex', () => {
    const builder = new TribunalAdjustmentBuilder(domain).adjuster(testAdjuster).targetBlock(12345n)

    expect(() => builder.build(testClaimHash)).toThrow('fillIndex is required')
  })

  it('throws without targetBlock', () => {
    const builder = new TribunalAdjustmentBuilder(domain).adjuster(testAdjuster).fillIndex(0n)

    expect(() => builder.build(testClaimHash)).toThrow('targetBlock is required')
  })

  it('typed data does NOT include adjuster (unlike Exarch)', () => {
    const builder = new TribunalAdjustmentBuilder(domain).adjuster(testAdjuster).fillIndex(0n).targetBlock(12345n)

    const { typedData } = builder.build(testClaimHash)

    // Tribunal adjustment message should NOT include adjuster
    expect(typedData.message).not.toHaveProperty('adjuster')
    expect(typedData.message).toHaveProperty('claimHash')
    expect(typedData.message).toHaveProperty('fillIndex')
    expect(typedData.message).toHaveProperty('targetBlock')
    expect(typedData.message).toHaveProperty('supplementalPriceCurve')
    expect(typedData.message).toHaveProperty('validityConditions')
  })
})

describe('createSameChainFill', () => {
  it('creates a valid same-chain fill', () => {
    const fill = createSameChainFill({
      chainId: 1n,
      tribunal: testTribunal,
      expires: 1000000n,
      fillToken: testFillToken,
      minimumFillAmount: 1000000n,
      recipient: testRecipient,
    })

    expect(fill.chainId).toBe(1n)
    expect(fill.tribunal).toBe(testTribunal)
    expect(fill.expires).toBe(1000000n)
    expect(fill.components).toHaveLength(1)
    expect(fill.components[0].fillToken).toBe(testFillToken)
    expect(fill.components[0].minimumFillAmount).toBe(1000000n)
    expect(fill.components[0].recipient).toBe(testRecipient)
    expect(fill.scalingFactor).toBe(1000000000000000000n) // Default neutral
  })

  it('applies custom scaling factor', () => {
    const fill = createSameChainFill({
      chainId: 1n,
      tribunal: testTribunal,
      expires: 1000000n,
      fillToken: testFillToken,
      minimumFillAmount: 1000000n,
      recipient: testRecipient,
      scalingFactor: 1500000000000000000n,
    })

    expect(fill.scalingFactor).toBe(1500000000000000000n)
  })
})
