# Audixify Security Rules Specification

## Data Invariants
1. **Default Deny**: All unmatched Firestore paths deny reads and writes.
2. **Owner & Verified Identity**: Only verified Google-authenticated users (`request.auth != null && request.auth.token.email_verified == true`) can write user profiles, library backups, or support tickets.
3. **Developer Authority Isolation**: Only `sekay77771@gmail.com` with `email_verified == true` satisfies `isAdmin()`. Regular users can never set `isDeveloper: true` on `users/{userId}` or `senderRole: 'developer'` on `supportThreads/{threadId}/messages/{messageId}`.
4. **Master Gate & Immutability**: Subcollection `/supportThreads/{threadId}/messages/{messageId}` verifies the parent `supportThreads/{threadId}` document exists (`get()`) and grants access strictly when parent `ownerUid == request.auth.uid` or `isAdmin()`. `createdAt` and `ownerUid`/`uid` are immutable after creation, and timestamps must equal `request.time`.
5. **Bounded Sizes & Strict Keys**: Every write validates `keys().hasAll(...)` and `keys().hasOnly(...)` on create, `affectedKeys().hasOnly(...)` on update, string `.size()` ceilings (including compressed avatar/evidence images), and bounded list `.size()` limits.
6. **Terminal State Protection**: Once a `supportThread` is marked `status: 'resolved'`, non-admin users cannot overwrite it until reopened by the developer.

## Dirty Dozen Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated read on `/users/{uid}`**: `request.auth == null` -> DENIED.
2. **Cross-user read on `/users/{otherUid}`**: authenticated non-admin reading another user's profile -> DENIED.
3. **Developer Badge Spoof**: regular user creating `/users/{uid}` with `isDeveloper: true` -> DENIED.
4. **Shadow Update Ghost Field**: user updating `/users/{uid}` with `{ displayName: "x", role: "admin" }` -> DENIED (`hasOnly`).
5. **Email Spoof (Unverified)**: token `email == 'sekay77771@gmail.com'` with `email_verified == false` calling `list` on `/users` -> DENIED.
6. **Username Regex Injection**: `/users/{uid}` with `username: "Admin User!!<script>"` -> DENIED.
7. **Timestamp Forgery**: creating `/users/{uid}` with client-supplied past `createdAt` (`!= request.time`) -> DENIED.
8. **Support Thread Hijack**: user creating `/supportThreads/{threadId}` with `threadId != request.auth.uid` or `ownerUid != request.auth.uid` -> DENIED.
9. **Developer Role Impersonation in Chat**: regular user creating message with `senderRole: 'developer'` -> DENIED.
10. **Cross-User Support List Scraping**: regular user running collection query on `/supportThreads` without `ownerUid == request.auth.uid` -> DENIED (`allow list` enforces `resource.data.ownerUid == request.auth.uid`).
11. **Oversized Payload / Denial of Wallet**: uploading `imageDataUrl` larger than `420000` bytes or `text` > `1500` chars -> DENIED.
12. **Mutating Resolved Ticket**: regular user updating `supportThreads/{uid}` when `existing().status == 'resolved'` -> DENIED.
