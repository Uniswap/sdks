export declare const theCompactAbi: readonly [{
    readonly inputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "allocatedAmount";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "providedAmount";
        readonly type: "uint256";
    }];
    readonly name: "AllocatedAmountExceeded";
    readonly type: "error";
}, {
    readonly inputs: readonly [];
    readonly name: "BalanceOverflow";
    readonly type: "error";
}, {
    readonly inputs: readonly [];
    readonly name: "ChainIndexOutOfRange";
    readonly type: "error";
}, {
    readonly inputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "assignableAt";
        readonly type: "uint256";
    }];
    readonly name: "EmissaryAssignmentUnavailable";
    readonly type: "error";
}, {
    readonly inputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "expiration";
        readonly type: "uint256";
    }];
    readonly name: "Expired";
    readonly type: "error";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "account";
        readonly type: "address";
    }, {
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }];
    readonly name: "ForcedWithdrawalAlreadyDisabled";
    readonly type: "error";
}, {
    readonly inputs: readonly [];
    readonly name: "ForcedWithdrawalFailed";
    readonly type: "error";
}, {
    readonly inputs: readonly [];
    readonly name: "InconsistentAllocators";
    readonly type: "error";
}, {
    readonly inputs: readonly [];
    readonly name: "InsufficientBalance";
    readonly type: "error";
}, {
    readonly inputs: readonly [];
    readonly name: "InsufficientPermission";
    readonly type: "error";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "allocator";
        readonly type: "address";
    }];
    readonly name: "InvalidAllocation";
    readonly type: "error";
}, {
    readonly inputs: readonly [];
    readonly name: "InvalidBatchAllocation";
    readonly type: "error";
}, {
    readonly inputs: readonly [];
    readonly name: "InvalidBatchDepositStructure";
    readonly type: "error";
}, {
    readonly inputs: readonly [];
    readonly name: "InvalidDepositBalanceChange";
    readonly type: "error";
}, {
    readonly inputs: readonly [];
    readonly name: "InvalidDepositTokenOrdering";
    readonly type: "error";
}, {
    readonly inputs: readonly [];
    readonly name: "InvalidEmissaryAssignment";
    readonly type: "error";
}, {
    readonly inputs: readonly [];
    readonly name: "InvalidLockTag";
    readonly type: "error";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "allocator";
        readonly type: "address";
    }];
    readonly name: "InvalidRegistrationProof";
    readonly type: "error";
}, {
    readonly inputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }];
    readonly name: "InvalidScope";
    readonly type: "error";
}, {
    readonly inputs: readonly [];
    readonly name: "InvalidSignature";
    readonly type: "error";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "token";
        readonly type: "address";
    }];
    readonly name: "InvalidToken";
    readonly type: "error";
}, {
    readonly inputs: readonly [];
    readonly name: "NoIdsAndAmountsProvided";
    readonly type: "error";
}, {
    readonly inputs: readonly [];
    readonly name: "Permit2CallFailed";
    readonly type: "error";
}, {
    readonly inputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }];
    readonly name: "PrematureWithdrawal";
    readonly type: "error";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "existingCaller";
        readonly type: "address";
    }];
    readonly name: "ReentrantCall";
    readonly type: "error";
}, {
    readonly inputs: readonly [];
    readonly name: "TStoreAlreadyActivated";
    readonly type: "error";
}, {
    readonly inputs: readonly [];
    readonly name: "TStoreNotSupported";
    readonly type: "error";
}, {
    readonly inputs: readonly [];
    readonly name: "TloadTestContractDeploymentFailed";
    readonly type: "error";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "operator";
        readonly type: "address";
    }, {
        readonly internalType: "address";
        readonly name: "from";
        readonly type: "address";
    }, {
        readonly internalType: "address";
        readonly name: "to";
        readonly type: "address";
    }, {
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly name: "UnallocatedTransfer";
    readonly type: "error";
}, {
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly indexed: false;
        readonly internalType: "uint96";
        readonly name: "allocatorId";
        readonly type: "uint96";
    }, {
        readonly indexed: false;
        readonly internalType: "address";
        readonly name: "allocator";
        readonly type: "address";
    }];
    readonly name: "AllocatorRegistered";
    readonly type: "event";
}, {
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly indexed: true;
        readonly internalType: "address";
        readonly name: "owner";
        readonly type: "address";
    }, {
        readonly indexed: true;
        readonly internalType: "address";
        readonly name: "spender";
        readonly type: "address";
    }, {
        readonly indexed: true;
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }, {
        readonly indexed: false;
        readonly internalType: "uint256";
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly name: "Approval";
    readonly type: "event";
}, {
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly indexed: true;
        readonly internalType: "address";
        readonly name: "sponsor";
        readonly type: "address";
    }, {
        readonly indexed: true;
        readonly internalType: "address";
        readonly name: "allocator";
        readonly type: "address";
    }, {
        readonly indexed: true;
        readonly internalType: "address";
        readonly name: "arbiter";
        readonly type: "address";
    }, {
        readonly indexed: false;
        readonly internalType: "bytes32";
        readonly name: "claimHash";
        readonly type: "bytes32";
    }, {
        readonly indexed: false;
        readonly internalType: "uint256";
        readonly name: "nonce";
        readonly type: "uint256";
    }];
    readonly name: "Claim";
    readonly type: "event";
}, {
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly indexed: true;
        readonly internalType: "address";
        readonly name: "sponsor";
        readonly type: "address";
    }, {
        readonly indexed: false;
        readonly internalType: "bytes32";
        readonly name: "claimHash";
        readonly type: "bytes32";
    }, {
        readonly indexed: false;
        readonly internalType: "bytes32";
        readonly name: "typehash";
        readonly type: "bytes32";
    }];
    readonly name: "CompactRegistered";
    readonly type: "event";
}, {
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly indexed: true;
        readonly internalType: "address";
        readonly name: "sponsor";
        readonly type: "address";
    }, {
        readonly indexed: true;
        readonly internalType: "bytes12";
        readonly name: "lockTag";
        readonly type: "bytes12";
    }, {
        readonly indexed: true;
        readonly internalType: "address";
        readonly name: "emissary";
        readonly type: "address";
    }];
    readonly name: "EmissaryAssigned";
    readonly type: "event";
}, {
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly indexed: true;
        readonly internalType: "address";
        readonly name: "sponsor";
        readonly type: "address";
    }, {
        readonly indexed: true;
        readonly internalType: "bytes12";
        readonly name: "lockTag";
        readonly type: "bytes12";
    }, {
        readonly indexed: false;
        readonly internalType: "uint256";
        readonly name: "assignableAt";
        readonly type: "uint256";
    }];
    readonly name: "EmissaryAssignmentScheduled";
    readonly type: "event";
}, {
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly indexed: true;
        readonly internalType: "address";
        readonly name: "account";
        readonly type: "address";
    }, {
        readonly indexed: true;
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }, {
        readonly indexed: false;
        readonly internalType: "bool";
        readonly name: "activating";
        readonly type: "bool";
    }, {
        readonly indexed: false;
        readonly internalType: "uint256";
        readonly name: "withdrawableAt";
        readonly type: "uint256";
    }];
    readonly name: "ForcedWithdrawalStatusUpdated";
    readonly type: "event";
}, {
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly indexed: true;
        readonly internalType: "address";
        readonly name: "allocator";
        readonly type: "address";
    }, {
        readonly indexed: false;
        readonly internalType: "uint256";
        readonly name: "nonce";
        readonly type: "uint256";
    }];
    readonly name: "NonceConsumedDirectly";
    readonly type: "event";
}, {
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly indexed: true;
        readonly internalType: "address";
        readonly name: "owner";
        readonly type: "address";
    }, {
        readonly indexed: true;
        readonly internalType: "address";
        readonly name: "operator";
        readonly type: "address";
    }, {
        readonly indexed: false;
        readonly internalType: "bool";
        readonly name: "approved";
        readonly type: "bool";
    }];
    readonly name: "OperatorSet";
    readonly type: "event";
}, {
    readonly anonymous: false;
    readonly inputs: readonly [{
        readonly indexed: false;
        readonly internalType: "address";
        readonly name: "by";
        readonly type: "address";
    }, {
        readonly indexed: true;
        readonly internalType: "address";
        readonly name: "from";
        readonly type: "address";
    }, {
        readonly indexed: true;
        readonly internalType: "address";
        readonly name: "to";
        readonly type: "address";
    }, {
        readonly indexed: true;
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }, {
        readonly indexed: false;
        readonly internalType: "uint256";
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly name: "Transfer";
    readonly type: "event";
}, {
    readonly inputs: readonly [];
    readonly name: "DOMAIN_SEPARATOR";
    readonly outputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [];
    readonly name: "__activateTstore";
    readonly outputs: readonly [];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "";
        readonly type: "bytes32";
    }];
    readonly name: "__benchmark";
    readonly outputs: readonly [];
    readonly stateMutability: "payable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "allocator";
        readonly type: "address";
    }, {
        readonly internalType: "bytes";
        readonly name: "proof";
        readonly type: "bytes";
    }];
    readonly name: "__registerAllocator";
    readonly outputs: readonly [{
        readonly internalType: "uint96";
        readonly name: "";
        readonly type: "uint96";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly components: readonly [{
            readonly internalType: "bytes";
            readonly name: "allocatorData";
            readonly type: "bytes";
        }, {
            readonly internalType: "uint256";
            readonly name: "nonce";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint256";
            readonly name: "expires";
            readonly type: "uint256";
        }, {
            readonly components: readonly [{
                readonly internalType: "uint256";
                readonly name: "id";
                readonly type: "uint256";
            }, {
                readonly components: readonly [{
                    readonly internalType: "uint256";
                    readonly name: "claimant";
                    readonly type: "uint256";
                }, {
                    readonly internalType: "uint256";
                    readonly name: "amount";
                    readonly type: "uint256";
                }];
                readonly internalType: "struct Component[]";
                readonly name: "portions";
                readonly type: "tuple[]";
            }];
            readonly internalType: "struct ComponentsById[]";
            readonly name: "transfers";
            readonly type: "tuple[]";
        }];
        readonly internalType: "struct AllocatedBatchTransfer";
        readonly name: "transfer";
        readonly type: "tuple";
    }];
    readonly name: "allocatedBatchTransfer";
    readonly outputs: readonly [{
        readonly internalType: "bool";
        readonly name: "";
        readonly type: "bool";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly components: readonly [{
            readonly internalType: "bytes";
            readonly name: "allocatorData";
            readonly type: "bytes";
        }, {
            readonly internalType: "uint256";
            readonly name: "nonce";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint256";
            readonly name: "expires";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint256";
            readonly name: "id";
            readonly type: "uint256";
        }, {
            readonly components: readonly [{
                readonly internalType: "uint256";
                readonly name: "claimant";
                readonly type: "uint256";
            }, {
                readonly internalType: "uint256";
                readonly name: "amount";
                readonly type: "uint256";
            }];
            readonly internalType: "struct Component[]";
            readonly name: "recipients";
            readonly type: "tuple[]";
        }];
        readonly internalType: "struct AllocatedTransfer";
        readonly name: "transfer";
        readonly type: "tuple";
    }];
    readonly name: "allocatedTransfer";
    readonly outputs: readonly [{
        readonly internalType: "bool";
        readonly name: "";
        readonly type: "bool";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "owner";
        readonly type: "address";
    }, {
        readonly internalType: "address";
        readonly name: "spender";
        readonly type: "address";
    }, {
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }];
    readonly name: "allowance";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "spender";
        readonly type: "address";
    }, {
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly name: "approve";
    readonly outputs: readonly [{
        readonly internalType: "bool";
        readonly name: "";
        readonly type: "bool";
    }];
    readonly stateMutability: "payable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "bytes12";
        readonly name: "lockTag";
        readonly type: "bytes12";
    }, {
        readonly internalType: "address";
        readonly name: "emissary";
        readonly type: "address";
    }];
    readonly name: "assignEmissary";
    readonly outputs: readonly [{
        readonly internalType: "bool";
        readonly name: "";
        readonly type: "bool";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "owner";
        readonly type: "address";
    }, {
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }];
    readonly name: "balanceOf";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly components: readonly [{
            readonly internalType: "bytes";
            readonly name: "allocatorData";
            readonly type: "bytes";
        }, {
            readonly internalType: "bytes";
            readonly name: "sponsorSignature";
            readonly type: "bytes";
        }, {
            readonly internalType: "address";
            readonly name: "sponsor";
            readonly type: "address";
        }, {
            readonly internalType: "uint256";
            readonly name: "nonce";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint256";
            readonly name: "expires";
            readonly type: "uint256";
        }, {
            readonly internalType: "bytes32";
            readonly name: "witness";
            readonly type: "bytes32";
        }, {
            readonly internalType: "string";
            readonly name: "witnessTypestring";
            readonly type: "string";
        }, {
            readonly components: readonly [{
                readonly internalType: "uint256";
                readonly name: "id";
                readonly type: "uint256";
            }, {
                readonly internalType: "uint256";
                readonly name: "allocatedAmount";
                readonly type: "uint256";
            }, {
                readonly components: readonly [{
                    readonly internalType: "uint256";
                    readonly name: "claimant";
                    readonly type: "uint256";
                }, {
                    readonly internalType: "uint256";
                    readonly name: "amount";
                    readonly type: "uint256";
                }];
                readonly internalType: "struct Component[]";
                readonly name: "portions";
                readonly type: "tuple[]";
            }];
            readonly internalType: "struct BatchClaimComponent[]";
            readonly name: "claims";
            readonly type: "tuple[]";
        }];
        readonly internalType: "struct BatchClaim";
        readonly name: "claimPayload";
        readonly type: "tuple";
    }];
    readonly name: "batchClaim";
    readonly outputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "claimHash";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "uint256[2][]";
        readonly name: "idsAndAmounts";
        readonly type: "uint256[2][]";
    }, {
        readonly internalType: "address";
        readonly name: "recipient";
        readonly type: "address";
    }];
    readonly name: "batchDeposit";
    readonly outputs: readonly [{
        readonly internalType: "bool";
        readonly name: "";
        readonly type: "bool";
    }];
    readonly stateMutability: "payable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "recipient";
        readonly type: "address";
    }, {
        readonly internalType: "uint256[2][]";
        readonly name: "idsAndAmounts";
        readonly type: "uint256[2][]";
    }, {
        readonly internalType: "address";
        readonly name: "arbiter";
        readonly type: "address";
    }, {
        readonly internalType: "uint256";
        readonly name: "nonce";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "expires";
        readonly type: "uint256";
    }, {
        readonly internalType: "bytes32";
        readonly name: "typehash";
        readonly type: "bytes32";
    }, {
        readonly internalType: "bytes32";
        readonly name: "witness";
        readonly type: "bytes32";
    }];
    readonly name: "batchDepositAndRegisterFor";
    readonly outputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "claimHash";
        readonly type: "bytes32";
    }, {
        readonly internalType: "uint256[]";
        readonly name: "registeredAmounts";
        readonly type: "uint256[]";
    }];
    readonly stateMutability: "payable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "uint256[2][]";
        readonly name: "idsAndAmounts";
        readonly type: "uint256[2][]";
    }, {
        readonly internalType: "bytes32[2][]";
        readonly name: "claimHashesAndTypehashes";
        readonly type: "bytes32[2][]";
    }];
    readonly name: "batchDepositAndRegisterMultiple";
    readonly outputs: readonly [{
        readonly internalType: "bool";
        readonly name: "";
        readonly type: "bool";
    }];
    readonly stateMutability: "payable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "depositor";
        readonly type: "address";
    }, {
        readonly components: readonly [{
            readonly internalType: "address";
            readonly name: "token";
            readonly type: "address";
        }, {
            readonly internalType: "uint256";
            readonly name: "amount";
            readonly type: "uint256";
        }];
        readonly internalType: "struct ISignatureTransfer.TokenPermissions[]";
        readonly name: "permitted";
        readonly type: "tuple[]";
    }, {
        readonly components: readonly [{
            readonly internalType: "uint256";
            readonly name: "nonce";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint256";
            readonly name: "deadline";
            readonly type: "uint256";
        }, {
            readonly internalType: "bytes12";
            readonly name: "lockTag";
            readonly type: "bytes12";
        }];
        readonly internalType: "struct DepositDetails";
        readonly name: "";
        readonly type: "tuple";
    }, {
        readonly internalType: "bytes32";
        readonly name: "";
        readonly type: "bytes32";
    }, {
        readonly internalType: "enum CompactCategory";
        readonly name: "";
        readonly type: "uint8";
    }, {
        readonly internalType: "string";
        readonly name: "witness";
        readonly type: "string";
    }, {
        readonly internalType: "bytes";
        readonly name: "signature";
        readonly type: "bytes";
    }];
    readonly name: "batchDepositAndRegisterViaPermit2";
    readonly outputs: readonly [{
        readonly internalType: "uint256[]";
        readonly name: "";
        readonly type: "uint256[]";
    }];
    readonly stateMutability: "payable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "";
        readonly type: "address";
    }, {
        readonly components: readonly [{
            readonly internalType: "address";
            readonly name: "token";
            readonly type: "address";
        }, {
            readonly internalType: "uint256";
            readonly name: "amount";
            readonly type: "uint256";
        }];
        readonly internalType: "struct ISignatureTransfer.TokenPermissions[]";
        readonly name: "permitted";
        readonly type: "tuple[]";
    }, {
        readonly components: readonly [{
            readonly internalType: "uint256";
            readonly name: "nonce";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint256";
            readonly name: "deadline";
            readonly type: "uint256";
        }, {
            readonly internalType: "bytes12";
            readonly name: "lockTag";
            readonly type: "bytes12";
        }];
        readonly internalType: "struct DepositDetails";
        readonly name: "";
        readonly type: "tuple";
    }, {
        readonly internalType: "address";
        readonly name: "recipient";
        readonly type: "address";
    }, {
        readonly internalType: "bytes";
        readonly name: "signature";
        readonly type: "bytes";
    }];
    readonly name: "batchDepositViaPermit2";
    readonly outputs: readonly [{
        readonly internalType: "uint256[]";
        readonly name: "";
        readonly type: "uint256[]";
    }];
    readonly stateMutability: "payable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly components: readonly [{
            readonly internalType: "bytes";
            readonly name: "allocatorData";
            readonly type: "bytes";
        }, {
            readonly internalType: "bytes";
            readonly name: "sponsorSignature";
            readonly type: "bytes";
        }, {
            readonly internalType: "address";
            readonly name: "sponsor";
            readonly type: "address";
        }, {
            readonly internalType: "uint256";
            readonly name: "nonce";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint256";
            readonly name: "expires";
            readonly type: "uint256";
        }, {
            readonly internalType: "bytes32";
            readonly name: "witness";
            readonly type: "bytes32";
        }, {
            readonly internalType: "string";
            readonly name: "witnessTypestring";
            readonly type: "string";
        }, {
            readonly components: readonly [{
                readonly internalType: "uint256";
                readonly name: "id";
                readonly type: "uint256";
            }, {
                readonly internalType: "uint256";
                readonly name: "allocatedAmount";
                readonly type: "uint256";
            }, {
                readonly components: readonly [{
                    readonly internalType: "uint256";
                    readonly name: "claimant";
                    readonly type: "uint256";
                }, {
                    readonly internalType: "uint256";
                    readonly name: "amount";
                    readonly type: "uint256";
                }];
                readonly internalType: "struct Component[]";
                readonly name: "portions";
                readonly type: "tuple[]";
            }];
            readonly internalType: "struct BatchClaimComponent[]";
            readonly name: "claims";
            readonly type: "tuple[]";
        }, {
            readonly internalType: "bytes32[]";
            readonly name: "additionalChains";
            readonly type: "bytes32[]";
        }];
        readonly internalType: "struct BatchMultichainClaim";
        readonly name: "claimPayload";
        readonly type: "tuple";
    }];
    readonly name: "batchMultichainClaim";
    readonly outputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "claimHash";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly components: readonly [{
            readonly internalType: "bytes";
            readonly name: "allocatorData";
            readonly type: "bytes";
        }, {
            readonly internalType: "bytes";
            readonly name: "sponsorSignature";
            readonly type: "bytes";
        }, {
            readonly internalType: "address";
            readonly name: "sponsor";
            readonly type: "address";
        }, {
            readonly internalType: "uint256";
            readonly name: "nonce";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint256";
            readonly name: "expires";
            readonly type: "uint256";
        }, {
            readonly internalType: "bytes32";
            readonly name: "witness";
            readonly type: "bytes32";
        }, {
            readonly internalType: "string";
            readonly name: "witnessTypestring";
            readonly type: "string";
        }, {
            readonly internalType: "uint256";
            readonly name: "id";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint256";
            readonly name: "allocatedAmount";
            readonly type: "uint256";
        }, {
            readonly components: readonly [{
                readonly internalType: "uint256";
                readonly name: "claimant";
                readonly type: "uint256";
            }, {
                readonly internalType: "uint256";
                readonly name: "amount";
                readonly type: "uint256";
            }];
            readonly internalType: "struct Component[]";
            readonly name: "claimants";
            readonly type: "tuple[]";
        }];
        readonly internalType: "struct Claim";
        readonly name: "claimPayload";
        readonly type: "tuple";
    }];
    readonly name: "claim";
    readonly outputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "claimHash";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "uint256[]";
        readonly name: "nonces";
        readonly type: "uint256[]";
    }];
    readonly name: "consume";
    readonly outputs: readonly [{
        readonly internalType: "bool";
        readonly name: "";
        readonly type: "bool";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }];
    readonly name: "decimals";
    readonly outputs: readonly [{
        readonly internalType: "uint8";
        readonly name: "";
        readonly type: "uint8";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "token";
        readonly type: "address";
    }, {
        readonly internalType: "bytes12";
        readonly name: "lockTag";
        readonly type: "bytes12";
    }, {
        readonly internalType: "uint256";
        readonly name: "amount";
        readonly type: "uint256";
    }, {
        readonly internalType: "address";
        readonly name: "recipient";
        readonly type: "address";
    }];
    readonly name: "depositERC20";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "token";
        readonly type: "address";
    }, {
        readonly internalType: "bytes12";
        readonly name: "lockTag";
        readonly type: "bytes12";
    }, {
        readonly internalType: "uint256";
        readonly name: "amount";
        readonly type: "uint256";
    }, {
        readonly internalType: "bytes32";
        readonly name: "claimHash";
        readonly type: "bytes32";
    }, {
        readonly internalType: "bytes32";
        readonly name: "typehash";
        readonly type: "bytes32";
    }];
    readonly name: "depositERC20AndRegister";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "recipient";
        readonly type: "address";
    }, {
        readonly internalType: "address";
        readonly name: "token";
        readonly type: "address";
    }, {
        readonly internalType: "bytes12";
        readonly name: "lockTag";
        readonly type: "bytes12";
    }, {
        readonly internalType: "uint256";
        readonly name: "amount";
        readonly type: "uint256";
    }, {
        readonly internalType: "address";
        readonly name: "arbiter";
        readonly type: "address";
    }, {
        readonly internalType: "uint256";
        readonly name: "nonce";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "expires";
        readonly type: "uint256";
    }, {
        readonly internalType: "bytes32";
        readonly name: "typehash";
        readonly type: "bytes32";
    }, {
        readonly internalType: "bytes32";
        readonly name: "witness";
        readonly type: "bytes32";
    }];
    readonly name: "depositERC20AndRegisterFor";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }, {
        readonly internalType: "bytes32";
        readonly name: "claimHash";
        readonly type: "bytes32";
    }, {
        readonly internalType: "uint256";
        readonly name: "registeredAmount";
        readonly type: "uint256";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly components: readonly [{
            readonly components: readonly [{
                readonly internalType: "address";
                readonly name: "token";
                readonly type: "address";
            }, {
                readonly internalType: "uint256";
                readonly name: "amount";
                readonly type: "uint256";
            }];
            readonly internalType: "struct ISignatureTransfer.TokenPermissions";
            readonly name: "permitted";
            readonly type: "tuple";
        }, {
            readonly internalType: "uint256";
            readonly name: "nonce";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint256";
            readonly name: "deadline";
            readonly type: "uint256";
        }];
        readonly internalType: "struct ISignatureTransfer.PermitTransferFrom";
        readonly name: "permit";
        readonly type: "tuple";
    }, {
        readonly internalType: "address";
        readonly name: "depositor";
        readonly type: "address";
    }, {
        readonly internalType: "bytes12";
        readonly name: "";
        readonly type: "bytes12";
    }, {
        readonly internalType: "bytes32";
        readonly name: "claimHash";
        readonly type: "bytes32";
    }, {
        readonly internalType: "enum CompactCategory";
        readonly name: "";
        readonly type: "uint8";
    }, {
        readonly internalType: "string";
        readonly name: "witness";
        readonly type: "string";
    }, {
        readonly internalType: "bytes";
        readonly name: "signature";
        readonly type: "bytes";
    }];
    readonly name: "depositERC20AndRegisterViaPermit2";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly components: readonly [{
            readonly components: readonly [{
                readonly internalType: "address";
                readonly name: "token";
                readonly type: "address";
            }, {
                readonly internalType: "uint256";
                readonly name: "amount";
                readonly type: "uint256";
            }];
            readonly internalType: "struct ISignatureTransfer.TokenPermissions";
            readonly name: "permitted";
            readonly type: "tuple";
        }, {
            readonly internalType: "uint256";
            readonly name: "nonce";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint256";
            readonly name: "deadline";
            readonly type: "uint256";
        }];
        readonly internalType: "struct ISignatureTransfer.PermitTransferFrom";
        readonly name: "permit";
        readonly type: "tuple";
    }, {
        readonly internalType: "address";
        readonly name: "";
        readonly type: "address";
    }, {
        readonly internalType: "bytes12";
        readonly name: "";
        readonly type: "bytes12";
    }, {
        readonly internalType: "address";
        readonly name: "recipient";
        readonly type: "address";
    }, {
        readonly internalType: "bytes";
        readonly name: "signature";
        readonly type: "bytes";
    }];
    readonly name: "depositERC20ViaPermit2";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "bytes12";
        readonly name: "lockTag";
        readonly type: "bytes12";
    }, {
        readonly internalType: "address";
        readonly name: "recipient";
        readonly type: "address";
    }];
    readonly name: "depositNative";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "payable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "bytes12";
        readonly name: "lockTag";
        readonly type: "bytes12";
    }, {
        readonly internalType: "bytes32";
        readonly name: "claimHash";
        readonly type: "bytes32";
    }, {
        readonly internalType: "bytes32";
        readonly name: "typehash";
        readonly type: "bytes32";
    }];
    readonly name: "depositNativeAndRegister";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }];
    readonly stateMutability: "payable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "recipient";
        readonly type: "address";
    }, {
        readonly internalType: "bytes12";
        readonly name: "lockTag";
        readonly type: "bytes12";
    }, {
        readonly internalType: "address";
        readonly name: "arbiter";
        readonly type: "address";
    }, {
        readonly internalType: "uint256";
        readonly name: "nonce";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "expires";
        readonly type: "uint256";
    }, {
        readonly internalType: "bytes32";
        readonly name: "typehash";
        readonly type: "bytes32";
    }, {
        readonly internalType: "bytes32";
        readonly name: "witness";
        readonly type: "bytes32";
    }];
    readonly name: "depositNativeAndRegisterFor";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }, {
        readonly internalType: "bytes32";
        readonly name: "claimHash";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "payable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }];
    readonly name: "disableForcedWithdrawal";
    readonly outputs: readonly [{
        readonly internalType: "bool";
        readonly name: "";
        readonly type: "bool";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }];
    readonly name: "enableForcedWithdrawal";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly components: readonly [{
            readonly internalType: "bytes";
            readonly name: "allocatorData";
            readonly type: "bytes";
        }, {
            readonly internalType: "bytes";
            readonly name: "sponsorSignature";
            readonly type: "bytes";
        }, {
            readonly internalType: "address";
            readonly name: "sponsor";
            readonly type: "address";
        }, {
            readonly internalType: "uint256";
            readonly name: "nonce";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint256";
            readonly name: "expires";
            readonly type: "uint256";
        }, {
            readonly internalType: "bytes32";
            readonly name: "witness";
            readonly type: "bytes32";
        }, {
            readonly internalType: "string";
            readonly name: "witnessTypestring";
            readonly type: "string";
        }, {
            readonly components: readonly [{
                readonly internalType: "uint256";
                readonly name: "id";
                readonly type: "uint256";
            }, {
                readonly internalType: "uint256";
                readonly name: "allocatedAmount";
                readonly type: "uint256";
            }, {
                readonly components: readonly [{
                    readonly internalType: "uint256";
                    readonly name: "claimant";
                    readonly type: "uint256";
                }, {
                    readonly internalType: "uint256";
                    readonly name: "amount";
                    readonly type: "uint256";
                }];
                readonly internalType: "struct Component[]";
                readonly name: "portions";
                readonly type: "tuple[]";
            }];
            readonly internalType: "struct BatchClaimComponent[]";
            readonly name: "claims";
            readonly type: "tuple[]";
        }, {
            readonly internalType: "bytes32[]";
            readonly name: "additionalChains";
            readonly type: "bytes32[]";
        }, {
            readonly internalType: "uint256";
            readonly name: "chainIndex";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint256";
            readonly name: "notarizedChainId";
            readonly type: "uint256";
        }];
        readonly internalType: "struct ExogenousBatchMultichainClaim";
        readonly name: "claimPayload";
        readonly type: "tuple";
    }];
    readonly name: "exogenousBatchClaim";
    readonly outputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "claimHash";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly components: readonly [{
            readonly internalType: "bytes";
            readonly name: "allocatorData";
            readonly type: "bytes";
        }, {
            readonly internalType: "bytes";
            readonly name: "sponsorSignature";
            readonly type: "bytes";
        }, {
            readonly internalType: "address";
            readonly name: "sponsor";
            readonly type: "address";
        }, {
            readonly internalType: "uint256";
            readonly name: "nonce";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint256";
            readonly name: "expires";
            readonly type: "uint256";
        }, {
            readonly internalType: "bytes32";
            readonly name: "witness";
            readonly type: "bytes32";
        }, {
            readonly internalType: "string";
            readonly name: "witnessTypestring";
            readonly type: "string";
        }, {
            readonly internalType: "uint256";
            readonly name: "id";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint256";
            readonly name: "allocatedAmount";
            readonly type: "uint256";
        }, {
            readonly components: readonly [{
                readonly internalType: "uint256";
                readonly name: "claimant";
                readonly type: "uint256";
            }, {
                readonly internalType: "uint256";
                readonly name: "amount";
                readonly type: "uint256";
            }];
            readonly internalType: "struct Component[]";
            readonly name: "claimants";
            readonly type: "tuple[]";
        }, {
            readonly internalType: "bytes32[]";
            readonly name: "additionalChains";
            readonly type: "bytes32[]";
        }, {
            readonly internalType: "uint256";
            readonly name: "chainIndex";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint256";
            readonly name: "notarizedChainId";
            readonly type: "uint256";
        }];
        readonly internalType: "struct ExogenousMultichainClaim";
        readonly name: "claimPayload";
        readonly type: "tuple";
    }];
    readonly name: "exogenousClaim";
    readonly outputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "claimHash";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "slot";
        readonly type: "bytes32";
    }];
    readonly name: "extsload";
    readonly outputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "bytes32[]";
        readonly name: "slots";
        readonly type: "bytes32[]";
    }];
    readonly name: "extsload";
    readonly outputs: readonly [{
        readonly internalType: "bytes32[]";
        readonly name: "";
        readonly type: "bytes32[]";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "slot";
        readonly type: "bytes32";
    }];
    readonly name: "exttload";
    readonly outputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }, {
        readonly internalType: "address";
        readonly name: "recipient";
        readonly type: "address";
    }, {
        readonly internalType: "uint256";
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly name: "forcedWithdrawal";
    readonly outputs: readonly [{
        readonly internalType: "bool";
        readonly name: "";
        readonly type: "bool";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "sponsor";
        readonly type: "address";
    }, {
        readonly internalType: "bytes12";
        readonly name: "lockTag";
        readonly type: "bytes12";
    }];
    readonly name: "getEmissaryStatus";
    readonly outputs: readonly [{
        readonly internalType: "enum EmissaryStatus";
        readonly name: "status";
        readonly type: "uint8";
    }, {
        readonly internalType: "uint256";
        readonly name: "emissaryAssignmentAvailableAt";
        readonly type: "uint256";
    }, {
        readonly internalType: "address";
        readonly name: "currentEmissary";
        readonly type: "address";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "account";
        readonly type: "address";
    }, {
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }];
    readonly name: "getForcedWithdrawalStatus";
    readonly outputs: readonly [{
        readonly internalType: "enum ForcedWithdrawalStatus";
        readonly name: "";
        readonly type: "uint8";
    }, {
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }];
    readonly name: "getLockDetails";
    readonly outputs: readonly [{
        readonly internalType: "address";
        readonly name: "";
        readonly type: "address";
    }, {
        readonly internalType: "address";
        readonly name: "";
        readonly type: "address";
    }, {
        readonly internalType: "enum ResetPeriod";
        readonly name: "";
        readonly type: "uint8";
    }, {
        readonly internalType: "enum Scope";
        readonly name: "";
        readonly type: "uint8";
    }, {
        readonly internalType: "bytes12";
        readonly name: "";
        readonly type: "bytes12";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [];
    readonly name: "getRequiredWithdrawalFallbackStipends";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "nativeTokenStipend";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "erc20TokenStipend";
        readonly type: "uint256";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "nonce";
        readonly type: "uint256";
    }, {
        readonly internalType: "address";
        readonly name: "allocator";
        readonly type: "address";
    }];
    readonly name: "hasConsumedAllocatorNonce";
    readonly outputs: readonly [{
        readonly internalType: "bool";
        readonly name: "";
        readonly type: "bool";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "owner";
        readonly type: "address";
    }, {
        readonly internalType: "address";
        readonly name: "spender";
        readonly type: "address";
    }];
    readonly name: "isOperator";
    readonly outputs: readonly [{
        readonly internalType: "bool";
        readonly name: "status";
        readonly type: "bool";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "sponsor";
        readonly type: "address";
    }, {
        readonly internalType: "bytes32";
        readonly name: "claimHash";
        readonly type: "bytes32";
    }, {
        readonly internalType: "bytes32";
        readonly name: "typehash";
        readonly type: "bytes32";
    }];
    readonly name: "isRegistered";
    readonly outputs: readonly [{
        readonly internalType: "bool";
        readonly name: "isActive";
        readonly type: "bool";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly components: readonly [{
            readonly internalType: "bytes";
            readonly name: "allocatorData";
            readonly type: "bytes";
        }, {
            readonly internalType: "bytes";
            readonly name: "sponsorSignature";
            readonly type: "bytes";
        }, {
            readonly internalType: "address";
            readonly name: "sponsor";
            readonly type: "address";
        }, {
            readonly internalType: "uint256";
            readonly name: "nonce";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint256";
            readonly name: "expires";
            readonly type: "uint256";
        }, {
            readonly internalType: "bytes32";
            readonly name: "witness";
            readonly type: "bytes32";
        }, {
            readonly internalType: "string";
            readonly name: "witnessTypestring";
            readonly type: "string";
        }, {
            readonly internalType: "uint256";
            readonly name: "id";
            readonly type: "uint256";
        }, {
            readonly internalType: "uint256";
            readonly name: "allocatedAmount";
            readonly type: "uint256";
        }, {
            readonly components: readonly [{
                readonly internalType: "uint256";
                readonly name: "claimant";
                readonly type: "uint256";
            }, {
                readonly internalType: "uint256";
                readonly name: "amount";
                readonly type: "uint256";
            }];
            readonly internalType: "struct Component[]";
            readonly name: "claimants";
            readonly type: "tuple[]";
        }, {
            readonly internalType: "bytes32[]";
            readonly name: "additionalChains";
            readonly type: "bytes32[]";
        }];
        readonly internalType: "struct MultichainClaim";
        readonly name: "claimPayload";
        readonly type: "tuple";
    }];
    readonly name: "multichainClaim";
    readonly outputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "claimHash";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }];
    readonly name: "name";
    readonly outputs: readonly [{
        readonly internalType: "string";
        readonly name: "";
        readonly type: "string";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [];
    readonly name: "name";
    readonly outputs: readonly [{
        readonly internalType: "string";
        readonly name: "";
        readonly type: "string";
    }];
    readonly stateMutability: "pure";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "claimHash";
        readonly type: "bytes32";
    }, {
        readonly internalType: "bytes32";
        readonly name: "typehash";
        readonly type: "bytes32";
    }];
    readonly name: "register";
    readonly outputs: readonly [{
        readonly internalType: "bool";
        readonly name: "";
        readonly type: "bool";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "typehash";
        readonly type: "bytes32";
    }, {
        readonly internalType: "address";
        readonly name: "";
        readonly type: "address";
    }, {
        readonly internalType: "address";
        readonly name: "sponsor";
        readonly type: "address";
    }, {
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }, {
        readonly internalType: "bytes32";
        readonly name: "";
        readonly type: "bytes32";
    }, {
        readonly internalType: "bytes32";
        readonly name: "";
        readonly type: "bytes32";
    }, {
        readonly internalType: "bytes";
        readonly name: "sponsorSignature";
        readonly type: "bytes";
    }];
    readonly name: "registerBatchFor";
    readonly outputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "claimHash";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "typehash";
        readonly type: "bytes32";
    }, {
        readonly internalType: "address";
        readonly name: "";
        readonly type: "address";
    }, {
        readonly internalType: "address";
        readonly name: "sponsor";
        readonly type: "address";
    }, {
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }, {
        readonly internalType: "bytes12";
        readonly name: "";
        readonly type: "bytes12";
    }, {
        readonly internalType: "address";
        readonly name: "";
        readonly type: "address";
    }, {
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }, {
        readonly internalType: "bytes32";
        readonly name: "";
        readonly type: "bytes32";
    }, {
        readonly internalType: "bytes";
        readonly name: "sponsorSignature";
        readonly type: "bytes";
    }];
    readonly name: "registerFor";
    readonly outputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "claimHash";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "typehash";
        readonly type: "bytes32";
    }, {
        readonly internalType: "address";
        readonly name: "sponsor";
        readonly type: "address";
    }, {
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "";
        readonly type: "uint256";
    }, {
        readonly internalType: "bytes32";
        readonly name: "";
        readonly type: "bytes32";
    }, {
        readonly internalType: "uint256";
        readonly name: "notarizedChainId";
        readonly type: "uint256";
    }, {
        readonly internalType: "bytes";
        readonly name: "sponsorSignature";
        readonly type: "bytes";
    }];
    readonly name: "registerMultichainFor";
    readonly outputs: readonly [{
        readonly internalType: "bytes32";
        readonly name: "claimHash";
        readonly type: "bytes32";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "bytes32[2][]";
        readonly name: "claimHashesAndTypehashes";
        readonly type: "bytes32[2][]";
    }];
    readonly name: "registerMultiple";
    readonly outputs: readonly [{
        readonly internalType: "bool";
        readonly name: "";
        readonly type: "bool";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "bytes12";
        readonly name: "lockTag";
        readonly type: "bytes12";
    }];
    readonly name: "scheduleEmissaryAssignment";
    readonly outputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "emissaryAssignmentAvailableAt";
        readonly type: "uint256";
    }];
    readonly stateMutability: "nonpayable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "operator";
        readonly type: "address";
    }, {
        readonly internalType: "bool";
        readonly name: "approved";
        readonly type: "bool";
    }];
    readonly name: "setOperator";
    readonly outputs: readonly [{
        readonly internalType: "bool";
        readonly name: "";
        readonly type: "bool";
    }];
    readonly stateMutability: "payable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "bytes4";
        readonly name: "interfaceId";
        readonly type: "bytes4";
    }];
    readonly name: "supportsInterface";
    readonly outputs: readonly [{
        readonly internalType: "bool";
        readonly name: "result";
        readonly type: "bool";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }];
    readonly name: "symbol";
    readonly outputs: readonly [{
        readonly internalType: "string";
        readonly name: "";
        readonly type: "string";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }];
    readonly name: "tokenURI";
    readonly outputs: readonly [{
        readonly internalType: "string";
        readonly name: "";
        readonly type: "string";
    }];
    readonly stateMutability: "view";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "to";
        readonly type: "address";
    }, {
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly name: "transfer";
    readonly outputs: readonly [{
        readonly internalType: "bool";
        readonly name: "";
        readonly type: "bool";
    }];
    readonly stateMutability: "payable";
    readonly type: "function";
}, {
    readonly inputs: readonly [{
        readonly internalType: "address";
        readonly name: "from";
        readonly type: "address";
    }, {
        readonly internalType: "address";
        readonly name: "to";
        readonly type: "address";
    }, {
        readonly internalType: "uint256";
        readonly name: "id";
        readonly type: "uint256";
    }, {
        readonly internalType: "uint256";
        readonly name: "amount";
        readonly type: "uint256";
    }];
    readonly name: "transferFrom";
    readonly outputs: readonly [{
        readonly internalType: "bool";
        readonly name: "";
        readonly type: "bool";
    }];
    readonly stateMutability: "payable";
    readonly type: "function";
}];
export type TheCompactAbi = typeof theCompactAbi;
