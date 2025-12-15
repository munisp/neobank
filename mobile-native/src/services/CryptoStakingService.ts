import ApiService from './ApiService';
import BlockchainService from './BlockchainService';

export interface StakingPool {
  id: string;
  currency: 'ETH' | 'ADA' | 'DOT' | 'SOL' | 'MATIC';
  name: string;
  apy: number;
  minStake: number;
  lockPeriod: number; // days
  totalStaked: number;
  participants: number;
  risk: 'low' | 'medium' | 'high';
}

export interface StakingPosition {
  id: string;
  poolId: string;
  currency: string;
  amount: number;
  startDate: Date;
  unlockDate: Date;
  currentValue: number;
  earnedRewards: number;
  apy: number;
  status: 'active' | 'pending' | 'unlocking' | 'completed';
}

export interface DeFiProtocol {
  id: string;
  name: string;
  type: 'lending' | 'liquidity' | 'yield' | 'staking';
  supportedAssets: string[];
  apy: number;
  tvl: number; // Total Value Locked
  risk: 'low' | 'medium' | 'high';
  audited: boolean;
}

export interface DeFiPosition {
  id: string;
  protocolId: string;
  protocolName: string;
  type: string;
  asset: string;
  amount: number;
  currentValue: number;
  earnedYield: number;
  apy: number;
  startDate: Date;
}

class CryptoStakingService {
  private stakingPools: StakingPool[] = [];
  private stakingPositions: StakingPosition[] = [];
  private defiProtocols: DeFiProtocol[] = [];
  private defiPositions: DeFiPosition[] = [];

  async loadStakingPools(): Promise<StakingPool[]> {
    try {
      const response = await ApiService.get('/crypto/staking/pools');
      this.stakingPools = response.data.pools;
      return this.stakingPools;
    } catch (error) {
      console.error('Error loading staking pools:', error);
      return [];
    }
  }

  async stakeTokens(
    poolId: string,
    amount: number,
    lockPeriod: number
  ): Promise<StakingPosition> {
    try {
      const pool = this.stakingPools.find((p) => p.id === poolId);
      if (!pool) {
        throw new Error('Pool not found');
      }

      if (amount < pool.minStake) {
        throw new Error(`Minimum stake is ${pool.minStake} ${pool.currency}`);
      }

      const response = await ApiService.post('/crypto/staking/stake', {
        poolId,
        amount,
        lockPeriod,
      });

      const position: StakingPosition = {
        id: response.data.positionId,
        poolId,
        currency: pool.currency,
        amount,
        startDate: new Date(),
        unlockDate: new Date(Date.now() + lockPeriod * 24 * 60 * 60 * 1000),
        currentValue: amount,
        earnedRewards: 0,
        apy: pool.apy,
        status: 'active',
      };

      this.stakingPositions.push(position);

      return position;
    } catch (error) {
      console.error('Error staking tokens:', error);
      throw error;
    }
  }

  async unstakeTokens(positionId: string): Promise<{
    success: boolean;
    amount: number;
    rewards: number;
    unlockDate?: Date;
  }> {
    try {
      const position = this.stakingPositions.find((p) => p.id === positionId);
      if (!position) {
        throw new Error('Position not found');
      }

      const now = new Date();
      if (now < position.unlockDate) {
        // Early unstaking - may incur penalty
        const response = await ApiService.post(`/crypto/staking/unstake/${positionId}`, {
          early: true,
        });

        return {
          success: true,
          amount: response.data.amount,
          rewards: response.data.rewards,
          unlockDate: position.unlockDate,
        };
      }

      // Normal unstaking
      const response = await ApiService.post(`/crypto/staking/unstake/${positionId}`);

      position.status = 'completed';

      return {
        success: true,
        amount: response.data.amount,
        rewards: response.data.rewards,
      };
    } catch (error) {
      console.error('Error unstaking tokens:', error);
      throw error;
    }
  }

  async claimStakingRewards(positionId: string): Promise<number> {
    try {
      const response = await ApiService.post(`/crypto/staking/claim-rewards/${positionId}`);

      const position = this.stakingPositions.find((p) => p.id === positionId);
      if (position) {
        position.earnedRewards = 0; // Reset after claiming
      }

      return response.data.rewardsClaimed;
    } catch (error) {
      console.error('Error claiming staking rewards:', error);
      throw error;
    }
  }

  async getStakingPositions(): Promise<StakingPosition[]> {
    try {
      const response = await ApiService.get('/crypto/staking/positions');
      this.stakingPositions = response.data.positions.map((pos: any) => ({
        ...pos,
        startDate: new Date(pos.startDate),
        unlockDate: new Date(pos.unlockDate),
      }));
      return this.stakingPositions;
    } catch (error) {
      console.error('Error fetching staking positions:', error);
      return [];
    }
  }

  async getTotalStakingRewards(): Promise<number> {
    return this.stakingPositions.reduce((total, pos) => total + pos.earnedRewards, 0);
  }

  async loadDeFiProtocols(): Promise<DeFiProtocol[]> {
    try {
      const response = await ApiService.get('/crypto/defi/protocols');
      this.defiProtocols = response.data.protocols;
      return this.defiProtocols;
    } catch (error) {
      console.error('Error loading DeFi protocols:', error);
      return [];
    }
  }

  async depositToDeFi(
    protocolId: string,
    asset: string,
    amount: number
  ): Promise<DeFiPosition> {
    try {
      const protocol = this.defiProtocols.find((p) => p.id === protocolId);
      if (!protocol) {
        throw new Error('Protocol not found');
      }

      if (!protocol.supportedAssets.includes(asset)) {
        throw new Error(`Asset ${asset} not supported by this protocol`);
      }

      const response = await ApiService.post('/crypto/defi/deposit', {
        protocolId,
        asset,
        amount,
      });

      const position: DeFiPosition = {
        id: response.data.positionId,
        protocolId,
        protocolName: protocol.name,
        type: protocol.type,
        asset,
        amount,
        currentValue: amount,
        earnedYield: 0,
        apy: protocol.apy,
        startDate: new Date(),
      };

      this.defiPositions.push(position);

      return position;
    } catch (error) {
      console.error('Error depositing to DeFi:', error);
      throw error;
    }
  }

  async withdrawFromDeFi(positionId: string, amount?: number): Promise<{
    success: boolean;
    withdrawn: number;
    yield: number;
  }> {
    try {
      const response = await ApiService.post(`/crypto/defi/withdraw/${positionId}`, {
        amount,
      });

      if (!amount) {
        // Full withdrawal
        this.defiPositions = this.defiPositions.filter((p) => p.id !== positionId);
      } else {
        // Partial withdrawal
        const position = this.defiPositions.find((p) => p.id === positionId);
        if (position) {
          position.amount -= amount;
          position.currentValue -= amount;
        }
      }

      return {
        success: true,
        withdrawn: response.data.withdrawn,
        yield: response.data.yield,
      };
    } catch (error) {
      console.error('Error withdrawing from DeFi:', error);
      throw error;
    }
  }

  async getDeFiPositions(): Promise<DeFiPosition[]> {
    try {
      const response = await ApiService.get('/crypto/defi/positions');
      this.defiPositions = response.data.positions.map((pos: any) => ({
        ...pos,
        startDate: new Date(pos.startDate),
      }));
      return this.defiPositions;
    } catch (error) {
      console.error('Error fetching DeFi positions:', error);
      return [];
    }
  }

  async getTotalDeFiYield(): Promise<number> {
    return this.defiPositions.reduce((total, pos) => total + pos.earnedYield, 0);
  }

  async provideLiquidity(
    asset1: string,
    amount1: number,
    asset2: string,
    amount2: number
  ): Promise<DeFiPosition> {
    try {
      const response = await ApiService.post('/crypto/defi/liquidity/add', {
        asset1,
        amount1,
        asset2,
        amount2,
      });

      const position: DeFiPosition = {
        id: response.data.positionId,
        protocolId: response.data.protocolId,
        protocolName: response.data.protocolName,
        type: 'liquidity',
        asset: `${asset1}-${asset2}`,
        amount: amount1 + amount2,
        currentValue: amount1 + amount2,
        earnedYield: 0,
        apy: response.data.apy,
        startDate: new Date(),
      };

      this.defiPositions.push(position);

      return position;
    } catch (error) {
      console.error('Error providing liquidity:', error);
      throw error;
    }
  }

  async removeLiquidity(positionId: string): Promise<{
    success: boolean;
    asset1Amount: number;
    asset2Amount: number;
    fees: number;
  }> {
    try {
      const response = await ApiService.post(`/crypto/defi/liquidity/remove/${positionId}`);

      this.defiPositions = this.defiPositions.filter((p) => p.id !== positionId);

      return response.data;
    } catch (error) {
      console.error('Error removing liquidity:', error);
      throw error;
    }
  }

  async getStakingRewardsHistory(limit: number = 50): Promise<any[]> {
    try {
      const response = await ApiService.get(`/crypto/staking/rewards/history?limit=${limit}`);
      return response.data.rewards;
    } catch (error) {
      console.error('Error fetching staking rewards history:', error);
      return [];
    }
  }

  async getDeFiYieldHistory(limit: number = 50): Promise<any[]> {
    try {
      const response = await ApiService.get(`/crypto/defi/yield/history?limit=${limit}`);
      return response.data.yields;
    } catch (error) {
      console.error('Error fetching DeFi yield history:', error);
      return [];
    }
  }

  async estimateStakingRewards(
    poolId: string,
    amount: number,
    days: number
  ): Promise<number> {
    const pool = this.stakingPools.find((p) => p.id === poolId);
    if (!pool) {
      return 0;
    }

    const dailyRate = pool.apy / 365 / 100;
    const rewards = amount * dailyRate * days;

    return rewards;
  }

  async estimateDeFiYield(
    protocolId: string,
    amount: number,
    days: number
  ): Promise<number> {
    const protocol = this.defiProtocols.find((p) => p.id === protocolId);
    if (!protocol) {
      return 0;
    }

    const dailyRate = protocol.apy / 365 / 100;
    const yield_ = amount * dailyRate * days;

    return yield_;
  }

  getStakingPools(): StakingPool[] {
    return this.stakingPools;
  }

  getDeFiProtocols(): DeFiProtocol[] {
    return this.defiProtocols;
  }
}

export default new CryptoStakingService();

