export const REDIS_KEY_PREFIX = {
  inventory: 'inventory',
  reservation: 'reservation',
  queue: 'queue',
  session: 'session',
};

export const REDIS_TTL_SECONDS = {
  reservation: 300,
  session: 86400,
};

export const buildInventoryKey = (flashSaleId: string) =>
  `${REDIS_KEY_PREFIX.inventory}:${flashSaleId}`;
export const buildReservationKey = (userId: string, flashSaleId: string) =>
  `${REDIS_KEY_PREFIX.reservation}:${userId}:${flashSaleId}`;
export const buildQueueKey = (flashSaleId: string) => `${REDIS_KEY_PREFIX.queue}:${flashSaleId}`;
export const buildSessionKey = (userId: string) => `${REDIS_KEY_PREFIX.session}:${userId}`;
