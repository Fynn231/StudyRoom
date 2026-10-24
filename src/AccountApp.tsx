import { App } from './App.js';
import { sessionIdentity, useAuth } from './auth.js';
import { StorageAccountProvider } from './privateStorage.js';
export function AccountApp() {
  const { config, session } = useAuth();
  const key = config?.required ? sessionIdentity(session) : 'local';
  return <StorageAccountProvider key={key} account={config?.required ? session!.user.id : null}><App /></StorageAccountProvider>;
}
