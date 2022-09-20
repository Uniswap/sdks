export * from "./PermitPost";
export * from "./OrderValidator";
export * from "./NonceManager";
export * from "./OrderQuoter";

export function stripHexPrefix(a: string): string {
  if (a.startsWith("0x")) {
    return a.slice(2);
  } else {
    return a;
  }
}
