# Firestore Security Specification

This document defines the security boundaries, invariant rules, and data schemas for the LogiFleet Firebase implementation, focusing on real-time synchronized global settings.

## Data Invariants

1. **Global Schema**: Only one global settings document exists at the path `/settings/global`.
2. **Access Control**: Any authenticated user (including anonymous sessions for instant collaboration) can read and update the settings.
3. **Type Safety**: Field types must align strictly with their definitions (e.g., `refreshInterval` must be a positive integer, `companyName` must be a string).

## The "Dirty Dozen" Payloads to Block

The following payloads represent malicious or corrupted input attempts that the security rules must reject:

1. **Identity Spoofing**: Attempt to write settings under a random user-specific path unauthorized.
2. **Path Injection**: Attempting path-spanning queries or document creations with malicious strings.
3. **Corrupted Type**: Setting `refreshInterval` to a string value.
4. **Invalid Sizing**: Supplying a `companyName` longer than 256 characters.
5. **Boilerplate Bypass**: Bypassing field presence constraints on creation.
6. **Zero Value**: Setting `refreshInterval` to a negative number.
7. **Ghost fields**: Injecting unexpected top-level fields not specified in the blueprint.
8. **Malicious Protocol URLs**: Injecting malicious javascript protocols into `logoUrl`.
9. **Null Value Invariant**: Supplying null values for essential keys like `companyName`.
10. **Admin Traversal**: Trying to write settings with admin escalation fields.
11. **Massive Array Injection**: Supplying overly large lists in `requiredDocuments`.
12. **Temporal Distortion**: Setting future updates with spoofed client clocks.
