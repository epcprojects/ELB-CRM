-- Adds the lead visibility claims introduced with
--   tickets.view_all_leads           ("View All Leads")
--   tickets.view_only_assigned_to_me ("View Only Assigned To Me")
--
-- Without view_all_leads a role only sees leads assigned to the user (if it
-- has view_only_assigned_to_me) or none at all. To keep today's behaviour,
-- every role that can already list leads, and SUPER_ADMIN, gets
-- view_all_leads. Roles can be tightened afterwards from the Roles page.
-- Safe to re-run: roles that already chose "View Only Assigned To Me" are left
-- alone, so re-running never undoes a deliberate restriction.

INSERT INTO "role_claims" ("id", "createdAt", "updatedAt", "roleId", "claimType", "claimValue")
SELECT gen_random_uuid(), NOW(), NOW(), r."id", 'tickets.view_all_leads', 'true'
FROM "roles" r
WHERE (
        r."normalizedName" = 'SUPER_ADMIN'
        OR (
          EXISTS (
            SELECT 1
            FROM "role_claims" rc
            WHERE rc."roleId" = r."id"
              AND rc."claimType" IN ('tickets.view_list', 'tickets:view_list')
              AND LOWER(rc."claimValue") = 'true'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM "role_claims" rc
            WHERE rc."roleId" = r."id"
              AND rc."claimType" IN ('tickets.view_only_assigned_to_me', 'tickets:view_only_assigned_to_me')
              AND LOWER(rc."claimValue") = 'true'
          )
        )
      )
  AND NOT EXISTS (
        SELECT 1
        FROM "role_claims" rc
        WHERE rc."roleId" = r."id"
          AND rc."claimType" IN ('tickets.view_all_leads', 'tickets:view_all_leads')
      );

-- SUPER_ADMIN can also hold the "assigned to me" claim (all permissions).
INSERT INTO "role_claims" ("id", "createdAt", "updatedAt", "roleId", "claimType", "claimValue")
SELECT gen_random_uuid(), NOW(), NOW(), r."id", 'tickets.view_only_assigned_to_me', 'true'
FROM "roles" r
WHERE r."normalizedName" = 'SUPER_ADMIN'
  AND NOT EXISTS (
        SELECT 1
        FROM "role_claims" rc
        WHERE rc."roleId" = r."id"
          AND rc."claimType" IN ('tickets.view_only_assigned_to_me', 'tickets:view_only_assigned_to_me')
      );

-- ticket_replies.post_any_lead ("Reply On Any Lead")
-- Replying / sending lead chat messages needs the post claim AND a link to the
-- lead (assignee, creator, or mentioned) unless the role holds this claim.
-- To keep today's behaviour, SUPER_ADMIN and every role that can already view
-- all leads and post replies keeps working everywhere. Roles with only
-- "View Only Assigned To Me" (e.g. Agents) do not get it.
INSERT INTO "role_claims" ("id", "createdAt", "updatedAt", "roleId", "claimType", "claimValue")
SELECT gen_random_uuid(), NOW(), NOW(), r."id", 'ticket_replies.post_any_lead', 'true'
FROM "roles" r
WHERE (
        r."normalizedName" = 'SUPER_ADMIN'
        OR (
          EXISTS (
            SELECT 1 FROM "role_claims" rc
            WHERE rc."roleId" = r."id"
              AND rc."claimType" IN ('tickets.view_all_leads', 'tickets:view_all_leads')
              AND LOWER(rc."claimValue") = 'true'
          )
          AND EXISTS (
            SELECT 1 FROM "role_claims" rc
            WHERE rc."roleId" = r."id"
              AND rc."claimType" IN ('ticket_replies.post', 'ticket_replies:post')
              AND LOWER(rc."claimValue") = 'true'
          )
        )
      )
  AND NOT EXISTS (
        SELECT 1 FROM "role_claims" rc
        WHERE rc."roleId" = r."id"
          AND rc."claimType" IN ('ticket_replies.post_any_lead', 'ticket_replies:post_any_lead')
      );
