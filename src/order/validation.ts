import { ethers } from "ethers";

import { OrderInfo } from "./types";

export enum ValidationType {
  None,
  ExclusiveFiller,
}

type ExclusiveFillerData = {
  filler: string;
  lastExclusiveTimestamp: number;
};

export type CustomOrderValidation =
  | {
      type: ValidationType.None;
      data: null;
    }
  | {
      type: ValidationType.ExclusiveFiller;
      data: ExclusiveFillerData;
    };

const NONE_VALIDATION: CustomOrderValidation = {
  type: ValidationType.None,
  data: null,
};

export function parseValidation(info: OrderInfo): CustomOrderValidation {
  // TODO: extend to support multiple validation types
  // Add mapping of address to validation type, if no matches iterate through attempting to parse
  const data = parseExclusiveFillerData(info.validationData);
  if (data.type !== ValidationType.None) {
    return data;
  }

  return NONE_VALIDATION;
}

// returns decoded filler data, or null if invalid encoding
function parseExclusiveFillerData(encoded: string): CustomOrderValidation {
  try {
    const [address, timestamp] = new ethers.utils.AbiCoder().decode(
      ["address", "uint256"],
      encoded
    );
    return {
      type: ValidationType.ExclusiveFiller,
      data: {
        filler: address,
        lastExclusiveTimestamp: timestamp.toNumber(),
      },
    };
  } catch {
    return NONE_VALIDATION;
  }
}
