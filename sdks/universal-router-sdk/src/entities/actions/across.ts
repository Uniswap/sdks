import { BigNumberish } from 'ethers'

/**
 * Parameters for Across V4 Deposit V3 command
 * Used for cross-chain bridging via Across Protocol V3 SpokePool
 */
export type AcrossV4DepositV3Params = {
  depositor: string // Credited depositor on origin chain
  recipient: string // Destination recipient
  inputToken: string // ERC20 on origin (WETH if bridging ETH)
  outputToken: string // ERC20 on destination
  inputAmount: BigNumberish // Amount to bridge (supports CONTRACT_BALANCE)
  outputAmount: BigNumberish // Expected amount on destination
  destinationChainId: number // Destination chain ID
  exclusiveRelayer: string // 0x0 if no exclusivity
  quoteTimestamp: number // uint32
  fillDeadline: number // uint32
  exclusivityDeadline: number // uint32
  message: string // bytes - optional message data
  useNative: boolean // If true, bridge native ETH (inputToken must be WETH)
}

// Export CONTRACT_BALANCE constant for convenience
export { CONTRACT_BALANCE } from '../../utils/constants'
