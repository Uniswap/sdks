import { Token } from './token'

/**
 * Known WETH9 implementation addresses, used in our implementation of Ether#wrapped
 */
export const WETH9: { [chainId: number]: Token } = {
  1: new Token(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 18, 'WETH', 'Wrapped Ether'),
  11155111: new Token(11155111, '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', 18, 'WETH', 'Wrapped Ether'),
  3: new Token(3, '0xc778417E063141139Fce010982780140Aa0cD5Ab', 18, 'WETH', 'Wrapped Ether'),
  4: new Token(4, '0xc778417E063141139Fce010982780140Aa0cD5Ab', 18, 'WETH', 'Wrapped Ether'),
  5: new Token(5, '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6', 18, 'WETH', 'Wrapped Ether'),
  42: new Token(42, '0xd0A1E359811322d97991E03f863a0C30C2cF029C', 18, 'WETH', 'Wrapped Ether'),

  10: new Token(10, '0x4200000000000000000000000000000000000006', 18, 'WETH', 'Wrapped Ether'),
  69: new Token(69, '0x4200000000000000000000000000000000000006', 18, 'WETH', 'Wrapped Ether'),
  11155420: new Token(11155420, '0x4200000000000000000000000000000000000006', 18, 'WETH', 'Wrapped Ether'),

  42161: new Token(42161, '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', 18, 'WETH', 'Wrapped Ether'),
  421611: new Token(421611, '0xB47e6A5f8b33b3F17603C83a0535A9dcD7E32681', 18, 'WETH', 'Wrapped Ether'),
  421614: new Token(421614, '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73', 18, 'WETH', 'Wrapped Ether'),

  8453: new Token(8453, '0x4200000000000000000000000000000000000006', 18, 'WETH', 'Wrapped Ether'),
  84532: new Token(84532, '0x4200000000000000000000000000000000000006', 18, 'WETH', 'Wrapped Ether'),

  56: new Token(56, '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', 18, 'WBNB', 'Wrapped BNB'),
  137: new Token(137, '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', 18, 'WMATIC', 'Wrapped MATIC'),
  43114: new Token(43114, '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', 18, 'WAVAX', 'Wrapped AVAX'),
  7777777: new Token(7777777, '0x4200000000000000000000000000000000000006', 18, 'WETH', 'Wrapped Ether'),
  81457: new Token(81457, '0x4300000000000000000000000000000000000004', 18, 'WETH', 'Wrapped Ether'),
  324: new Token(324, '0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91', 18, 'WETH', 'Wrapped Ether'),
  480: new Token(480, '0x4200000000000000000000000000000000000006', 18, 'WETH', 'Wrapped Ether'),
  1301: new Token(1301, '0x4200000000000000000000000000000000000006', 18, 'WETH', 'Wrapped Ether'),
  130: new Token(130, '0x4200000000000000000000000000000000000006', 18, 'WETH', 'Wrapped Ether'),
  10143: new Token(10143, '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701', 18, 'WMON', 'Wrapped Monad'),
  1868: new Token(1868, '0x4200000000000000000000000000000000000006', 18, 'WETH', 'Wrapped Ether'),
  // polygon zkevm
  1101: new Token(1101, '0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9', 18, 'WETH', 'Wrapped Ether'),

  // scroll
  534352: new Token(534352, '0x5300000000000000000000000000000000000004', 18, 'WETH', 'Wrapped Ether'),

  // lens
  232: new Token(324, '0x6bDc36E20D267Ff0dd6097799f82e78907105e2F', 18, 'WGHO', 'Wrapped GHO'),

  // xlayer
  196: new Token(196, '0xe538905cf8410324e03a5a23c1c177a474d59b2b', 18, 'WOKB', 'Wrapped OKB'),

  // gnosis
  100: new Token(100, '0xe91d153e0b41518a2ce8dd3d7944fa863463a97d', 18, 'WXDAI', 'Wrapped XDAI'),

  // bob
  60808: new Token(60808, '0x4200000000000000000000000000000000000006', 18, 'WETH', 'Wrapped Ether'),

  // lisk
  1135: new Token(1135, '0x4200000000000000000000000000000000000006', 18, 'WETH', 'Wrapped Ether'),

  // zklink
  810180: new Token(810180, '0x8280a4e7d5b3b658ec4580d3bc30f5e50454f169', 18, 'WETH', 'Wrapped Ether'),

  // taiko
  167000: new Token(167000, '0xA51894664A773981C6C112C43ce576f315d5b1B6', 18, 'WETH', 'Wrapped Ether'),

  // sei
  1329: new Token(1329, '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7', 18, 'WSEI', 'Wrapped SEI'),

  // mantle
  5000: new Token(5000, '0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8', 18, 'WMNT', 'Wrapped Mantle'),

  //seitestnet
  713715: new Token(713715, '0x57eE725BEeB991c70c53f9642f36755EC6eb2139', 18, 'WSEI', 'Wrapped SEI'),

  // linea
  59144: new Token(59144, '0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f', 18, 'WETH', 'Wrapped Ether'),

  // manta
  169: new Token(169, '0x0Dc808adcE2099A9F62AA87D9670745AbA741746', 18, 'WETH', 'Wrapped Ether'),

  // rootstock
  30: new Token(30, '0x542fDA317318eBF1d3DEAf76E0b632741A7e677d', 18, 'WRBTC', 'Wrapped BTC'),

  // filecoin
  314: new Token(314, '0x60E1773636CF5E4A227d9AC24F20fEca034ee25A', 18, 'WFIL', 'Wrapped FIL'),

  // boba
  288: new Token(288, '0xDeadDeAddeAddEAddeadDEaDDEAdDeaDDeAD0000', 18, 'WETH', 'Wrapped Ether'),

  // moonbeam
  1284: new Token(1284, '0xacc15dc74880c9944775448304b263d191c6077f', 18, 'WGLMR', 'Wrapped GLMR'),

  // corn
  21000000: new Token(21000000, '0xda5dDd7270381A7C2717aD10D1c0ecB19e3CDFb2', 18, 'WBTCN', 'Wrapped BTCN'),

  // metal
  1750: new Token(1750, '0x4200000000000000000000000000000000000006', 18, 'WETH', 'Wrapped Ether'),

  // sonic
  146: new Token(146, '0x039e2fb66102314ce7b64ce5ce3e5183bc94ad38', 18, 'wS', 'Wrapped Sonic'),

  // hemi
  43111: new Token(43111, '0x4200000000000000000000000000000000000006', 18, 'WETH', 'Wrapped Ether'),

  // telos
  40: new Token(40, '0xD102cE6A4dB07D247fcc28F366A623Df0938CA9E', 18, 'TLOS', 'Wrapped TLOS'),

  // goat
  2345: new Token(2345, '0xbC10000000000000000000000000000000000000', 18, 'WGBTC', 'Wrapped Goat Bitcoin'),

  // redbelly
  151: new Token(151, '0x6ed1F491e2d31536D6561f6bdB2AdC8F092a6076', 18, 'WRBNT', 'Wrapped RBNT'),

  // lightlink
  1890: new Token(1890, '0x7EbeF2A4b1B09381Ec5B9dF8C5c6f2dBECA59c73', 18, 'WETH', 'Wrapped Ether'),

  // xdc
  50: new Token(50, '0x951857744785e80e2de051c32ee7b25f9c458c42', 18, 'WXDC', 'Wrapped XDC'),

  // nibiru
  6900: new Token(6900, '0x0CaCF669f8446BeCA826913a3c6B96aCD4b02a97', 18, 'WNIBI', 'Wrapped Nibi'),

  // etherlink
  42793: new Token(42793, '0xc9B53AB2679f573e480d01e0f49e2B5CFB7a3EAb', 18, 'WZTX', 'Wrapped XTZ'),

  // matchain
  698: new Token(698, '0x4200000000000000000000000000000000000006', 18, 'WBNB', 'Wrapped BNB'),

  // plasma
  9745: new Token(9745, '0x6100E367285b01F48D07953803A2d8dCA5D19873', 18, 'WXPL', 'Wrapped XPL'),

  // 0g
  16661: new Token(16661, '0x1cd0690ff9a693f5ef2dd976660a8dafc81a109c', 18, 'W0G', 'Wrapped 0G'),
}
