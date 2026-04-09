import { useAlertPreferences } from '@/context/AlertPreferencesContext';
import { useAuth } from '@/context/AuthContext';
import { useQuakeAlertMonitor } from '@/hooks/useQuakeAlertMonitor';

export function QuakeMonitorBoot() {
  const { apiBase, token, user } = useAuth();
  const { preferences } = useAlertPreferences();

  useQuakeAlertMonitor(apiBase, token, user?.emergency_contact ?? null, preferences);
  return null;
}
