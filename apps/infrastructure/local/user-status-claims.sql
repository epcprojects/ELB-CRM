-- Adds the user activate/deactivate claims introduced with the
-- user-account-status feature (docs/modules/user-account-status.md):
--   users.activate   ("Activate")
--   users.deactivate ("Deactivate")
--
-- Nothing today grants these beyond SUPER_ADMIN (the feature is new - there is
-- no "today's behaviour" to preserve for any other role). SUPER_ADMIN can
-- already use PUT /users/:id/status regardless of this script, because
-- PermissionsGuard bypasses the claim check for SUPER_ADMIN by role name -
-- this script just makes the Roles screen show the claim as granted for
-- SUPER_ADMIN instead of unchecked. Grant either claim to any other role from
-- the Roles screen (Settings > Roles > Edit permissions) once this has run,
-- the same way every other permission is granted to non-SUPER_ADMIN roles.
-- Safe to re-run: each insert is skipped if the role already has the claim.

INSERT INTO "role_claims" ("id", "createdAt", "updatedAt", "roleId", "claimType", "claimValue")
SELECT gen_random_uuid(), NOW(), NOW(), r."id", 'users.activate', 'true'
FROM "roles" r
WHERE r."normalizedName" = 'SUPER_ADMIN'
  AND NOT EXISTS (
        SELECT 1
        FROM "role_claims" rc
        WHERE rc."roleId" = r."id"
          AND rc."claimType" = 'users.activate'
      );

INSERT INTO "role_claims" ("id", "createdAt", "updatedAt", "roleId", "claimType", "claimValue")
SELECT gen_random_uuid(), NOW(), NOW(), r."id", 'users.deactivate', 'true'
FROM "roles" r
WHERE r."normalizedName" = 'SUPER_ADMIN'
  AND NOT EXISTS (
        SELECT 1
        FROM "role_claims" rc
        WHERE rc."roleId" = r."id"
          AND rc."claimType" = 'users.deactivate'
      );

-- Optional: uncomment to also grant both claims to every role that can
-- already delete users (users.delete) - i.e. treat "trusted to delete a
-- user" as "trusted to deactivate/reactivate one", which is the less
-- destructive action. Left commented out since, unlike SUPER_ADMIN, this
-- changes behaviour for real people rather than just reflecting it in the
-- UI - run it deliberately if that is what you want, not by default.
--
-- INSERT INTO "role_claims" ("id", "createdAt", "updatedAt", "roleId", "claimType", "claimValue")
-- SELECT gen_random_uuid(), NOW(), NOW(), r."id", 'users.activate', 'true'
-- FROM "roles" r
-- WHERE EXISTS (
--         SELECT 1 FROM "role_claims" rc
--         WHERE rc."roleId" = r."id" AND rc."claimType" = 'users.delete' AND LOWER(rc."claimValue") = 'true'
--       )
--   AND NOT EXISTS (
--         SELECT 1 FROM "role_claims" rc
--         WHERE rc."roleId" = r."id" AND rc."claimType" = 'users.activate'
--       );
--
-- INSERT INTO "role_claims" ("id", "createdAt", "updatedAt", "roleId", "claimType", "claimValue")
-- SELECT gen_random_uuid(), NOW(), NOW(), r."id", 'users.deactivate', 'true'
-- FROM "roles" r
-- WHERE EXISTS (
--         SELECT 1 FROM "role_claims" rc
--         WHERE rc."roleId" = r."id" AND rc."claimType" = 'users.delete' AND LOWER(rc."claimValue") = 'true'
--       )
--   AND NOT EXISTS (
--         SELECT 1 FROM "role_claims" rc
--         WHERE rc."roleId" = r."id" AND rc."claimType" = 'users.deactivate'
--       );
