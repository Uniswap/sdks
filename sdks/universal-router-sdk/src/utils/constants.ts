import { BigNumber } from "ethers";

export const CONTRACT_BALANCE = BigNumber.from(2).pow(255);
export const ETH_ADDRESS = "0x0000000000000000000000000000000000000000";
export const E_ETH_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const MAX_UINT256 = BigNumber.from(2).pow(256).sub(1);
export const MAX_UINT160 = BigNumber.from(2).pow(160).sub(1);

export const SENDER_AS_RECIPIENT = "0x0000000000000000000000000000000000000001";
export const ROUTER_AS_RECIPIENT = "0x0000000000000000000000000000000000000002";

export enum UniversalRouterVersion {
  V1_2 = "1.2",
  V2_0 = "2.0",
}

export type RouterConfig = {
  address: string;
  creationBlock: number;
};

type ChainConfig = {
  weth: string;
  routerConfigs: { [key in UniversalRouterVersion]: RouterConfig };
};

const WETH_NOT_SUPPORTED_ON_CHAIN =
  "0x0000000000000000000000000000000000000000";

// Todo: Change `CHAIN_CONFIGS` to pull the UR address with v4
export const CHAIN_CONFIGS: { [key: number]: ChainConfig } = {
  // mainnet
  [1]: {
    weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 17143817,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",
        creationBlock: 1737658355,
      },
    },
  },
  // goerli
  [5]: {
    weth: "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 8940568,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 8940568,
      },
    },
  },
  // sepolia
  [11155111]: {
    weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 3543575,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0x3a9d48ab9751398bbfa63ad67599bb04e4bdf98b", // only update here and creation block below
        creationBlock: 7259601,
      },
    },
  },
  // polygon
  [137]: {
    weth: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0xec7BE89e9d109e7e3Fec59c222CF297125FEFda2",
        creationBlock: 52210153,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0x1095692a6237d83c6a72f3f5efedb9a670c49223",
        creationBlock: 1737492197,
      },
    },
  },
  //polygon mumbai
  [80001]: {
    weth: "0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 35176052,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 35176052,
      },
    },
  },
  //optimism
  [10]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0xCb1355ff08Ab38bBCE60111F1bb2B784bE25D7e8",
        creationBlock: 114702266,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0x851116d9223fabed8e56c0e6b8ad0c31d98b3507",
        creationBlock: 1737494278,
      },
    },
  },
  // optimism goerli
  [420]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 8887728,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 8887728,
      },
    },
  },
  // arbitrum
  [42161]: {
    weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x5E325eDA8064b456f4781070C0738d849c824258",
        creationBlock: 169472836,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0xa51afafe0263b40edaef0df8781ea9aa03e381a3",
        creationBlock: 1737487458,
      },
    },
  },
  // arbitrum goerli
  [421613]: {
    weth: "0xe39Ab88f8A4777030A534146A9Ca3B52bd5D43A3",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 18815277,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 18815277,
      },
    },
  },
  // celo
  [42220]: {
    weth: WETH_NOT_SUPPORTED_ON_CHAIN,
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x643770e279d5d0733f21d6dc03a8efbabf3255b4",
        creationBlock: 21407637,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0x643770e279d5d0733f21d6dc03a8efbabf3255b4",
        creationBlock: 21407637,
      },
    },
  },
  // celo alfajores
  [44787]: {
    weth: WETH_NOT_SUPPORTED_ON_CHAIN,
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 17566658,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 17566658,
      },
    },
  },
  // binance smart chain
  [56]: {
    weth: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x4Dae2f939ACf50408e13d58534Ff8c2776d45265",
        creationBlock: 35160263,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0x1906c1d672b88cd1b9ac7593301ca990f94eae07",
        creationBlock: 1737493275,
      },
    },
  },
  // avalanche
  [43114]: {
    weth: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x4Dae2f939ACf50408e13d58534Ff8c2776d45265",
        creationBlock: 40237257,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0x94b75331ae8d42c1b61065089b7d48fe14aa73b7",
        creationBlock: 1737558236,
      },
    },
  },
  // base goerli
  [84531]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0xd0872d928672ae2ff74bdb2f5130ac12229cafaf",
        creationBlock: 6915289,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0xd0872d928672ae2ff74bdb2f5130ac12229cafaf",
        creationBlock: 6915289,
      },
    },
  },
  // base mainnet
  [8453]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
        creationBlock: 9107268,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0x6ff5693b99212da76ad316178a184ab56d299b43",
        creationBlock: 1737491485,
      },
    },
  },
  // blast
  [81457]: {
    weth: "0x4300000000000000000000000000000000000004",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x643770E279d5D0733F21d6DC03A8efbABf3255B4",
        creationBlock: 1116444,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0xeabbcb3e8e415306207ef514f660a3f820025be3",
        creationBlock: 1737564586,
      },
    },
  },
  // zora
  [7777777]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x2986d9721A49838ab4297b695858aF7F17f38014",
        creationBlock: 11832155,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0x3315ef7ca28db74abadc6c44570efdf06b04b020",
        creationBlock: 1737562927,
      },
    },
  },
  [324]: {
    weth: "0x5aea5775959fbc2557cc8789bc1bf90a239d9a91",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x28731BCC616B5f51dD52CF2e4dF0E78dD1136C06",
        creationBlock: 12640979,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0x28731BCC616B5f51dD52CF2e4dF0E78dD1136C06",
        creationBlock: 12640979,
      },
    },
  },
  // worldchain
  [480]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
        creationBlock: 4063979,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0x8ac7bee993bb44dab564ea4bc9ea67bf9eb5e743",
        creationBlock: 1737559557,
      },
    },
  },
  [1301]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
        creationBlock: 1241811,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0xf70536b3bcc1bd1a972dc186a2cf84cc6da6be5d",
        creationBlock: 7100543,
      },
    },
  },
  // unichain mainnet
  [130]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x4D73A4411CA1c660035e4AECC8270E5DdDEC8C17",
        creationBlock: 23678,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0xef740bf23acae26f6492b10de645d6b98dc8eaf3",
        creationBlock: 1737568156,
      },
    },
  },
  [10143]: {
    weth: "0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x3ae6d8a282d67893e17aa70ebffb33ee5aa65893",
        creationBlock: 23678,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0x3ae6d8a282d67893e17aa70ebffb33ee5aa65893",
        creationBlock: 23678,
      },
    },
  },
  [84532]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x492e6456d9528771018deb9e87ef7750ef184104",
        creationBlock: 20216585,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0x492e6456d9528771018deb9e87ef7750ef184104",
        creationBlock: 20216585,
      },
    },
  },
  [1868]: {
    weth: "0x4200000000000000000000000000000000000006",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x0e2850543f69f678257266e0907ff9a58b3f13de",
        creationBlock: 3254782,
      },
      [UniversalRouterVersion.V2_0]: {
        address: "0x0e2850543f69f678257266e0907ff9a58b3f13de",
        creationBlock: 3254782,
      },
    },
  },
  //moonbeam
  [1284]: {
    weth: "0x30d2a9f5fdf90ace8c17952cbb4ee48a55d916a7",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x1F56F4e1648e96633c7FE79002036E967403CDfF",
        creationBlock: 3340490,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
  },
  // boba
  [288]: {
    weth: "0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000",
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x4ba622997559f9b5ac68751d7fc3deecc23a0e88",
        creationBlock: 969351,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
  },
  //lens
  [232]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0xAA904d497e42608C014BE83a026E984aFc16129b",
        creationBlock: 184116,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0x6bDc36E20D267Ff0dd6097799f82e78907105e2F",
  },
  //xlayer
  [196]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x1b35fbA9357fD9bda7ed0429C8BbAbe1e8CC88fc",
        creationBlock: 4346684,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0xe538905cf8410324e03a5a23c1c177a474d59b2b",
  },
  //gnosis
  [100]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x75FC67473A91335B5b8F8821277262a13B38c9b3",
        creationBlock: 35719251,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
  },
  //bob
  [60808]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x346239972d1fa486FC4a521031BC81bFB7D6e8a4",
        creationBlock: 5369968,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0x4200000000000000000000000000000000000006",
  },
  //lisk
  [1135]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x447B8E40B0CdA8e55F405C86bC635D02d0540aB8",
        creationBlock: 578844,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0x4200000000000000000000000000000000000006",
  },
  //zklink
  [810180]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x2274bDE50218DDB955e7f60e4f2344e3Bff9D193",
        creationBlock: 4404950,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0x8280a4e7D5B3B658ec4580d3Bc30f5e50454F169",
  },
  //taiko
  [167000]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x346239972d1fa486FC4a521031BC81bFB7D6e8a4",
        creationBlock: 2382,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0xA51894664A773981C6C112C43ce576f315d5b1B6",
  },
  // sei
  [1329]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0xa683c66045ad16abb1bCE5ad46A64d95f9A25785",
        creationBlock: 79447543,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7",
  },
  //mantle
  [5000]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x447B8E40B0CdA8e55F405C86bC635D02d0540aB8",
        creationBlock: 63841377,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8",
  },
  //sei testnet
  [713715]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x61a27a55f72bbCba64554246BCE2da43C164543B",
        creationBlock: 16342547,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0x57eE725BEeB991c70c53f9642f36755EC6eb2139",
  },
  //linea
  [59144]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0xd7c7d7f18dd5388d5217c9696c7e799fcd75c6bd",
        creationBlock: 3609803,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f",
  },
  //polygon zkevm
  [1101]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x32454e81d065FAA95Ec0d0Ab6Fe326599Af30fd7",
        creationBlock: 8467040,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9",
  },
  //scroll
  [534352]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x595E7160858b1AdA94Bda790D8699C85e595117E",
        creationBlock: 1380,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0x5300000000000000000000000000000000000004",
  },
  //manta
  [169]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x42Bff1f6b647462fcD8c28a488Be9C9988830ef6",
        creationBlock: 1199217,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0x0Dc808adcE2099A9F62AA87D9670745AbA741746",
  },
  //rootstock
  [30]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x244f68e77357f86a8522323eBF80b5FC2F814d3E",
        creationBlock: 5830624,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0x542fDA317318eBF1d3DEAf76E0b632741A7e677d",
  },
  //filecoin
  [314]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x83702C6356A1028A900F83d446D189a31646a16b",
        creationBlock: 3255833,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0x60E1773636CF5E4A227d9AC24F20fEca034ee25A",
  },
  //corn
  [21000000]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x9db70E29712Cc8Af10c2B597BaDA6784544FF407",
        creationBlock: 10939,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0xda5dDd7270381A7C2717aD10D1c0ecB19e3CDFb2",
  },
  //etherlink
  [42793]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x9db70E29712Cc8Af10c2B597BaDA6784544FF407",
        creationBlock: 14585098,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0xc9B53AB2679f573e480d01e0f49e2B5CFB7a3EAb",
  },
  //metal
  [1750]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x346239972d1fa486FC4a521031BC81bFB7D6e8a4",
        creationBlock: 10815185,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0x4200000000000000000000000000000000000006",
  },
  //sonic
  [146]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x738fD6d10bCc05c230388B4027CAd37f82fe2AF2",
        creationBlock: 322921,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38",
  },
  [50]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x738fD6d10bCc05c230388B4027CAd37f82fe2AF2",
        creationBlock: 87231190,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0x951857744785e80e2de051c32ee7b25f9c458c42",
  },
  //telos
  [40]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x738fD6d10bCc05c230388B4027CAd37f82fe2AF2",
        creationBlock: 386636864,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0xD102cE6A4dB07D247fcc28F366A623Df0938CA9E",
  },
  //hemi
  [43111]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x533c7A53389e0538AB6aE1D7798D6C1213eAc28B",
        creationBlock: 1293665,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0x4200000000000000000000000000000000000006",
  },
  //goat
  [2345]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x738fD6d10bCc05c230388B4027CAd37f82fe2AF2",
        creationBlock: 964033,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0xbC10000000000000000000000000000000000000",
  },
  //redbelly
  [151]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x1b35fbA9357fD9bda7ed0429C8BbAbe1e8CC88fc",
        creationBlock: 2286087,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0x6ed1F491e2d31536D6561f6bdB2AdC8F092a6076",
  },
  //saga
  [5464]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0xa683c66045ad16abb1bCE5ad46A64d95f9A25785",
        creationBlock: 19318,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0xE3dbcD53f4Ce1b06Ab200f4912BD35672e68f1FA",
  },
  //lightlink
  [1890]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x738fD6d10bCc05c230388B4027CAd37f82fe2AF2",
        creationBlock: 131406742,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0xa683c66045ad16abb1bCE5ad46A64d95f9A25785",
  },
  //nibiru
  [6900]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0xA7E6cB0A6B1BE8b779022A6aFcb097cF0d3Ff4A2",
        creationBlock: 23658719,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0x0CaCF669f8446BeCA826913a3c6B96aCD4b02a97",
  },
  // Matchain
  [698]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x9db70E29712Cc8Af10c2B597BaDA6784544FF407",
        creationBlock: 37614238,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0x4200000000000000000000000000000000000006",
  },
  // plasma
  [9745]: {
    routerConfigs: {
      [UniversalRouterVersion.V1_2]: {
        address: "0x1b35fbA9357fD9bda7ed0429C8BbAbe1e8CC88fc",
        creationBlock: 430782,
      },
      [UniversalRouterVersion.V2_0]: {
        address: ZERO_ADDRESS,
        creationBlock: 0,
      },
    },
    weth: "0x6100E367285b01F48D07953803A2d8dCA5D19873",
  },
};

export const UNIVERSAL_ROUTER_ADDRESS = (
  version: UniversalRouterVersion,
  chainId: number,
): string => {
  if (!(chainId in CHAIN_CONFIGS))
    throw new Error(`Universal Router not deployed on chain ${chainId}`);
  return CHAIN_CONFIGS[chainId].routerConfigs[version].address;
};

export const UNIVERSAL_ROUTER_CREATION_BLOCK = (
  version: UniversalRouterVersion,
  chainId: number,
): number => {
  if (!(chainId in CHAIN_CONFIGS))
    throw new Error(`Universal Router not deployed on chain ${chainId}`);
  return CHAIN_CONFIGS[chainId].routerConfigs[version].creationBlock;
};

export const WETH_ADDRESS = (chainId: number): string => {
  if (!(chainId in CHAIN_CONFIGS))
    throw new Error(`Universal Router not deployed on chain ${chainId}`);

  if (CHAIN_CONFIGS[chainId].weth == WETH_NOT_SUPPORTED_ON_CHAIN)
    throw new Error(`Chain ${chainId} does not have WETH`);

  return CHAIN_CONFIGS[chainId].weth;
};
