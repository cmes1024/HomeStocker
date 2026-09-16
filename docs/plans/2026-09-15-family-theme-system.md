# 家庭主题系统（命名主题）

> 日期：2026-09-15；目录于 2026-09-17 扩至 17 套  
> 状态：已落地。行为合同：`openspec/specs/family-named-theme/spec.md`。  
> 取代：渐变 CSS 字符串 / 纯色 / 自定义氛围图

## 模型

- 每主题三色：`primary` / `secondary` / `shadow`  
- 库字段：`families.background = { type: 'theme', value: '<themeId>' }`，只存 id  
- 非法或缺失 → 回落 `orange`，不抛错  
- 前端 `THEME_PRESETS` 与云函数 `family` 的 `THEME_IDS` **同一份 id**；加主题必须两端一起改并部署 `family`

### 预设目录（`miniprogram/utils/theme.js`）

| id | label | primary | secondary | shadow |
|----|--------|---------|-----------|--------|
| `orange` | 暖黄橙（默认） | `#FF5D00` | `#FFCD70` | `#FFF0DD` |
| `red` | 中国红 | `#FF0000` | `#FF7373` | `#FFDDDD` |
| `blue` | 天空蓝 | `#0080FF` | `#73D0FF` | `#DDEDFF` |
| `matcha` | 抹茶绿 | `#3FAE6A` | `#8ED9A8` | `#E3F6E9` |
| `milk` | 奶油白 | `#C89B5A` | `#F2D9A8` | `#FBF3E4` |
| `taro` | 香芋紫 | `#8A6FD1` | `#C3B2F0` | `#EFEAFB` |
| `sakura` | 樱花粉 | `#F06A9A` | `#FFB3CC` | `#FFE8F0` |
| `coral` | 珊瑚橘 | `#FF7A45` | `#FFB08A` | `#FFEDE3` |
| `mint` | 薄荷青 | `#2BB8A8` | `#82DED2` | `#E0F7F4` |
| `warm-gray` | 暖灰 | `#7A6F66` | `#B8AEA5` | `#F0ECE8` |
| `indigo` | 靛青 | `#3D5AFE` | `#8C9EFF` | `#E4E8FF` |
| `amber` | 琥珀黄 | `#D99A00` | `#F3C95C` | `#FFF6D9` |
| `forest` | 森林绿 | `#2F7D5B` | `#7BBF9A` | `#E2F3EA` |
| `berry` | 莓果红 | `#C93A5B` | `#F08AA2` | `#FCE4EA` |
| `clay` | 陶土棕 | `#B46A4C` | `#E0A88F` | `#F7E8E1` |
| `lavender` | 薰衣草 | `#6C63FF` | `#B4B0FF` | `#ECEBFF` |
| `olive` | 橄榄绿 | `#7A8B3A` | `#B7C77A` | `#F0F4DC` |

## 运行时

| 能力 | 位置 |
|------|------|
| 预设与解析 | `miniprogram/utils/theme.js` |
| 全局取色 | `getApp().getThemeColors()` / `getThemeColors()` |
| CSS 变量注入 | `AppShell` 根节点 `--theme-primary` 等 |
| 线性渐变层 | `components/ThemeRadialBg`（`linear-gradient(167deg, primary 2%, secondary 59%, shadow 74%)`） |
| 主题上抛（无 UI） | `components/ThemeProvider` `bind:theme` |
| 工具类 | `styles/theme.wxss`：`.theme-text` / `.theme-btn` / `.theme-border` / `.theme-shadow` |

不要求每页写 `page-meta`；业务页继续包 `AppShell` 即可吃到变量与渐变。

家庭页「家庭氛围」：`THEME_PRESETS` 做选择器；一行最多 3 个；弹层 `scroll-view` 吃满标题以下剩余高度（相对 `page-container` 的 56vh，不要给滚动区写更大的 vh）。

## 写路径

`family.updateBackground({ type: 'theme', value: themeId })`（亦接受 `themeId` 字段）。  
`themeId` 必须在 `THEME_IDS` 内，否则 `INVALID_BACKGROUND`。
