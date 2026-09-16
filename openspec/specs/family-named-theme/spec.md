# family-named-theme Specification

## Purpose

Lets a household pick a named color theme so every product page shares the same primary, secondary, and shadow colors without custom photos or CSS strings.

## Requirements

### Requirement: Preset named themes
The product MUST offer a fixed catalog of named themes. Each theme MUST have an `id`, a Chinese `label`, and `primary` / `secondary` / `shadow` colors. The client catalog and the family write-path allow-list MUST use the same ids. Invalid or missing background MUST fall back to 暖黄橙 `orange` without throwing.

The catalog MUST include at least:

| id | label |
|----|--------|
| `orange` | 暖黄橙（default） |
| `red` | 中国红 |
| `blue` | 天空蓝 |
| `matcha` | 抹茶绿 |
| `milk` | 奶油白 |
| `taro` | 香芋紫 |
| `sakura` | 樱花粉 |
| `coral` | 珊瑚橘 |
| `mint` | 薄荷青 |
| `warm-gray` | 暖灰 |
| `indigo` | 靛青 |
| `amber` | 琥珀黄 |
| `forest` | 森林绿 |
| `berry` | 莓果红 |
| `clay` | 陶土棕 |
| `lavender` | 薰衣草 |
| `olive` | 橄榄绿 |

#### Scenario: Pick red theme
- **WHEN** a member selects the 中国红 theme for the current family
- **THEN** the family stores `{ type: 'theme', value: 'red' }` and subsequent pages use that theme's three colors

#### Scenario: Pick a later catalog theme
- **WHEN** a member selects 抹茶绿 for the current family
- **THEN** the family stores `{ type: 'theme', value: 'matcha' }` and subsequent pages use that theme's three colors

#### Scenario: Unknown theme id falls back
- **WHEN** a family document has a missing or unknown background value
- **THEN** the client renders the default 暖黄橙 theme and does not crash

#### Scenario: Unknown id rejected on write
- **WHEN** a client calls `updateBackground` with a `themeId` that is not in the allow-list
- **THEN** the write fails and the stored background is unchanged

### Requirement: Theme picker on the family page
The family atmosphere sheet MUST list every catalog theme, at most three chips per row. When the chips do not fit the sheet, the list MUST scroll inside the sheet; clipping without scroll is not acceptable.

#### Scenario: Long catalog scrolls
- **WHEN** a member opens 家庭氛围 and the catalog is taller than the sheet
- **THEN** the member can scroll to the last theme and select it

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
