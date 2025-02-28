import { Call, AdvancedCall } from '../types'

/**
 * Utility functions for validating calls
 */
export abstract class CallValidator {
  /**
   * Validates a single call
   * @param call The call to validate
   * @returns True if the call is valid
   */
  public static validateCall(call: Call): boolean {
    // This is a stub that will be implemented later
    // It should validate that the call has the required fields
    return true
  }

  /**
   * Validates an array of calls
   * @param calls The calls to validate
   * @returns True if all calls are valid
   */
  public static validateCalls(calls: Call[]): boolean {
    // This is a stub that will be implemented later
    // It should validate all calls in the array
    return true
  }

  /**
   * Validates an array of advanced calls
   * @param calls The advanced calls to validate
   * @returns True if all calls are valid
   */
  public static validateAdvancedCalls(calls: AdvancedCall[]): boolean {
    // This is a stub that will be implemented later
    // It should validate advanced calls with revertOnFailure options
    return true
  }
}