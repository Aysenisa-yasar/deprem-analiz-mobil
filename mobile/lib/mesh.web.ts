export type MeshPeer = {
  peerId: string;
  name: string;
};

export type MeshTextEvent = {
  peerId: string;
  text: string;
};

export type MeshAvailability = {
  supported: boolean;
  reason?: string;
  playServicesAvailable?: boolean;
  runtime?: 'web';
};

export async function getMeshAvailability(): Promise<MeshAvailability> {
  return {
    supported: false,
    runtime: 'web',
    reason: 'Yakin cihaz mesh ozelligi web surumunde desteklenmiyor.',
  };
}

export async function ensureMeshReady(): Promise<{ ok: boolean; message?: string }> {
  return { ok: false, message: 'Yakin cihaz mesh ozelligi web surumunde desteklenmiyor.' };
}

export async function startMeshNode(): Promise<{ ok: boolean; peerId?: string; message?: string }> {
  return { ok: false, message: 'Yakin cihaz mesh ozelligi web surumunde desteklenmiyor.' };
}

export async function stopMeshNode(): Promise<void> {}

export async function requestMeshConnection(): Promise<{ ok: boolean; message?: string }> {
  return { ok: false, message: 'Desteklenmiyor' };
}

export async function acceptMeshConnection(): Promise<{ ok: boolean; message?: string }> {
  return { ok: false, message: 'Desteklenmiyor' };
}

export async function rejectMeshConnection(): Promise<{ ok: boolean; message?: string }> {
  return { ok: false, message: 'Desteklenmiyor' };
}

export async function disconnectMeshPeer(): Promise<void> {}

export async function sendMeshText(): Promise<{ ok: boolean; message?: string }> {
  return { ok: false, message: 'Desteklenmiyor' };
}

export async function subscribeMeshEvents(): Promise<() => void> {
  return () => {};
}
