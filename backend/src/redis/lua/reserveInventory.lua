local inventory_key = KEYS[1]
local reservation_key = KEYS[2]
local user_id = ARGV[1]
local quantity = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])

local current = redis.call('GET', inventory_key)
if not current then
  return 0
end

current = tonumber(current)
if current < quantity then
  return 0
end

redis.call('DECRBY', inventory_key, quantity)
redis.call('HSET', reservation_key, 'quantity', quantity, 'reserved_at', redis.call('TIME')[1], 'user_id', user_id)
redis.call('EXPIRE', reservation_key, ttl)

return 1
