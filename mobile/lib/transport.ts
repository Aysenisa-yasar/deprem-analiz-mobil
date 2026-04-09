export const ACTIVE_TRANSPORT = {
  key: 'server_relay_queue',
  title: 'Sunucu relay + cihaz kuyrugu',
  summary:
    'Baglanti varsa iletiler sunucuya anlik gider. Baglanti yoksa mesajlar cihazda kalici olarak kuyruklanir ve ag gelince yeniden gonderilir.',
  peerToPeer: false,
  peerToPeerLabel: 'Yok',
  meshDisclaimer: 'Bu surum dogrudan cihazlar arasi Bluetooth veya Wi-Fi mesh kullanmaz.',
} as const;
