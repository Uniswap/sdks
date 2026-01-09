import { sign } from './sign'
import { canonicalStringify } from './utils/canonicalJson'

const data = 'test data'
const privateKeyECDSAHex =
  '308187020100301306072a8648ce3d020106082a8648ce3d030107046d306b02010104204561da0c3b192dca9fa180d647e59ad04c77c17aafff0c8e3d2985dbda3df66ca14403420004cefbae9e0f151f4dbefe50fe3fc9aeac4e3714cb33042d29de13f77f1d19f3514c4b31f65bc86a5080adf8ece1f670b6cf2c7fa7de72a2f537a9113be5828723'
const privateKeyECDSA384Hex =
  '3081b6020100301006072a8648ce3d020106052b8104002204819e30819b02010104300c61e16a57943ae71cbb73ccd1f6d914f30184d9971b7a86f2cbd2386d1e7c8ec45774f2925b5e6a6addcbab1e0fafd3a16403620004af7f9116300ea745534abc2287f1ecc53255a41b71efb017dc46e471bf1d6ffb0ff845f61808bc4393c09a3f0b29c2abd0795b1c6c85aa831698236500d1abcc7ef231521f7f0eb5770669040b99bddce0177142814bb7609ccab20070c5fe18'
const privateKeyECDSA521Hex =
  '3081ee020100301006072a8648ce3d020106052b810400230481d63081d3020101044200f7f722272016353c3a93d94a985f3621a0f853c576d2538ea8a2dc04a67fb839b92e86d935fc24939d782f73eae7af70df2a142d69fc531d5e925d4e784fbeca12a1818903818600040047c0496236899313676b881c1e51871487225959900ddc761ed6a0ff01c567513cfc3407eb794d245038f133303f76a7f6f1c03b957ca3d7e1a2e1fcd5fa79268f016a9eb311207958057df25a262dc0e66626dbe022e64a6a0db7e832d001ae367cfdeaf7cc6b11f6a1fb8af0b707041203f65ca08890ff6167e3a1242d24d0a4a04e'
const privateKeyEd25519Hex =
  '302e020100300506032b657004220420d4ee72dbf913584ad5b6d8f1f769f8ad3afe7c28cbf1d4fbe097a88f44755842'
const privateKeyRSAHex =
  '308204bd020100300d06092a864886f70d0101010500048204a7308204a302010002820101009d36845018ef5dc07a3097055a5657404be931644c98350ad86918ac3873dad2b3950ab8913856d1f47281a48eeec17737a0c7dd02f3dda3e1d86bfd72932968efee7b6d2a73e9b72a1eb741d3016b212a41f000936e0e7b9bc9726b7522447b8059a3263020c0685896f2d597a6b25dc8255c34c8ac12c3f6410d8200a8aa880f93cda8e7085550dba93ddb2623325094ef2fff466057998bf9da851c4ff7064a719cde40882ccec5c1c32ecc5918b63fb46416f1d3761aab4a2249737b5700e9e65df075a91cb33846e4efafccb45bfa622af11a6ff9ca6fcf7d3140d6227652b63337a90db79461957bb0390934454530392f243e9a2ace92d0375136e3f10203010001028201000486ea862099aff242c7d3142136faef368b0ca98de26a25eef7b91bfdca299871f9b8e3cf5c0c754cf133d62869814d0209e6b21b60d3568c97d3503fdeddf7e56f7c180cd0bbffa813acaf95630fe72b6a2cfe39eb418e81fcbf31e49f167d69ee402f9c28d7f18944db7c416582f306b83b5b526b50ba5a2fcdb2f07aeae226e6c1f5adfacc0aa7258b43c3ee4f6f73082de06e588346377432ed2cc64e291c1fd2865b8ffcc51912b99cf94dd90d0e4bdc86d28ee4a928d0662ab35cf61f3bb8a811c7f9101f798a86bde5ae57b47b9b7e89a9fa4ec4a7fcc1bd66f2eb70592ac0d2ecd45ffa6bd9634e5929b6ca1a84e875bf37bcd95bf31277393ba8f902818100caa994f63f5a618e5ea2aa08c7c31a5228609c1212a7fca0162ba99439ee56116a948f30b06af60fff4896ffbbc60b21a7e4cb995f0da6f6b0c17d99f4af3065f82e8eb4cf522ac01202c90a9e9891db53fc939fd95efdfb57b5f3959b3642a839a2c064680fb220cea0b4808f6e91aedd2ddc34c6ab5d35f976917eeb84741502818100c696c4b9158a00507ddbad880114bbe53838fe3db45f429dc0164305c52c64c885c0f9c1fd50326a547553906835392ef114f6055f88cda9f0829633cc58b07e296b260f37b68b810536361bdbe1cf0de9b4dc521c7769dfad4eaec72a7f8f0e1ca267d02882eb693e1bc1dd1965772e402bbd7f2b1d418e3168b26fffd65b6d02818100a8a19af59b9994fb65fb6c088a4fe9a2db3e281f51aebe2266d045f6b48d80c8552af04acf40f12636812c43f6f6bf646dd38f263b559ccc401f80678e96076b91ab0bcb9f86fb537ea91aa7df778c4638083ebe0f9d5f30b8b709cc3eae53a0aef4a1a9ea7cc4f74f77a13a281f14d1aff0ecfe6d21421a1b4d719b6e5574510281806329a3dfdbce862bab3d07a0d3115c65b0365d55c87c8cd222b9bb0be5922e5d26d4dea22c70604c5212280102d818cec4d937a4253935a13714ae15fd6307f6678e367a00d2e9442aab1047c6fb319dfbe630e1db8f1151fcc33e68fb62a8b75e3b06659de509d20a8e67b694d8e2b3389ddec8e2698073955e77438fd7a4dd0281802c922eb471ae33be9724dcb6bdb32f547987d958a7d995d003075a0f5f3ed006b05af8964693ba393a614a46d3af519c5a845b16ba37e26a94d37758fefb823abbf6d135cb7c344094d67d551c977db11963455f5b9af2c1b94de5fbc77b765abb1cf6cab6d343560af4d3d1f2538717584d107b21e4f8bfed9c7690f102ff69'
const privateKeyRSA_PSSHex = privateKeyRSAHex

describe('sign', () => {
  describe('RS256 (RSASSA-PKCS1-v1_5)', () => {
    it('should return expected signature', async () => {
      const result = await sign(data, privateKeyRSAHex, 'RS256')

      expect(result).toBe(
        '0x487f06a3dfdd4fc57dd3f60e3534b7853238bf57cf8f41fb12542bd4427a3f9569c2a11a6db68e170ceed85f9786bef12156aa6b2574601ce62b27417bbae8e7c405aae0a8d33efa940c09b1b7af024313f1b9cd9e0d7c59c9fc71433898224d16a53787fc1d74182adaed049b9bfe6d44605597691f0e7db223feca52ac5a31be13c654c4d0c4a5e0430dd24493f2cbd454308dae3cd1f06adacb7ae00427784adde34f5d02d117780851e11f675f1402ca70b6fe8c36c8a542442b0563e91357d1b929140f1394876a46f4f5c8d0b86a4d9083aefb1c739bb8e1ba175f0b9245704907aa74c7b6520e967f24f08402fb3eee3e73c609168a4325080b428f01'
      )
    })
  })

  describe('PS256 (RSA-PSS)', () => {
    it('should be 512 byte string', async () => {
      const result = await sign(data, privateKeyRSA_PSSHex, 'PS256')

      expect(typeof result).toBe('string')
      expect(result.startsWith('0x')).toBe(true)
      expect(result.slice(2)).toHaveLength(512)
    })
    it('should be non-deterministic', async () => {
      const result1 = await sign(data, privateKeyRSA_PSSHex, 'PS256')
      const result2 = await sign(data, privateKeyRSA_PSSHex, 'PS256')

      expect(result1).not.toBe(result2)
    })
  })

  describe('PS384 (RSA-PSS)', () => {
    it('should be 512 byte string', async () => {
      const result = await sign(data, privateKeyRSA_PSSHex, 'PS384')

      expect(typeof result).toBe('string')
      expect(result.startsWith('0x')).toBe(true)
      expect(result.slice(2)).toHaveLength(512)
    })
    it('should be non-deterministic', async () => {
      const result1 = await sign(data, privateKeyRSA_PSSHex, 'PS384')
      const result2 = await sign(data, privateKeyRSA_PSSHex, 'PS384')

      expect(result1).not.toBe(result2)
    })
  })

  describe('PS512 (RSA-PSS)', () => {
    it('should be 512 byte string', async () => {
      const result = await sign(data, privateKeyRSA_PSSHex, 'PS512')

      expect(typeof result).toBe('string')
      expect(result.startsWith('0x')).toBe(true)
      expect(result.slice(2)).toHaveLength(512)
    })
    it('should be non-deterministic', async () => {
      const result1 = await sign(data, privateKeyRSA_PSSHex, 'PS512')
      const result2 = await sign(data, privateKeyRSA_PSSHex, 'PS512')

      expect(result1).not.toBe(result2)
    })
  })

  describe('ES256 (ECDSA)', () => {
    it('should be 128 byte string', async () => {
      const result = await sign(data, privateKeyECDSAHex, 'ES256')
      expect(typeof result).toBe('string')
      expect(result.startsWith('0x')).toBe(true)
      expect(result.slice(2)).toHaveLength(128)
    })
    it('should be non-deterministic', async () => {
      const result1 = await sign(data, privateKeyECDSAHex, 'ES256')
      const result2 = await sign(data, privateKeyECDSAHex, 'ES256')
      expect(result1).not.toBe(result2)
    })
  })

  describe('ES384 (ECDSA)', () => {
    it('should be 192 byte string', async () => {
      const result = await sign(data, privateKeyECDSA384Hex, 'ES384')
      expect(typeof result).toBe('string')
      expect(result.startsWith('0x')).toBe(true)
      expect(result.slice(2)).toHaveLength(192)
    })
    it('should be non-deterministic', async () => {
      const result1 = await sign(data, privateKeyECDSA384Hex, 'ES384')
      const result2 = await sign(data, privateKeyECDSA384Hex, 'ES384')
      expect(result1).not.toBe(result2)
    })
  })

  describe('ES512 (ECDSA)', () => {
    it('should be 264 byte string', async () => {
      const result = await sign(data, privateKeyECDSA521Hex, 'ES512')
      expect(typeof result).toBe('string')
      expect(result.startsWith('0x')).toBe(true)
      expect(result.slice(2)).toHaveLength(264)
    })
    it('should be non-deterministic', async () => {
      const result1 = await sign(data, privateKeyECDSA521Hex, 'ES512')
      const result2 = await sign(data, privateKeyECDSA521Hex, 'ES512')
      expect(result1).not.toBe(result2)
    })
  })

  describe('RS384 (RSASSA-PKCS1-v1_5)', () => {
    it('should return expected signature', async () => {
      const result = await sign(data, privateKeyRSAHex, 'RS384')

      expect(result).toBe(
        '0x0ede12714220dd35b082f3b289fe6e0ccde1beead727397e2f3db9343fc2f88938d32afcd918fc3bbb89356968feec8a9fdd04c88dac2c4fc475bf00f941e43ebd740c88041d3ddd5342e75cf8ed29a88683f1ca01ba3c38926479651aa937008bb7bb613708dddf2b281e61fcdfc368dfabebff26e4c38abc9c1bf0cdcea0eedc9659ef193935aa6487692c67615aae0b49fae7d44d21f4ddecc38b03164f502ab39e8a79c6dcff18db8f0e385d070178e9d5820985ec7591d8e21a22001d52c78baec17551fad9c423634736df77c4bc54c0c7a4344ee02ca6a1ca5e04f4a16c0dac13694fcf6d2bd57a6177f1107ce946305bb154eb8f6afe6e9905b017ef'
      )
    })
  })

  describe('RS512 (RSASSA-PKCS1-v1_5)', () => {
    it('should return expected signature', async () => {
      const result = await sign(data, privateKeyRSAHex, 'RS512')

      expect(result).toBe(
        '0x540df91df1b1526b1040b790f9e65ba626d72702b80fbe5be3ebea770fced0c35c0c8861810bf4fcf7687d3884cf8ce90325bebdfbefd2acdda44f0ac14e0182a347216cba04f5a7a87760edf74aa4551160c49c3f6d25a764fbfc176d49833a0fd86538cb062e58d2d6f192a78524f41131a870587bc6676854a6e11c8be0f6d1841e53ab1a76099b9fc002b708d362d2075455e46dd546953b2adfc0660df74faafacf4f204da939b651a05273976bb9ab585d26e74c4140829610a90a39e816da63b6dafe7694110234faf5eb66f52343e9e19a8252b75c1d98a8998c37dacae178ff263bdff868bc9d7856b9ec7ffa3f90b2cecdb7fac374612bbb33dd80'
      )
    })
  })

  describe('EdDSA (Ed25519)', () => {
    it('should return expected signature', async () => {
      const result = await sign(data, privateKeyEd25519Hex, 'EdDSA')

      expect(result).toBe(
        '0x0804a2a72f52d7afdaf18b78e1a48891a729be1bdde2b30366fd00a128bc37243aa75c36e8b0a93b71fe7dfd7b67bee0838e25acd26b8a81ad7074ae38f84102'
      )
    })
  })

  describe('Object payload canonicalization', () => {
    it('signs object payload using canonical JSON (RS256 deterministic)', async () => {
      const payload = {
        method: 'eth_call',
        params: { b: 2, a: 1, c: undefined as unknown as never },
      }
      const canonical = canonicalStringify(payload)

      const sigObj = await sign(payload, privateKeyRSAHex, 'RS256')
      const sigStr = await sign(canonical, privateKeyRSAHex, 'RS256')

      expect(sigObj).toBe(sigStr)
    })
  })

  describe('Error handling', () => {
    it('should throw error for unsupported algorithm', async () => {
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
        sign(data, privateKeyRSAHex, 'INVALID_ALGO' as any)
      ).rejects.toThrow()
    })

    it('should throw error for key-algorithm mismatch', async () => {
      await expect(sign(data, privateKeyECDSAHex, 'PS256')).rejects.toThrow()
    })
  })
})
