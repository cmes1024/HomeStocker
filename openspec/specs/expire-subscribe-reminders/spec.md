# expire-subscribe-reminders Specification

## Purpose

Sends WeChat subscribe-message reminders for items nearing expiry. Subscription is per member per item: one member’s “已订阅” does not subscribe the rest of the family. A family master switch can still mute outbound push for everyone.

## Requirements

### Requirement: Per-member item subscription
Each member’s reminder status for an item MUST be stored independently (not as a shared field on the item). Reads of `expireReminderEnabled` for an item MUST reflect whether the **current member** has a subscription record for that item. Default MUST be unsubscribed. The family MUST have a reminder master switch defaulting to true.

The system MUST only send an expiry notification for an item to a member when: the item has an expire date, that member has subscribed to that item, the family master switch is on, and the member has granted WeChat subscribe-message authorization.

#### Scenario: Same item different members
- **WHEN** member A has subscribed to an item and member B of the same family has not
- **THEN** A’s edit/detail views MUST show the reminder as subscribed and B’s views MUST show it as not subscribed

#### Scenario: Unsubscribed member is not notified
- **WHEN** an item has an expire date in a notify window, the family master switch is on, and member A has not subscribed to that item
- **THEN** the system MUST NOT send that item’s expiry notification to member A

#### Scenario: Family master off blocks notify
- **WHEN** a member has subscribed to an item whose expire date is in a notify window but the family master switch is off
- **THEN** the system MUST NOT send expiry notifications for items in that family

### Requirement: Toggle switches in product UI
Members MUST be able to toggle **their own** per-item reminder switch on create/edit (and see it on detail). Turning the switch on or off MUST NOT change other members’ subscription records for that item. Members MUST be able to toggle the family master reminder switch from the family settings surface.

#### Scenario: Enable item reminder
- **WHEN** a member turns on expire reminder for an item that has an expire date and saves
- **THEN** the system persists a subscription record for that member and item only

#### Scenario: Second member can still subscribe
- **WHEN** an item already has at least one subscriber and another member of the family opens edit
- **THEN** that member MUST see the reminder as off (unless they themselves subscribed) and MUST be able to turn it on, which requests WeChat subscribe-message authorization

### Requirement: Subscribe authorization before relying on push
Before the product treats a member as able to receive expiry subscribe messages, the client MUST request WeChat subscribe-message authorization for the configured expiry template. Declining authorization MUST NOT block saving the item or toggling reminder switches; it only means push may not be delivered until authorized.

#### Scenario: Save reminder without accepting subscribe prompt
- **WHEN** a member enables item reminder but declines the subscribe-message prompt
- **THEN** the system still saves that member’s subscription record and does not fail the item write

### Requirement: Timed reminders at 3 days, 1 day, and day-of
A scheduled server job MUST evaluate candidate items once per day and send subscribe messages to members who subscribed to each item whose expire date is exactly 3 days ahead, 1 day ahead, or today (relative to a documented timezone rule for the job). The job MUST skip families whose master switch is off, items that lack an expire date, and members who have no subscription for that item or no WeChat grant.

#### Scenario: Notify three days before expiry
- **WHEN** the daily job runs and an item expires in exactly 3 days
- **THEN** the system attempts to send the expiry subscribe message for that item only to members who subscribed to it (and have granted authorization)

#### Scenario: No duplicate class of notify outside windows
- **WHEN** an eligible item expires in 5 days
- **THEN** the daily job MUST NOT send an expiry subscribe message for the 3-day / 1-day / day-of windows for that item on that run

### Requirement: Successful send consumes the item subscription
WeChat once-type subscribe templates yield a single outbound message per accept. After the system **successfully** sends an expiry subscribe message to a member for an item, it MUST delete that member’s subscription record for that item. Failed sends MUST leave the record in place. The member’s detail/edit views MUST then show unsubscribed until they subscribe again.

#### Scenario: Detail shows unsubscribed after a delivered reminder
- **WHEN** the daily job successfully sends an expiry message to a member for an item
- **THEN** that member’s reminder status for the item MUST become unsubscribed

#### Scenario: Failed send keeps subscription
- **WHEN** the daily job attempts to send an expiry message and the send fails
- **THEN** the member’s subscription record for that item MUST remain
