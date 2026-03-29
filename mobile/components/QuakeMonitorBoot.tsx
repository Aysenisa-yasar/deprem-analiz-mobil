import { useAuth } from '@/context/AuthContext';
import { useQuakeAlertMonitor } from '@/hooks/useQuakeAlertMonitor';

/** Arka planda M5+ / 150 km kontrolü (ön planda periyodik). */
export function QuakeMonitorBoot() {
  const { apiBase, token, user } = useAuth();
  useQuakeAlertMonitor(apiBase, token, user?.emergency_contact ?? null);
  return null;
}
