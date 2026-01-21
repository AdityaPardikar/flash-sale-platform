local reservation_key = KEYS[1]
local inventory_key = KEYS[2]

local quantity = tonumber(redis.call('HGET', reservation_key, 'quantity') or 0)

if quantity == 0 then
  redis.call('DEL', reservation_key)
  return 0
end

redis.call('INCRBY', inventory_key, quantity)
redis.call('DEL', reservation_key)
return quantity
