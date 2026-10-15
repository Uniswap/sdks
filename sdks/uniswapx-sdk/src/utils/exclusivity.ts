import { BigNumber, ethers } from "ethers";

import { mulDivUp } from "./mathExt";

/*
Port of UniswapX's ExclusivityLib.sol.

The reactor grants the exclusive filler an exclusivity window, and any other
filler must improve the outputs by exclusivityOverrideBps to fill inside it. An
override of zero means strict exclusivity: nobody else can fill at all.

The library is position-agnostic - `exclusivityEnd` and `currentPosition` are a
timestamp for V1/V2 orders and a block number for V3 orders.
*/

const BPS = BigNumber.from(10_000);
const STRICT_EXCLUSIVITY = BigNumber.from(0);

export interface ExclusivityParams {
  exclusiveFiller: string;
  exclusivityEnd: number;
  exclusivityOverrideBps: BigNumber;
  currentPosition: number;
  /**
   * The filler that would submit the fill. Left undefined, the order is
   * resolved for an arbitrary filler, which is the conservative reading: no
   * caller can claim another filler's exclusive rights.
   */
  filler?: string;
}

/**
 * Whether `filler` may fill without improving the outputs.
 * Mirrors ExclusivityLib.hasFillingRights.
 */
export function hasFillingRights(params: ExclusivityParams): boolean {
  const { exclusiveFiller, exclusivityEnd, currentPosition, filler } = params;
  return (
    exclusiveFiller === ethers.constants.AddressZero ||
    currentPosition > exclusivityEnd ||
    (filler !== undefined &&
      exclusiveFiller.toLowerCase() === filler.toLowerCase())
  );
}

/**
 * Scales outputs by the exclusivity override when the filler lacks exclusive
 * rights. Mirrors ExclusivityLib._handleExclusiveOverride.
 *
 * @throws when the order is strictly exclusive to another filler, matching the
 * reactor's NoExclusiveOverride revert - the order cannot be filled at all.
 */
export function applyExclusivityOverride<T extends { amount: BigNumber }>(
  outputs: T[],
  params: ExclusivityParams
): T[] {
  // the filler has fill rights, so the order resolves as-is
  if (hasFillingRights(params)) {
    return outputs;
  }

  // an override of 0 is strict exclusivity, so the order cannot be filled
  if (params.exclusivityOverrideBps.eq(STRICT_EXCLUSIVITY)) {
    throw new Error(
      `NoExclusiveOverride: order is strictly exclusive to ${params.exclusiveFiller} through position ${params.exclusivityEnd}`
    );
  }

  return outputs.map((output) => ({
    ...output,
    amount: mulDivUp(
      output.amount,
      BPS.add(params.exclusivityOverrideBps),
      BPS
    ),
  }));
}
