import { BigNumber, ethers } from "ethers";

import { OrderInfo } from "./types";
import {
  encodeExclusiveFillerData,
  parseValidation,
  ValidationType,
} from "./validation";

describe("OrderValidation", () => {
  it("parses an ExclusiveFiller validation", () => {
    const validation = parseValidation(
      makeOrderInfo(
        "0x0000000000000000000000007fa9385be102ac3eac297483dd6233d62b3e14960000000000000000000000000000000000000000000000000000000000000033"
      )
    );
    expect(validation).toEqual({
      type: ValidationType.ExclusiveFiller,
      data: {
        filler: "0x7FA9385bE102ac3EAc297483Dd6233D62b3e1496",
        lastExclusiveTimestamp: 51,
      },
    });
  });

  it("parses empty validation data", async () => {
    const validation = parseValidation(makeOrderInfo("0x"));
    expect(validation).toEqual({
      type: ValidationType.None,
      data: null,
    });
  });

  it("parses invalid validation data", async () => {
    const validation = parseValidation(
      makeOrderInfo(
        "0x0000000000000000000000007fa9385be102ac3eac297483dd6233d62b3e1496000000000000000000000000000000000000000000000000000000000000033"
      )
    );
    expect(validation).toEqual({
      type: ValidationType.None,
      data: null,
    });
  });

  it("encodes exclusive filler data", () => {
    const fillerAddress = "0x1111111111111111111111111111111111111111";
    const additionalValidationContract =
      "0x2222222222222222222222222222222222222222";
    const timestamp = Math.floor(new Date().getTime() / 1000) + 100;
    const validationInfo = encodeExclusiveFillerData(
      fillerAddress,
      timestamp,
      1,
      additionalValidationContract
    );

    const orderInfo = makeOrderInfo(validationInfo.additionalValidationData);
    validationInfo.additionalValidationContract = additionalValidationContract;
    const validation = parseValidation(orderInfo);
    expect(validation).toEqual({
      type: ValidationType.ExclusiveFiller,
      data: {
        filler: fillerAddress,
        lastExclusiveTimestamp: timestamp,
      },
    });
  });
});

function makeOrderInfo(data: string): OrderInfo {
  return {
    reactor: ethers.constants.AddressZero,
    swapper: ethers.constants.AddressZero,
    nonce: BigNumber.from(0),
    deadline: 5,
    additionalValidationContract: ethers.constants.AddressZero,
    additionalValidationData: data,
  };
}
