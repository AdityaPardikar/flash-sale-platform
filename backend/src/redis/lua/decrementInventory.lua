local key = KEYS[1]
local quantity = tonumber(ARGV[1])

local current = redis.call('GET', key)
if not current then
  return 0
end

current = tonumber(current)
if current < quantity then
  return 0
end

redis.call('DECRBY', key, quantity)
return current - quantity
