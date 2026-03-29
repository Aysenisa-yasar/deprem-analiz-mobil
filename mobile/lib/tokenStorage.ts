/**
 * TypeScript `tsc` bu dosyayı çözer. Metro web → tokenStorage.web.ts,
 * iOS/Android → tokenStorage.native.ts önceliklidir (.ts’den önce gelir).
 */
export {
  getStoredToken,
  setStoredToken,
  clearStoredToken,
  getStoredApiBase,
  setStoredApiBase,
} from './tokenStorage.native';
