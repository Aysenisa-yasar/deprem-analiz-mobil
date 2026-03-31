import { useAlertPreferences } from '@/context/AlertPreferencesContext';
import { useAuth } from '@/context/AuthContext';
import { useMesh } from '@/context/MeshContext';
import { useQuakeAlertMonitor } from '@/hooks/useQuakeAlertMonitor';

export function QuakeMonitorBoot() {
  const { apiBase, token, user } = useAuth();
  const { preferences } = useAlertPreferences();
  const { relayEmergencyText } = useMesh();

  useQuakeAlertMonitor(
    apiBase,
    token,
    user?.emergency_contact ?? null,
    preferences,
    relayEmergencyText
  );
  return null;
}
