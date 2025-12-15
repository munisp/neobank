import ApiService from './ApiService';
import EncryptionService from './EncryptionService';

export interface BlockchainWallet {
  address: string;
  balance: number;
  currency: 'BTC' | 'ETH' | 'USDT' | 'USDC';
  privateKey?: string; // Encrypted
  publicKey: string;
}

export interface BlockchainTransaction {
  hash: string;
  from: string;
  to: string;
  amount: number;
  currency: string;
  fee: number;
  timestamp: Date;
  confirmations: number;
  status: 'pending' | 'confirmed' | 'failed';
  blockNumber?: number;
}

export interface SmartContract {
  address: string;
  name: string;
  type: 'escrow' | 'loan' | 'savings' | 'investment';
  balance: number;
  participants: string[];
  conditions: any;
  status: 'active' | 'completed' | 'cancelled';
}

export interface DeFiPosition {
  protocol: string;
  type: 'lending' | 'staking' | 'liquidity';
  asset: string;
  amount: number;
  apy: number;
  rewards: number;
  lockPeriod?: number;
}

class BlockchainService {
  private wallets: Map<string, BlockchainWallet> = new Map();
  private readonly SUPPORTED_CHAINS = ['ethereum', 'bitcoin', 'polygon', 'binance-smart-chain'];

  async createWallet(currency: 'BTC' | 'ETH' | 'USDT' | 'USDC'): Promise<BlockchainWallet> {
    try {
      // Generate wallet through backend API
      const response = await ApiService.post('/blockchain/create-wallet', { currency });
      
      const wallet: BlockchainWallet = {
        address: response.data.address,
        balance: 0,
        currency,
        privateKey: response.data.privateKey, // Should be encrypted
        publicKey: response.data.publicKey,
      };

      // Encrypt private key before storing
      if (wallet.privateKey) {
        wallet.privateKey = await EncryptionService.encrypt(wallet.privateKey);
      }

      this.wallets.set(wallet.address, wallet);
      return wallet;
    } catch (error) {
      console.error('Error creating blockchain wallet:', error);
      throw error;
    }
  }

  async importWallet(
    privateKey: string,
    currency: 'BTC' | 'ETH' | 'USDT' | 'USDC'
  ): Promise<BlockchainWallet> {
    try {
      const response = await ApiService.post('/blockchain/import-wallet', {
        privateKey,
        currency,
      });

      const wallet: BlockchainWallet = {
        address: response.data.address,
        balance: response.data.balance,
        currency,
        privateKey: await EncryptionService.encrypt(privateKey),
        publicKey: response.data.publicKey,
      };

      this.wallets.set(wallet.address, wallet);
      return wallet;
    } catch (error) {
      console.error('Error importing blockchain wallet:', error);
      throw error;
    }
  }

  async getWalletBalance(address: string): Promise<number> {
    try {
      const response = await ApiService.get(`/blockchain/balance/${address}`);
      return response.data.balance;
    } catch (error) {
      console.error('Error getting wallet balance:', error);
      throw error;
    }
  }

  async sendTransaction(
    from: string,
    to: string,
    amount: number,
    currency: string
  ): Promise<BlockchainTransaction> {
    try {
      const wallet = this.wallets.get(from);
      if (!wallet || !wallet.privateKey) {
        throw new Error('Wallet not found or private key missing');
      }

      // Decrypt private key
      const privateKey = await EncryptionService.decrypt(wallet.privateKey);

      // Send transaction through backend
      const response = await ApiService.post('/blockchain/send', {
        from,
        to,
        amount,
        currency,
        privateKey,
      });

      const transaction: BlockchainTransaction = {
        hash: response.data.hash,
        from,
        to,
        amount,
        currency,
        fee: response.data.fee,
        timestamp: new Date(),
        confirmations: 0,
        status: 'pending',
      };

      return transaction;
    } catch (error) {
      console.error('Error sending blockchain transaction:', error);
      throw error;
    }
  }

  async getTransactionHistory(address: string, limit: number = 50): Promise<BlockchainTransaction[]> {
    try {
      const response = await ApiService.get(`/blockchain/transactions/${address}?limit=${limit}`);
      return response.data.transactions.map((tx: any) => ({
        ...tx,
        timestamp: new Date(tx.timestamp),
      }));
    } catch (error) {
      console.error('Error getting transaction history:', error);
      return [];
    }
  }

  async getTransactionStatus(hash: string): Promise<BlockchainTransaction> {
    try {
      const response = await ApiService.get(`/blockchain/transaction/${hash}`);
      return {
        ...response.data,
        timestamp: new Date(response.data.timestamp),
      };
    } catch (error) {
      console.error('Error getting transaction status:', error);
      throw error;
    }
  }

  async estimateGasFee(
    from: string,
    to: string,
    amount: number,
    currency: string
  ): Promise<{ fee: number; feeInUSD: number }> {
    try {
      const response = await ApiService.post('/blockchain/estimate-fee', {
        from,
        to,
        amount,
        currency,
      });
      return response.data;
    } catch (error) {
      console.error('Error estimating gas fee:', error);
      throw error;
    }
  }

  // Smart Contract Operations
  async deploySmartContract(
    type: 'escrow' | 'loan' | 'savings' | 'investment',
    params: any
  ): Promise<SmartContract> {
    try {
      const response = await ApiService.post('/blockchain/deploy-contract', {
        type,
        params,
      });

      return {
        address: response.data.address,
        name: response.data.name,
        type,
        balance: 0,
        participants: params.participants || [],
        conditions: params.conditions,
        status: 'active',
      };
    } catch (error) {
      console.error('Error deploying smart contract:', error);
      throw error;
    }
  }

  async interactWithContract(
    contractAddress: string,
    method: string,
    params: any[]
  ): Promise<any> {
    try {
      const response = await ApiService.post('/blockchain/contract-call', {
        contractAddress,
        method,
        params,
      });
      return response.data;
    } catch (error) {
      console.error('Error interacting with smart contract:', error);
      throw error;
    }
  }

  async getContractStatus(contractAddress: string): Promise<SmartContract> {
    try {
      const response = await ApiService.get(`/blockchain/contract/${contractAddress}`);
      return response.data;
    } catch (error) {
      console.error('Error getting contract status:', error);
      throw error;
    }
  }

  // DeFi Operations
  async stakeCrypto(
    asset: string,
    amount: number,
    protocol: string,
    lockPeriod?: number
  ): Promise<DeFiPosition> {
    try {
      const response = await ApiService.post('/blockchain/defi/stake', {
        asset,
        amount,
        protocol,
        lockPeriod,
      });

      return {
        protocol,
        type: 'staking',
        asset,
        amount,
        apy: response.data.apy,
        rewards: 0,
        lockPeriod,
      };
    } catch (error) {
      console.error('Error staking crypto:', error);
      throw error;
    }
  }

  async lendCrypto(
    asset: string,
    amount: number,
    protocol: string
  ): Promise<DeFiPosition> {
    try {
      const response = await ApiService.post('/blockchain/defi/lend', {
        asset,
        amount,
        protocol,
      });

      return {
        protocol,
        type: 'lending',
        asset,
        amount,
        apy: response.data.apy,
        rewards: 0,
      };
    } catch (error) {
      console.error('Error lending crypto:', error);
      throw error;
    }
  }

  async provideLiquidity(
    token0: string,
    token1: string,
    amount0: number,
    amount1: number,
    protocol: string
  ): Promise<DeFiPosition> {
    try {
      const response = await ApiService.post('/blockchain/defi/liquidity', {
        token0,
        token1,
        amount0,
        amount1,
        protocol,
      });

      return {
        protocol,
        type: 'liquidity',
        asset: `${token0}/${token1}`,
        amount: amount0 + amount1,
        apy: response.data.apy,
        rewards: 0,
      };
    } catch (error) {
      console.error('Error providing liquidity:', error);
      throw error;
    }
  }

  async getDeFiPositions(address: string): Promise<DeFiPosition[]> {
    try {
      const response = await ApiService.get(`/blockchain/defi/positions/${address}`);
      return response.data.positions;
    } catch (error) {
      console.error('Error getting DeFi positions:', error);
      return [];
    }
  }

  async claimRewards(positionId: string): Promise<{ amount: number; txHash: string }> {
    try {
      const response = await ApiService.post('/blockchain/defi/claim-rewards', {
        positionId,
      });
      return response.data;
    } catch (error) {
      console.error('Error claiming rewards:', error);
      throw error;
    }
  }

  // NFT Operations
  async mintNFT(
    name: string,
    description: string,
    imageUrl: string,
    metadata: any
  ): Promise<{ tokenId: string; contractAddress: string; txHash: string }> {
    try {
      const response = await ApiService.post('/blockchain/nft/mint', {
        name,
        description,
        imageUrl,
        metadata,
      });
      return response.data;
    } catch (error) {
      console.error('Error minting NFT:', error);
      throw error;
    }
  }

  async getNFTs(address: string): Promise<any[]> {
    try {
      const response = await ApiService.get(`/blockchain/nft/owned/${address}`);
      return response.data.nfts;
    } catch (error) {
      console.error('Error getting NFTs:', error);
      return [];
    }
  }

  // Utility Methods
  async convertCrypto(
    from: string,
    to: string,
    amount: number
  ): Promise<{ rate: number; result: number; fee: number }> {
    try {
      const response = await ApiService.post('/blockchain/convert', {
        from,
        to,
        amount,
      });
      return response.data;
    } catch (error) {
      console.error('Error converting crypto:', error);
      throw error;
    }
  }

  async getCryptoPrice(symbol: string): Promise<{ price: number; change24h: number }> {
    try {
      const response = await ApiService.get(`/blockchain/price/${symbol}`);
      return response.data;
    } catch (error) {
      console.error('Error getting crypto price:', error);
      throw error;
    }
  }

  validateAddress(address: string, currency: string): boolean {
    // Basic validation (in production, use proper validation libraries)
    if (currency === 'BTC') {
      return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address);
    } else if (currency === 'ETH' || currency === 'USDT' || currency === 'USDC') {
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    }
    return false;
  }

  getWallets(): BlockchainWallet[] {
    return Array.from(this.wallets.values());
  }

  async exportPrivateKey(address: string, password: string): Promise<string> {
    const wallet = this.wallets.get(address);
    if (!wallet || !wallet.privateKey) {
      throw new Error('Wallet not found');
    }

    // Decrypt and return private key (should verify password first)
    return await EncryptionService.decrypt(wallet.privateKey);
  }
}

export default new BlockchainService();

