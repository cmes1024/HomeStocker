# family-named-theme Specification

## Purpose

Lets a household pick a named color theme so every product page shares the same primary, secondary, and shadow colors without custom photos or CSS strings.

## Requirements

### Requirement: Preset named themes
The product MUST offer a small fixed set of named themes (at least 暖黄橙 `orange`, 中国红 `red`, 天空蓝 `blue`). Each theme MUST define `primary`, `secondary`, and `shadow` colors. Invalid or missing background MUST fall back to `orange` without throwing.

#### Scenario: Pick red theme
- **WHEN** a member selects the 中国红 theme for the current family
- **THEN** the family stores `{ type: 'theme', value: 'red' }` and subsequent pages use that theme's three colors

#### Scenario: Unknown theme id falls back
- **WHEN** a family document has a missing or unknown background value
- **THEN** the client renders the default 暖黄橙 theme and does not crash

### Requirement: Shell injects theme for all pages
Product pages that wrap the shared app shell MUST receive the current family's theme as CSS variables (and equivalent page data). Members MUST NOT need to set `page-meta` on each page for the theme to apply.

#### Scenario: Ledger uses family theme
- **WHEN** a member opens the item ledger after a theme was saved
- **THEN** chrome and accent colors match that family's named theme

### Requirement: Write path is family updateBackground
Changing the theme MUST go through the family domain write API (`updateBackground`) using server-resolved current family membership. The client MUST NOT write `families.background` directly.

#### Scenario: Direct client write blocked
- **WHEN** a client attempts to update `families.background` via database SDK write
- **THEN** the security rules deny the write
