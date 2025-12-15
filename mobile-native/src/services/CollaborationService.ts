import ApiService from './ApiService';
import { io, Socket } from 'socket.io-client';

export interface SharedAccount {
  id: string;
  name: string;
  balance: number;
  owners: AccountOwner[];
  permissions: AccountPermissions;
  type: 'joint' | 'business' | 'family';
}

export interface AccountOwner {
  userId: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  permissions: string[];
  addedAt: Date;
}

export interface AccountPermissions {
  canTransfer: boolean;
  canViewTransactions: boolean;
  canAddMembers: boolean;
  canModifySettings: boolean;
  requireApproval: boolean;
  dailyLimit?: number;
}

export interface PendingApproval {
  id: string;
  type: 'transaction' | 'member_add' | 'settings_change';
  initiator: string;
  details: any;
  requiredApprovals: number;
  currentApprovals: number;
  approvers: { userId: string; approved: boolean; timestamp?: Date }[];
  expiresAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
}

export interface CollaborationEvent {
  id: string;
  accountId: string;
  type: 'transaction' | 'member_added' | 'member_removed' | 'settings_changed' | 'approval_requested';
  userId: string;
  userName: string;
  details: any;
  timestamp: Date;
}

class CollaborationService {
  private socket: Socket | null = null;
  private sharedAccounts: Map<string, SharedAccount> = new Map();
  private eventListeners: Map<string, ((event: CollaborationEvent) => void)[]> = new Map();

  async initialize(userId: string, token: string): Promise<void> {
    try {
      // Connect to WebSocket server
      this.socket = io(process.env.EXPO_PUBLIC_WS_URL || 'ws://localhost:3000', {
        auth: { token },
        transports: ['websocket'],
      });

      this.setupSocketListeners();
      await this.loadSharedAccounts(userId);
    } catch (error) {
      console.error('Error initializing collaboration service:', error);
      throw error;
    }
  }

  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Connected to collaboration server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from collaboration server');
    });

    this.socket.on('collaboration_event', (event: CollaborationEvent) => {
      this.handleCollaborationEvent(event);
    });

    this.socket.on('approval_requested', (approval: PendingApproval) => {
      this.handleApprovalRequest(approval);
    });

    this.socket.on('member_activity', (activity: any) => {
      this.handleMemberActivity(activity);
    });
  }

  private handleCollaborationEvent(event: CollaborationEvent): void {
    // Notify listeners
    const listeners = this.eventListeners.get(event.accountId) || [];
    listeners.forEach((listener) => listener(event));

    // Update local state if needed
    if (event.type === 'transaction') {
      this.updateAccountBalance(event.accountId, event.details.newBalance);
    }
  }

  private handleApprovalRequest(approval: PendingApproval): void {
    // Notify user of approval request
    console.log('Approval requested:', approval);
  }

  private handleMemberActivity(activity: any): void {
    // Track member activity for real-time updates
    console.log('Member activity:', activity);
  }

  private async loadSharedAccounts(userId: string): Promise<void> {
    try {
      const response = await ApiService.get(`/collaboration/accounts/${userId}`);
      response.data.accounts.forEach((account: SharedAccount) => {
        this.sharedAccounts.set(account.id, account);
      });
    } catch (error) {
      console.error('Error loading shared accounts:', error);
    }
  }

  async createSharedAccount(
    name: string,
    type: 'joint' | 'business' | 'family',
    initialOwners: { userId: string; role: string }[]
  ): Promise<SharedAccount> {
    try {
      const response = await ApiService.post('/collaboration/create-account', {
        name,
        type,
        initialOwners,
      });

      const account: SharedAccount = response.data.account;
      this.sharedAccounts.set(account.id, account);

      // Join account room for real-time updates
      this.socket?.emit('join_account', account.id);

      return account;
    } catch (error) {
      console.error('Error creating shared account:', error);
      throw error;
    }
  }

  async addMember(
    accountId: string,
    userId: string,
    role: 'admin' | 'member' | 'viewer',
    permissions: string[]
  ): Promise<void> {
    try {
      const account = this.sharedAccounts.get(accountId);
      if (!account) {
        throw new Error('Account not found');
      }

      if (account.permissions.requireApproval) {
        // Create approval request
        await this.requestApproval(accountId, 'member_add', {
          userId,
          role,
          permissions,
        });
      } else {
        // Add member directly
        await ApiService.post('/collaboration/add-member', {
          accountId,
          userId,
          role,
          permissions,
        });

        // Emit event
        this.socket?.emit('member_added', {
          accountId,
          userId,
          role,
        });
      }
    } catch (error) {
      console.error('Error adding member:', error);
      throw error;
    }
  }

  async removeMember(accountId: string, userId: string): Promise<void> {
    try {
      await ApiService.post('/collaboration/remove-member', {
        accountId,
        userId,
      });

      // Emit event
      this.socket?.emit('member_removed', {
        accountId,
        userId,
      });

      // Update local state
      const account = this.sharedAccounts.get(accountId);
      if (account) {
        account.owners = account.owners.filter((owner) => owner.userId !== userId);
      }
    } catch (error) {
      console.error('Error removing member:', error);
      throw error;
    }
  }

  async updateMemberPermissions(
    accountId: string,
    userId: string,
    permissions: Partial<AccountPermissions>
  ): Promise<void> {
    try {
      await ApiService.post('/collaboration/update-permissions', {
        accountId,
        userId,
        permissions,
      });

      // Emit event
      this.socket?.emit('permissions_updated', {
        accountId,
        userId,
        permissions,
      });
    } catch (error) {
      console.error('Error updating permissions:', error);
      throw error;
    }
  }

  async requestApproval(
    accountId: string,
    type: 'transaction' | 'member_add' | 'settings_change',
    details: any
  ): Promise<PendingApproval> {
    try {
      const response = await ApiService.post('/collaboration/request-approval', {
        accountId,
        type,
        details,
      });

      const approval: PendingApproval = response.data.approval;

      // Emit event to notify other members
      this.socket?.emit('approval_requested', approval);

      return approval;
    } catch (error) {
      console.error('Error requesting approval:', error);
      throw error;
    }
  }

  async approveRequest(approvalId: string, userId: string): Promise<void> {
    try {
      await ApiService.post('/collaboration/approve', {
        approvalId,
        userId,
      });

      // Emit event
      this.socket?.emit('approval_given', {
        approvalId,
        userId,
      });
    } catch (error) {
      console.error('Error approving request:', error);
      throw error;
    }
  }

  async rejectRequest(approvalId: string, userId: string, reason?: string): Promise<void> {
    try {
      await ApiService.post('/collaboration/reject', {
        approvalId,
        userId,
        reason,
      });

      // Emit event
      this.socket?.emit('approval_rejected', {
        approvalId,
        userId,
        reason,
      });
    } catch (error) {
      console.error('Error rejecting request:', error);
      throw error;
    }
  }

  async getPendingApprovals(accountId: string): Promise<PendingApproval[]> {
    try {
      const response = await ApiService.get(`/collaboration/approvals/${accountId}`);
      return response.data.approvals;
    } catch (error) {
      console.error('Error getting pending approvals:', error);
      return [];
    }
  }

  async initiateSharedTransaction(
    accountId: string,
    transaction: {
      type: 'transfer' | 'payment';
      amount: number;
      recipient: string;
      description?: string;
    }
  ): Promise<{ transactionId?: string; approvalId?: string }> {
    try {
      const account = this.sharedAccounts.get(accountId);
      if (!account) {
        throw new Error('Account not found');
      }

      if (account.permissions.requireApproval) {
        // Create approval request
        const approval = await this.requestApproval(accountId, 'transaction', transaction);
        return { approvalId: approval.id };
      } else {
        // Execute transaction directly
        const response = await ApiService.post('/collaboration/transaction', {
          accountId,
          ...transaction,
        });

        // Emit event
        this.socket?.emit('transaction_completed', {
          accountId,
          transactionId: response.data.transactionId,
          amount: transaction.amount,
        });

        return { transactionId: response.data.transactionId };
      }
    } catch (error) {
      console.error('Error initiating shared transaction:', error);
      throw error;
    }
  }

  async getAccountActivity(
    accountId: string,
    limit: number = 50
  ): Promise<CollaborationEvent[]> {
    try {
      const response = await ApiService.get(
        `/collaboration/activity/${accountId}?limit=${limit}`
      );
      return response.data.events.map((event: any) => ({
        ...event,
        timestamp: new Date(event.timestamp),
      }));
    } catch (error) {
      console.error('Error getting account activity:', error);
      return [];
    }
  }

  async getMemberActivity(
    accountId: string,
    userId: string
  ): Promise<CollaborationEvent[]> {
    try {
      const response = await ApiService.get(
        `/collaboration/member-activity/${accountId}/${userId}`
      );
      return response.data.events;
    } catch (error) {
      console.error('Error getting member activity:', error);
      return [];
    }
  }

  addEventListener(
    accountId: string,
    listener: (event: CollaborationEvent) => void
  ): void {
    const listeners = this.eventListeners.get(accountId) || [];
    listeners.push(listener);
    this.eventListeners.set(accountId, listeners);
  }

  removeEventListener(
    accountId: string,
    listener: (event: CollaborationEvent) => void
  ): void {
    const listeners = this.eventListeners.get(accountId) || [];
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
      this.eventListeners.set(accountId, listeners);
    }
  }

  private updateAccountBalance(accountId: string, newBalance: number): void {
    const account = this.sharedAccounts.get(accountId);
    if (account) {
      account.balance = newBalance;
    }
  }

  getSharedAccounts(): SharedAccount[] {
    return Array.from(this.sharedAccounts.values());
  }

  getSharedAccount(accountId: string): SharedAccount | undefined {
    return this.sharedAccounts.get(accountId);
  }

  async leaveAccount(accountId: string, userId: string): Promise<void> {
    await this.removeMember(accountId, userId);
    this.sharedAccounts.delete(accountId);
    this.socket?.emit('leave_account', accountId);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.sharedAccounts.clear();
    this.eventListeners.clear();
  }
}

export default new CollaborationService();

