import { http } from 'wagmi';
import { base } from '@reown/appkit/networks';

// Define RPC URLs
export const RPC_URLS = {
  [base.id]: [
    'https://mainnet.base.org',
    'https://base.blockpi.network/v1/rpc/public',
    'https://1rpc.io/base',
    'https://base.meowrpc.com'
  ]
};

// Create RPC transport configuration
export const createRPCTransport = (chainId) => {
  const urls = RPC_URLS[chainId] || [];
  const primaryUrl = urls[0];

  return http(primaryUrl, {
    timeout: 30000,
    fetchOptions: {
      method: 'POST',
      headers: {
        'Accept': '*/*',
        'Content-Type': 'application/json',
      },
      mode: 'cors',
      cache: 'no-cache',
      credentials: 'omit'
    },
    retryCount: 3,
    retryDelay: 1000,
    batch: {
      wait: 0,
    },
  });
}; 