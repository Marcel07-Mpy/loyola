/**
 * Envoie l'avancement d'un import uniquement au client Socket.IO autorisé.
 */
const SOCKET_HEADER = 'x-import-socket-id';

/**
 * Émet la progression uniquement vers le socket authentifié appartenant
 * au même utilisateur que la requête HTTP. Une absence de socket ne bloque
 * jamais l'import : seule la barre de progression temps réel est omise.
 */
export const emitImportProgress = (req, progress, extra = {}) => {
  const io = req.app.get('io');
  const socketId = req.get(SOCKET_HEADER);
  if (!io || !socketId || !req.user?.id) return false;

  const socket = io.sockets.sockets.get(socketId);
  if (!socket || String(socket.user?.id) !== String(req.user.id)) return false;

  socket.emit('import-progress', {
    progress: Math.max(0, Math.min(100, Math.floor(Number(progress) || 0))),
    ...extra
  });
  return true;
};
