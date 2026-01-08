declare module "dohjs" {
  export interface DnsAnswer {
    name: string;
    type: number;
    class: number;
    ttl: number;
    data: string | Uint8Array | ArrayBuffer;
    flush?: boolean;
  }

  export interface DnsResponse {
    answers: DnsAnswer[];
    questions: DnsQuestion[];
    authorities: DnsAnswer[];
    additionals: DnsAnswer[];
    id?: number;
    type?: string;
    flags?: number;
    flag_qr?: boolean;
    opcode?: string;
    flag_aa?: boolean;
    flag_tc?: boolean;
    flag_rd?: boolean;
    flag_ra?: boolean;
    flag_z?: boolean;
    flag_ad?: boolean;
    flag_cd?: boolean;
    rcode?: string;
    question?: DnsQuestion;
    answer?: DnsAnswer[];
    authority?: DnsAnswer[];
    additional?: DnsAnswer[];
  }

  export interface DnsQuestion {
    name: string;
    type: number;
    class: number;
  }

  export class DohResolver {
    constructor(endpoint: string);
    /**
     * Query for DNS records
     * @param qname the domain name to query for (e.g. example.com)
     * @param qtype the type of record we're looking for (e.g. A, AAAA, TXT, MX)
     * @param method Must be either "GET" or "POST"
     * @param headers define HTTP headers to use in the DNS query
     * @param timeout the number of milliseconds to wait for a response before aborting the request
     */
    query(
      qname: string,
      qtype?: string,
      method?: "GET" | "POST",
      headers?: Record<string, string>,
      timeout?: number
    ): Promise<DnsResponse>;
  }

  const doh: {
    DohResolver: typeof DohResolver;
  };

  export default doh;
}
