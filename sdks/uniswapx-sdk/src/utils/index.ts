import {
  OrderType,
  PERMIT2_MAPPING,
  REACTOR_ADDRESS_MAPPING,
} from "../constants";
import { MissingConfiguration } from "../errors";

export * from "./OrderValidator";
export * from "./NonceManager";
export * from "./OrderQuoter";
export * from "./EventWatcher";
export * from "./multicall";
export * from "./dutchDecay";
export * from "./order";
export * from "./PermissionedTokenValidator";

export function stripHexPrefix(a: string): string {
  if (a.startsWith("0x")) {
    return a.slice(2);
  } else {
    return a;
  }
}

export function getPermit2(chainId: number, permit2Address?: string): string {
  if (permit2Address) {
    return permit2Address;
  } else if (PERMIT2_MAPPING[chainId]) {
    return PERMIT2_MAPPING[chainId];
  } else {
    throw new MissingConfiguration("permit2", chainId.toString());
  }
}

export function getReactor(
  chainId: number,
  orderType: OrderType,
  reactorAddress?: string
): string {
  const mappedReactorAddress = REACTOR_ADDRESS_MAPPING[chainId]
    ? REACTOR_ADDRESS_MAPPING[chainId][orderType]
    : undefined;
  if (reactorAddress) {
    return reactorAddress;
  } else if (mappedReactorAddress) {
    return mappedReactorAddress;
  } else {
    throw new MissingConfiguration("reactor", chainId.toString());
  }
}
