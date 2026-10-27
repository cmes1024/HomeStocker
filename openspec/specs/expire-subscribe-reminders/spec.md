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
Members MUST be able to toggle **their own** per-item reminder switch on create/edit (and see it on detail). Turning the switch on or off MUST NOT change other members’ subscription records for that item. Members MUST be able to open a family reminder settings panel from the family settings surface and, in a single save, change the family master switch, the reminder lead time, and the send time.

When the family master switch is off but a member still has a subscription record for an item, the item detail surface MUST distinguish that state (subscribed, muted by the family switch) instead of showing plain "subscribed", so members are not misled into expecting a push.

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

### Requirement: Family-configurable lead time and send time
Each family MUST be able to configure, from the family settings surface, a single reminder lead time (whole days before the expire date, one of 0 / 1 / 3 / 7 / 14) and a daily send time (hour and minute, Asia/Shanghai). Defaults MUST be 3 days ahead and 08:00, which keeps pre-configuration behavior for existing families. These settings are family-wide and MUST NOT alter per-member item subscriptions.

The scheduled job MUST run at least once per minute, and for each enabled family whose configured send time has been reached that day it MUST send at most one round of reminders per family per run date. The job MUST skip families whose master switch is off, items whose expire date is not exactly the configured lead time ahead of the run date, and members who have no subscription for that item or no WeChat grant.

Because WeChat once-type subscribe templates yield a single message per accept, multi-day lead time MUST NOT be offered as an option: a family picks one lead time, and each subscribed member receives at most one reminder for that item.

#### Scenario: Family chooses day-of and 09:07
- **WHEN** a family enables reminders with lead time 0 days and send time 09:07
- **THEN** on a day when an item expires that same day, the job attempts the reminder at 09:07 Asia/Shanghai, or within the documented grace window if that minute was missed

#### Scenario: Notify on the configured lead time
- **WHEN** the job reaches the configured send time and an item's expire date is exactly the family's configured lead time ahead of the run date
- **THEN** the system attempts to send the expiry subscribe message for that item only to members who subscribed to it (and have granted authorization)

#### Scenario: No notify outside the configured lead time
- **WHEN** an item's expire date is not exactly the family's configured lead time ahead of the run date
- **THEN** the job MUST NOT send an expiry subscribe message for that item on that run

#### Scenario: One round per family per day
- **WHEN** the job runs multiple times inside the configured send window (restart or multiple instances)
- **THEN** the family MUST NOT receive more than one round of reminders for the same run date

### Requirement: Successful send consumes the item subscription
WeChat once-type subscribe templates yield a single outbound message per accept. After the system **successfully** sends an expiry subscribe message to a member for an item, it MUST delete that member’s subscription record for that item. Failed sends MUST leave the record in place. The member’s detail/edit views MUST then show unsubscribed until they subscribe again.

#### Scenario: Detail shows unsubscribed after a delivered reminder
- **WHEN** the scheduled job successfully sends an expiry message to a member for an item
- **THEN** that member’s reminder status for the item MUST become unsubscribed

#### Scenario: Failed send keeps subscription
- **WHEN** the scheduled job attempts to send an expiry message and the send fails
- **THEN** the member’s subscription record for that item MUST remain
