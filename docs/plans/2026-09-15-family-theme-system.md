# 家庭主题系统（命名主题）

> 日期：2026-09-15  
> 状态：已落地。行为合同：`openspec/specs/family-named-theme/spec.md`。  
> 取代：渐变 CSS 字符串 / 纯色 / 自定义氛围图

## 模型

- 预设：`orange` 暖黄橙、`red` 中国红、`blue` 天空蓝  
- 每主题三色：`primary` / `secondary` / `shadow`  
- 库字段：`families.background = { type: 'theme', value: '<themeId>' }`  
- 非法或缺失 → 回落 `orange`，不抛错

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

## 写路径

`family.updateBackground({ type: 'theme', value: themeId })`（亦接受 `themeId` 字段）。
