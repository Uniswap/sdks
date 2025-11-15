import { expect } from 'chai'
import { BigNumber, utils, Wallet } from 'ethers'
import { SwapRouter, SignedRouteOptions } from '../../src/swapRouter'
import { generateNonce, NONCE_SKIP_CHECK } from '../../src/utils/eip712'
import { UNIVERSAL_ROUTER_ADDRESS, UniversalRouterVersion } from '../../src/utils/constants'

describe('Signed Routes', () => {
  const wallet = new Wallet(utils.zeroPad('0x1234', 32))
  const chainId = 1
  const routerAddress = UNIVERSAL_ROUTER_ADDRESS(UniversalRouterVersion.V2_0, chainId)
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20

  // Create mock calldata for testing EIP712 functionality
  // The actual swap details don't matter for testing signing/encoding
  const mockCalldata = SwapRouter.INTERFACE.encodeFunctionData('execute(bytes,bytes[],uint256)', [
    '0x00', // commands
    ['0x'], // inputs
    deadline
  ])

  describe('getExecuteSignedPayload', () => {
    it('should generate EIP712 payload from calldata', () => {
      const signedOptions: SignedRouteOptions = {
        intent: '0x' + '0'.repeat(64),
        data: '0x' + '1'.repeat(64),
        sender: '0x0000000000000000000000000000000000000000',
      }

      const payload = SwapRouter.getExecuteSignedPayload(
        mockCalldata,
        signedOptions,
        deadline,
        chainId,
        routerAddress
      )

      expect(payload.domain.name).to.equal('UniversalRouter')
      expect(payload.domain.version).to.equal('2')
      expect(payload.domain.chainId).to.equal(chainId)
      expect(payload.domain.verifyingContract).to.equal(routerAddress)
      expect(payload.value.commands).to.match(/^0x[0-9a-f]+$/)
      expect(payload.value.inputs).to.be.an('array')
      expect(payload.value.nonce).to.match(/^0x[0-9a-f]{64}$/)
      expect(payload.value.intent).to.equal(signedOptions.intent)
      expect(payload.value.data).to.equal(signedOptions.data)
      expect(payload.value.sender).to.equal(signedOptions.sender)
      expect(payload.value.deadline).to.equal(deadline.toString())
    })

    it('should use provided nonce when specified', () => {
      const customNonce = '0x' + 'a'.repeat(64)

      const signedOptions: SignedRouteOptions = {
        intent: '0x' + '0'.repeat(64),
        data: '0x' + '1'.repeat(64),
        sender: '0x0000000000000000000000000000000000000000',
        nonce: customNonce,
      }

      const payload = SwapRouter.getExecuteSignedPayload(
        mockCalldata,
        signedOptions,
        deadline,
        chainId,
        routerAddress
      )

      expect(payload.value.nonce).to.equal(customNonce)
    })

    it('should use NONCE_SKIP_CHECK sentinel', () => {
      const signedOptions: SignedRouteOptions = {
        intent: '0x' + '0'.repeat(64),
        data: '0x' + '1'.repeat(64),
        sender: '0x0000000000000000000000000000000000000000',
        nonce: NONCE_SKIP_CHECK,
      }

      const payload = SwapRouter.getExecuteSignedPayload(
        mockCalldata,
        signedOptions,
        deadline,
        chainId,
        routerAddress
      )

      expect(payload.value.nonce).to.equal(NONCE_SKIP_CHECK)
    })
  })

  describe('encodeExecuteSigned', () => {
    // Note: These tests require Universal Router v2.1 ABI with executeSigned function
    // Skipping until ABI is updated
    it.skip('should encode executeSigned with signature', () => {
      const signature = '0x' + '0'.repeat(130) // Mock signature

      const signedOptions: SignedRouteOptions = {
        intent: '0x' + '0'.repeat(64),
        data: '0x' + '1'.repeat(64),
        sender: '0x1234567890123456789012345678901234567890',
      }

      const { calldata: signedCalldata, value: signedValue } = SwapRouter.encodeExecuteSigned(
        mockCalldata,
        signature,
        signedOptions,
        deadline,
        BigNumber.from(0)
      )

      expect(signedCalldata).to.match(/^0x[0-9a-f]+$/)
      expect(signedValue).to.equal('0x0')

      // Verify the function selector for executeSigned
      const selector = signedCalldata.slice(0, 10)
      expect(selector).to.equal(SwapRouter.INTERFACE.getSighash('executeSigned'))
    })

    it.skip('should set verifySender based on sender address', () => {
      const signature = '0x' + '0'.repeat(130)

      // Test with address(0) - should set verifySender = false
      const signedOptions1: SignedRouteOptions = {
        intent: '0x' + '0'.repeat(64),
        data: '0x' + '1'.repeat(64),
        sender: '0x0000000000000000000000000000000000000000',
      }

      const result1 = SwapRouter.encodeExecuteSigned(
        mockCalldata,
        signature,
        signedOptions1,
        deadline,
        BigNumber.from(0)
      )
      const decoded1 = SwapRouter.INTERFACE.decodeFunctionData('executeSigned', result1.calldata)
      expect(decoded1.verifySender).to.equal(false)

      // Test with real address - should set verifySender = true
      const signedOptions2: SignedRouteOptions = {
        intent: '0x' + '0'.repeat(64),
        data: '0x' + '1'.repeat(64),
        sender: '0x1234567890123456789012345678901234567890',
      }

      const result2 = SwapRouter.encodeExecuteSigned(
        mockCalldata,
        signature,
        signedOptions2,
        deadline,
        BigNumber.from(0)
      )
      const decoded2 = SwapRouter.INTERFACE.decodeFunctionData('executeSigned', result2.calldata)
      expect(decoded2.verifySender).to.equal(true)
    })

    it.skip('should maintain nonce consistency between payload and encoding', () => {
      const customNonce = '0x' + 'b'.repeat(64)
      const signature = '0x' + '0'.repeat(130)

      const signedOptions: SignedRouteOptions = {
        intent: '0x' + '0'.repeat(64),
        data: '0x' + '1'.repeat(64),
        sender: '0x0000000000000000000000000000000000000000',
        nonce: customNonce,
      }

      // Get payload with custom nonce
      const payload = SwapRouter.getExecuteSignedPayload(
        mockCalldata,
        signedOptions,
        deadline,
        chainId,
        routerAddress
      )

      // Encode with same nonce
      const result = SwapRouter.encodeExecuteSigned(
        mockCalldata,
        signature,
        signedOptions,
        deadline,
        BigNumber.from(0)
      )
      const decoded = SwapRouter.INTERFACE.decodeFunctionData('executeSigned', result.calldata)

      expect(decoded.nonce).to.equal(customNonce)
      expect(decoded.nonce).to.equal(payload.value.nonce)
    })
  })

  describe('generateNonce', () => {
    it('should generate valid 32-byte nonces', () => {
      const nonce1 = generateNonce()
      const nonce2 = generateNonce()

      // Check format
      expect(nonce1).to.match(/^0x[0-9a-f]{64}$/)
      expect(nonce2).to.match(/^0x[0-9a-f]{64}$/)

      // Check uniqueness
      expect(nonce1).to.not.equal(nonce2)
    })
  })
})