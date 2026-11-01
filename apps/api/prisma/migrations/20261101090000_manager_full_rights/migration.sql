-- New default: a manager holds every right (only owners can touch owner accounts and edit
-- roles, which the API enforces by role, not by rights). Existing manager roles catch up.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."key" = 'MANAGER'
ON CONFLICT DO NOTHING;
