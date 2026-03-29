import { Audio } from 'expo-av';

let audioModeReady = false;
let siren: Audio.Sound | null = null;

async function ensureAudioMode(): Promise<void> {
  if (audioModeReady) return;
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    allowsRecordingIOS: false,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
  audioModeReady = true;
}

/** Acil ekranı: döngüsel siren (tekrar basınca veya stop ile biter). */
export async function startSirenLoop(): Promise<void> {
  try {
    await ensureAudioMode();
    if (siren) return;
    const { sound } = await Audio.Sound.createAsync(
      require('../assets/sounds/siren.wav'),
      { isLooping: true, volume: 0.85 }
    );
    siren = sound;
    await siren.playAsync();
  } catch {
    /* simülatör / web / sessiz mod kısıtı */
  }
}

export async function stopSirenLoop(): Promise<void> {
  if (!siren) return;
  try {
    await siren.stopAsync();
    await siren.unloadAsync();
  } catch {
    /* */
  }
  siren = null;
}

/** Konum uyarısı gönderildiğinde kısa bip. */
export async function playAlertChime(): Promise<void> {
  try {
    await ensureAudioMode();
    const { sound } = await Audio.Sound.createAsync(
      require('../assets/sounds/alert_chime.wav'),
      { shouldPlay: true, volume: 0.95 }
    );
    sound.setOnPlaybackStatusUpdate((st) => {
      if (st.isLoaded && 'didJustFinish' in st && st.didJustFinish) void sound.unloadAsync();
    });
  } catch {
    /* */
  }
}
