export declare const PERMIT_POST_MAPPING: {
    readonly [key: number]: string;
};
export declare const ORDER_QUOTER_MAPPING: {
    readonly [key: number]: string;
};
export declare enum OrderType {
    DutchLimit = "DutchLimit"
}
declare type Reactors = {
    [key in OrderType]: string;
};
declare type ReactorMapping = {
    readonly [key: number]: Reactors;
};
declare type ReverseReactorMapping = {
    [key: string]: {
        chainId: number;
        orderType: OrderType;
    };
};
export declare const REACTOR_ADDRESS_MAPPING: ReactorMapping;
export declare const REVERSE_REACTOR_MAPPING: ReverseReactorMapping;
export {};
