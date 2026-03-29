/**
 * TypeScript bu dosyayi cozer. Metro ise platforma gore `.native.ts` / `.web.ts`
 * dosyasini secer.
 */
export {
  acceptMeshConnection,
  disconnectMeshPeer,
  ensureMeshReady,
  getMeshAvailability,
  rejectMeshConnection,
  requestMeshConnection,
  sendMeshText,
  startMeshNode,
  stopMeshNode,
  subscribeMeshEvents,
  type MeshAvailability,
  type MeshPeer,
  type MeshTextEvent,
} from './mesh.native';
