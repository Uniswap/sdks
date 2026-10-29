import { SignatureTransfer, PermitTransferFrom, PermitBatchTransferFrom } from './signatureTransfer'

const ZERO = '0x0000000000000000000000000000000000000000'
const WITNESS = {
  witnessTypeName: 'MockWitness',
  witnessType: { MockWitness: [{ name: 'mock', type: 'uint256' }] },
  witness: { mock: '0' },
}

function makePermit(batch: boolean): PermitTransferFrom | PermitBatchTransferFrom {
  const permitted = { token: ZERO, amount: '0' }
  const common = { spender: ZERO, nonce: '0', deadline: '0' }
  return batch ? { ...common, permitted: [permitted] } : { ...common, permitted }
}

const REQUIRED_FIELDS = ['permitted', 'spender', 'nonce', 'deadline'] as const

function viaPrototypeGetters(batch: boolean): PermitTransferFrom | PermitBatchTransferFrom {
  const source = makePermit(batch)
  const prototype = {}
  for (const key of REQUIRED_FIELDS) {
    Object.defineProperty(prototype, key, { get: () => source[key] })
  }
  return Object.create(prototype)
}

function viaNonEnumerableFields(batch: boolean): PermitTransferFrom | PermitBatchTransferFrom {
  const source = makePermit(batch)
  const result = {}
  for (const key of REQUIRED_FIELDS) {
    Object.defineProperty(result, key, { value: source[key], writable: true, configurable: true })
  }
  return result as PermitTransferFrom | PermitBatchTransferFrom
}

const brand = new WeakMap<object, PermitTransferFrom | PermitBatchTransferFrom>()
class BrandedPermit {
  constructor(batch: boolean) {
    brand.set(this, makePermit(batch))
  }
  private read() {
    const data = brand.get(this)
    if (!data) throw new TypeError('illegal receiver')
    return data
  }
  get permitted() {
    return this.read().permitted
  }
  get spender() {
    return this.read().spender
  }
  get nonce() {
    return this.read().nonce
  }
  get deadline() {
    return this.read().deadline
  }
}

const STRUCTURAL_SHAPES = {
  'prototype getters': viaPrototypeGetters,
  'non-enumerable fields': viaNonEnumerableFields,
  'branded class getters': (batch: boolean) => new BrandedPermit(batch) as PermitTransferFrom | PermitBatchTransferFrom,
}

for (const batch of [false, true]) {
  describe(`${batch ? 'batch' : 'single'} witness permit input`, () => {
    it('builds witness data without mutating the caller permit', () => {
      const permit = makePermit(batch)
      const before = Object.getOwnPropertyDescriptors(permit)

      const { values } = SignatureTransfer.getPermitData(permit, ZERO, 1, WITNESS)

      expect(values).not.toBe(permit)
      expect(values).toHaveProperty('witness', WITNESS.witness)
      expect(Object.getOwnPropertyDescriptors(permit)).toEqual(before)
    })

    it('hashes a frozen caller permit', () => {
      const permit = Object.freeze(makePermit(batch))
      const expected = batch
        ? '0xb45d605b0a4d4f16930a4f48294d94c78f34411278fd3133626cc190273e3ccf'
        : '0x4236a4a7b3e8e65dbb4cc758ef10dc4887e2959853fb615140d0f5e0ae7be7c9'

      expect(SignatureTransfer.hash(permit, ZERO, 1, WITNESS)).toBe(expected)
      expect(permit).not.toHaveProperty('witness')
    })

    it('does not overwrite an existing witness property on the caller permit', () => {
      const previousWitness = { mock: '7' }
      const permit = { ...makePermit(batch), witness: previousWitness }

      const { values } = SignatureTransfer.getPermitData(permit, ZERO, 1, WITNESS)

      expect(permit.witness).toBe(previousWitness)
      expect(values).toHaveProperty('witness', WITNESS.witness)
    })

    it('preserves the existing values reference without a witness', () => {
      const permit = Object.freeze(makePermit(batch))

      expect(SignatureTransfer.getPermitData(permit, ZERO, 1).values).toBe(permit)
    })

    for (const [shape, make] of Object.entries(STRUCTURAL_SHAPES)) {
      it(`retains required fields from ${shape}, including frozen input`, () => {
        const permit = make(batch)
        const prototypeBefore = Object.getPrototypeOf(permit)
        const before = Object.getOwnPropertyDescriptors(permit)
        const expected = batch
          ? '0xb45d605b0a4d4f16930a4f48294d94c78f34411278fd3133626cc190273e3ccf'
          : '0x4236a4a7b3e8e65dbb4cc758ef10dc4887e2959853fb615140d0f5e0ae7be7c9'

        expect(SignatureTransfer.hash(permit, ZERO, 1, WITNESS)).toBe(expected)
        const { values } = SignatureTransfer.getPermitData(permit, ZERO, 1, WITNESS)
        for (const key of REQUIRED_FIELDS) {
          expect(Object.prototype.hasOwnProperty.call(values, key)).toBe(true)
        }
        expect(Object.getOwnPropertyDescriptors(permit)).toEqual(before)
        expect(Object.getPrototypeOf(permit)).toBe(prototypeBefore)
        expect(permit).not.toHaveProperty('witness')
        expect(SignatureTransfer.hash(Object.freeze(permit), ZERO, 1, WITNESS)).toBe(expected)
      })
    }

    it('copies extra own fields and shares nested permitted by reference', () => {
      const extra = Symbol('extra')
      const permit = { ...makePermit(batch), memo: 'kept', [extra]: 1 }
      const { values } = SignatureTransfer.getPermitData(permit, ZERO, 1, WITNESS)

      expect(values).toHaveProperty('memo', 'kept')
      expect((values as typeof permit)[extra]).toBe(1)
      expect(values.permitted).toBe(permit.permitted)
    })
  })
}
