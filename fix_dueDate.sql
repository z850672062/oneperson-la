UPDATE Record SET dueDate = CONVERT_TZ(dueDate, '+00:00', '+08:00') WHERE dueDate IS NOT NULL;
SELECT ROW_COUNT() AS rows_updated;
