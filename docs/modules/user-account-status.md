# User account status — activate / deactivate

Status: **Built — awaiting Haseeb's review** · Author: Claude · 9 Nov 2026
Branch: `feature/user-account-status` from `master`.

## 1. Goal
Admins can deactivate a user (e.g. someone who has left, or an agent account that should be paused) without
deleting their record or history, and reactivate them later. A deactivated user cannot log in and cannot use
forgot-password to get back in. Nothing about how active users work today changes.

## 2. Current state (verified 9 Nov 2026, via code research)
- `User` already has `isActive` (inherited from `BaseEntity`, default `true`), but it is **not** a general
  enable/disable switch today — it is driven entirely by the invite lifecycle: `false` while an invite is pending,
  `true` once the invite is accepted (`activateInvitedUser`). There is no endpoint that flips it after that.
- `AuthService.validateUser` **already** blocks login when `isActive` is `false` (`UnauthorizedException('Account inactive')`).
  So the login half of this feature already works for free once we have a real way to set `isActive = false` on an
  active account.
- `JwtStrategy.validate` does **not** re-check `isActive` on every request — it only loads the user by id. A user
  deactivated mid-session keeps working on their existing token until it expires or they log in again.
- `AuthService.forgotPassword` / `resetPassword` do **not** check `isActive` at all — a deactivated user can today
  request and complete a password reset.
- `UsersService.softDeleteUser` (the existing "Delete" button) does not touch `isActive`; every other module in the
  app sets `isActive = false` together with soft delete. Not a login hole (TypeORM excludes soft-deleted rows from
  normal lookups), just an inconsistency in the stored data.
- `UsersController` has no permission checks at all today (`@UseGuards(RolesGuard)` with no `@Roles()` ever applied
  = no-op). `users.view_list` / `users.create` / `users.edit` / `users.delete` claims exist
  (`libs/shared/utils/src/lib/utils.ts`) and are checked on the frontend only.
- No migrations folder exists on `master` yet (R1, which adds migration infra, is still awaiting review on
  `feature/crm-r1`) — schema is still `synchronize: true`, and the permission catalog
  (`libs/shared/utils/src/lib/utils.ts`) is just a static array with no seeded/granted rows in the DB to update.

## 3. Scope
In: UA-FR-01 … UA-FR-07 below — a status toggle on an already-accepted user, server-side enforcement on login,
session, and forgot-password, and permission checks on the users endpoints.
Out: bulk activate/deactivate, an audit/history trail beyond `deactivatedAt`/`deactivatedBy`, a dedicated
Active/Inactive filter in the Users list UI, anything about reassigning a deactivated user's leads.

## 4. Decisions (Haseeb, 9 Nov 2026)
1. **Permission claims** — add real new claims `users.activate` / `users.deactivate` rather than reusing
   `users.edit`. Turns out no migration/seeding is actually needed either way: `PermissionsGuard` already bypasses
   all permission checks for `SUPER_ADMIN` (`apps/epc-crm/src/common/guards/permissions.guard.ts:36`), and claims
   are granted to other roles entirely through the existing Roles screen (`role_claims` rows are written by
   `RolesService.create`/`update` when an admin picks permissions from the catalog) — the catalog
   (`MODULE_DEFINITIONS` in `libs/shared/utils/src/lib/utils.ts`) is just a static list consumed by
   `GET /roles/permissions/catalog`. So adding the two actions to that array is enough; no DB write required. Built.
2. **Forgot-password response** — explicit message for a deactivated account: *"Your account has been deactivated.
   Please contact your administrator."* (not the generic "email not found" response). Built.
3. **Mid-session revocation** — built: `JwtStrategy.validate` now rejects a token whose user has gone inactive.
4. **`softDeleteUser` also sets `isActive = false`** — built, matching every other module's soft-delete convention.

Fixing `UsersController`'s missing server-side permission checks was bundled in as well (see §6).

## 5. Requirements

### UA-FR-01 Data model — Built
- Added to `User` entity (`apps/epc-crm/src/app/modules/users/entities/user.entity.ts`): `deactivatedAt: Date | null`,
  `deactivatedBy: string | null` (user id, audit-style like `createdBy`/`updatedBy`). Picked up via
  `synchronize: true` like every other column today — no migration, per current state above.
- `isActive` stays the single source of truth for "can this account be used" (what `validateUser` already reads);
  `deactivatedAt`/`deactivatedBy` are just the audit trail for *why* it's `false`.

### UA-FR-02 Deactivate / reactivate endpoint — Built
- `PUT /users/:id/status` — body `{ isActive: boolean }`. Only on users whose invite is already accepted
  (`isInvitationAccepted = true`); pending invites are managed through the existing invite flow, not this one —
  400 `"Invite is not accepted yet."` otherwise.
- Deactivating: sets `isActive = false`, `deactivatedAt = now()`, `deactivatedBy = requesting user id`.
- Reactivating: sets `isActive = true`, `deactivatedAt = null`, `deactivatedBy = null`.
- A user cannot change their own status in either direction (mirrors the existing self-delete guard) — 409
  `"You cannot deactivate your own account."` / `"You cannot change your own account status."`.
- Authorization is checked in `UsersService.updateStatus` rather than via a static `@Authorize` decorator, because
  the required permission depends on the request body's direction: deactivating requires `users.deactivate`,
  reactivating requires `users.activate` (either check is skipped for `SUPER_ADMIN`, same bypass as
  `PermissionsGuard`). `ForbiddenException` otherwise.
- Returns the updated user summary (`id`, `isActive`, `deactivatedAt`, …) via the existing `findById`.

### UA-FR-03 Login already enforces this — no code change
- `AuthService.validateUser` already rejects a deactivated account with `UnauthorizedException('Account inactive')`.
  Verified by reading the code; no Jest infra exists on `master` yet to add a regression test for it (see §8).

### UA-FR-04 Forgot password / reset password respect deactivation — Built
- `forgotPassword(email)`: if the account exists but `isActive === false`, returns
  `"Your account has been deactivated. Please contact your administrator."` instead of the generic message, and
  does not send the reset email.
- `resetPassword(token, newPassword)`: re-checks `isActive` once the reset token is found (handles the case where
  the account was deactivated after the reset email was already sent) — rejects with the same explicit message.

### UA-FR-05 Mid-session revocation — Built
- `JwtStrategy.validate` now throws `UnauthorizedException('Account inactive')` when the loaded user's `isActive`
  is `false`, logging the user out on their very next API call after being deactivated.

### UA-FR-06 Users list / card UI — Built
- `UserCard` (`apps/frontend/src/components/users/UserCard.tsx`): added an Active/Inactive badge next to the
  existing "Invite Accepted" badge, and — only when `isInvitationAccepted` and the viewer holds the matching
  `users.activate`/`users.deactivate` permission — a status-toggle icon button next to Edit/Delete.
- Deactivating asks for confirmation first (`DeactivateUserModal.tsx`, same shape as `DeleteUserModal`). Reactivating
  applies immediately, no confirmation.
- New BFF route `apps/frontend/src/app/api/users/[userId]/status/route.ts`, same pass-through pattern as the
  existing `[userId]/route.ts`.
- Backend already computed `summary.activeUsers` from `u.isActive = true`
  (`apps/epc-crm/src/app/modules/projects/projects.service.ts:815`) and the members list already returned
  `isActive` per user — the "Active Users" header stat and the `ApiProjectMember.isActive` field needed no change,
  just wiring the latter into `UserCardUser`.

### UA-FR-07 `softDeleteUser` consistency — Built
- `softDeleteUser` also sets `isActive = false` alongside the existing soft delete, matching every other module's
  convention.

## 6. Permissions
Added `activate`/`deactivate` to the `users` module's actions in `MODULE_DEFINITIONS`
(`libs/shared/utils/src/lib/utils.ts`) → new claims `users.activate` / `users.deactivate`, grantable to any role
from the existing Roles screen like any other permission (no migration/seed needed — see decision 1 above).
`UsersController` also got `@Authorize({ permissions: ['users.edit'] })` on `updateUser` and
`@Authorize({ permissions: ['users.delete'] })` on `softDeleteUser`, since neither had any server-side permission
check before this change (bundled in rather than a separate change, since the new endpoint needed the same guard
wiring anyway).

## 7. Changes to production data
- Schema: `synchronize: true` adds the two new nullable columns on `users` on next deploy, same mechanism every
  other column on this table was added by. No backfill needed — existing rows get `NULL` for both new columns,
  which is correct ("never deactivated"). No migration.
- Claims: `apps/infrastructure/local/user-status-claims.sql` (same hand-run-on-production convention as
  `dashboard-analytics-claims.sql` / `lead-visibility-claims.sql`) inserts the `users.activate`/`users.deactivate`
  `role_claims` rows for `SUPER_ADMIN`. Idempotent — safe to re-run. Granting either claim to any other role is a
  separate, deliberate step from the Roles screen (or the commented-out block in that file), not part of this
  script.

## 8. Tests (Jest, named after the requirement id) — not written
No Jest config exists on `master` yet (same gap R1 calls out — spec files would exist but nothing would run them),
so no test files were added for this change. If/when R1's Jest setup lands, these are the cases to add:
- `UA-FR-02`: deactivate sets fields correctly; reactivate clears them; blocked on pending invite; blocked on
  self-target; permission-gated per direction.
- `UA-FR-03`: login rejects a deactivated user (regression).
- `UA-FR-04`: forgot-password on a deactivated account returns the explicit message and sends no email;
  reset-password rejects a valid token for an account deactivated after the email was sent.
- `UA-FR-05`: an existing valid JWT is rejected after the user is deactivated.
- `UA-FR-07`: soft-deleting a user sets `isActive = false`.

## 9. Acceptance
- `nx lint` and `nx build` pass for both apps (verified — the only lint errors present are pre-existing on `master`,
  in files this change didn't touch: `calendar.controller.ts` and `useThread.ts`).
- Swagger shows `PUT /users/:id/status`.
- **Not verified**: no live browser run against a logged-in session (no test credentials available in this session,
  and project rules say not to read `Credentials and DB/` or any `.env*`). Haseeb should click through the golden
  path before merging: deactivate a test user from the Users page → their login attempt and their forgot-password
  request both fail with the new message → reactivate → both work again → confirm a non-super-admin role without
  the new claims can't see/use the toggle, and one with only `users.activate` can reactivate but not deactivate.
