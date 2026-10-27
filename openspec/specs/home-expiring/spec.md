# home-expiring Specification

## Purpose

Surfaces soon-to-expire and already-expired items on the family ledger home so members notice shelf-life risk without opening a separate calendar.

## Requirements

### Requirement: Expiring module on ledger home
The family ledger page (primary home after onboarding) MUST show an 「即将过期」 module near the top when the current family has at least one item with an expire date that is expired or within the expiring window. The window MUST start today and end at today plus the family's configured reminder lead time (`expire_reminder_days`, default 3), so the home module and outbound reminders reference the same lead time. The module MUST list or summarize those items and MUST provide a way to open an item's detail.

#### Scenario: Show module when expiring items exist
- **WHEN** the current family has one or more items classified as expiring or expired
- **THEN** the ledger shows the upcoming-expiry module including those items (or a clear summary with navigation into them)

#### Scenario: Hide module when none
- **WHEN** the current family has no items with expire dates in the expired or expiring window
- **THEN** the ledger MUST NOT show an empty upcoming-expiry module as if there were alerts (it may omit the module entirely)

### Requirement: Module includes items regardless of reminder switch
The upcoming-expiry module MUST include qualifying items whether or not the current member has subscribed to expiry reminders for those items, and whether or not the family reminder master switch is on. Reminder subscriptions and the family master switch MUST only affect outbound subscribe messages, not home visibility.

#### Scenario: Expiring item with reminder off still listed
- **WHEN** an item is expiring and the current member has not subscribed to its reminder
- **THEN** the upcoming-expiry module still includes that item

### Requirement: Respect current family scope
The module MUST only show items belonging to the member's current family. Switching family MUST refresh the module for the newly selected family.

#### Scenario: Switch family refreshes module
- **WHEN** a member switches to another family that has different expiring items
- **THEN** the ledger upcoming-expiry module reflects only that family's items
