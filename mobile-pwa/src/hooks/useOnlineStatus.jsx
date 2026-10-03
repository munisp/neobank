import { useOfflineStatus } from './useOfflineStatus';

export const useOnlineStatus = () => useOfflineStatus().isOnline;
export default useOnlineStatus;
