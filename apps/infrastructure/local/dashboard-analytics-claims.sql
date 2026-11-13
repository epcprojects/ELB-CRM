-- Adds the dashboard analytics claims introduced with the Analytics tab:
--   dashboard.view_analytics      (gates the whole Analytics tab)
--   dashboard.view_team_analytics (gates cross-agent data: roster, leaderboard,
--                                  other agents' workload)
--
-- To keep today's behaviour, every role that can already see dashboard stats
-- gets view_analytics, and every role that can already view all leads also
-- gets view_team_analytics. New roles created afterward are configured by
-- the client's admin from the Roles page. Safe to re-run.

INSERT INTO "role_claims" ("id", "createdAt", "updatedAt", "roleId", "claimType", "claimValue")
SELECT gen_random_uuid(), NOW(), NOW(), r."id", 'dashboard.view_analytics', 'true'
FROM "roles" r
WHERE (
        r."normalizedName" = 'SUPER_ADMIN'
        OR EXISTS (
          SELECT 1
          FROM "role_claims" rc
          WHERE rc."roleId" = r."id"
            AND rc."claimType" IN ('dashboard.view_stats', 'dashboard:view_stats')
            AND LOWER(rc."claimValue") = 'true'
        )
      )
  AND NOT EXISTS (
        SELECT 1
        FROM "role_claims" rc
        WHERE rc."roleId" = r."id"
          AND rc."claimType" IN ('dashboard.view_analytics', 'dashboard:view_analytics')
      );

INSERT INTO "role_claims" ("id", "createdAt", "updatedAt", "roleId", "claimType", "claimValue")
SELECT gen_random_uuid(), NOW(), NOW(), r."id", 'dashboard.view_team_analytics', 'true'
FROM "roles" r
WHERE (
        r."normalizedName" = 'SUPER_ADMIN'
        OR EXISTS (
          SELECT 1
          FROM "role_claims" rc
          WHERE rc."roleId" = r."id"
            AND rc."claimType" IN ('tickets.view_all_leads', 'tickets:view_all_leads')
            AND LOWER(rc."claimValue") = 'true'
        )
      )
  AND NOT EXISTS (
        SELECT 1
        FROM "role_claims" rc
        WHERE rc."roleId" = r."id"
          AND rc."claimType" IN ('dashboard.view_team_analytics', 'dashboard:view_team_analytics')
      );
