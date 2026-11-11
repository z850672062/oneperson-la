#!/bin/bash
set -e
echo "=== Before fix ==="
docker exec oneperson-la-mysql mysql -N -B -ula -pc1e7557c7223d363e2d1e5dd oneperson_la -e 'SELECT id, dueDate FROM Record WHERE dueDate IS NOT NULL LIMIT 5;'
echo ""
echo "=== Applying CONVERT_TZ +8h ==="
docker exec oneperson-la-mysql mysql -N -B -ula -pc1e7557c7223d363e2d1e5dd oneperson_la -e "UPDATE Record SET dueDate = CONVERT_TZ(dueDate, '+00:00', '+08:00') WHERE dueDate IS NOT NULL;"
echo ""
echo "=== After fix ==="
docker exec oneperson-la-mysql mysql -N -B -ula -pc1e7557c7223d363e2d1e5dd oneperson_la -e 'SELECT id, dueDate FROM Record WHERE dueDate IS NOT NULL LIMIT 5;'
