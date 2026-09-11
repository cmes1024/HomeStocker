# expire-subscribe-reminders Specification

## Purpose

Sends WeChat subscribe-message reminders for items nearing expiry when both the family and the item have reminders enabled and the member has granted subscription.

## Requirements

### Requirement: Two-level reminder switches
Each item MUST have `expireReminderEnabled` defaulting to false. Each family MUST have a reminder master switch defaulting to true. The system MUST only consider an item for outbound expiry notifications when the item has an expire date, the item switch is on, and the family master switch is on.

#### Scenario: Item reminder off blocks notify
- **WHEN** an item has an expire date and the family master switch is on but the item reminder switch is off
- **THEN** the system MUST NOT include that item in expiry notification candidates

#### Scenario: Family master off blocks notify
- **WHEN** an item has reminder on and expire date in a notify window but the family master switch is off
- **THEN** the system MUST NOT send expiry notifications for items in that family

### Requirement: Toggle switches in product UI
Members MUST be able to toggle the per-item reminder switch on create/edit (and see it on detail). Members MUST be able to toggle the family master reminder switch from the family settings surface.

#### Scenario: Enable item reminder
- **WHEN** a member turns on expire reminder for an item that has an expire date
- **THEN** the system persists the item switch as enabled

### Requirement: Subscribe authorization before relying on push
Before the product treats a member as able to receive expiry subscribe messages, the client MUST request WeChat subscribe-message authorization for the configured expiry template. Declining authorization MUST NOT block saving the item or toggling reminder switches; it only means push may not be delivered until authorized.

#### Scenario: Save reminder without accepting subscribe prompt
- **WHEN** a member enables item reminder but declines the subscribe-message prompt
- **THEN** the system still saves the reminder switch and does not fail the item write

### Requirement: Timed reminders at 3 days, 1 day, and day-of
A scheduled server job MUST evaluate candidate items once per day and send subscribe messages to eligible members for items whose expire date is exactly 3 days ahead, 1 day ahead, or today (relative to a documented timezone rule for the job). The job MUST skip items or families that fail the two-level switch rules or lack an expire date.

#### Scenario: Notify three days before expiry
- **WHEN** the daily job runs and an eligible item expires in exactly 3 days
- **THEN** the system attempts to send the expiry subscribe message for that item to eligible members of the family

#### Scenario: No duplicate class of notify outside windows
- **WHEN** an eligible item expires in 5 days
- **THEN** the daily job MUST NOT send an expiry subscribe message for the 3-day / 1-day / day-of windows for that item on that run
