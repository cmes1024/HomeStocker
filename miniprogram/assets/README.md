# 空间默认氛围（coverKey）

空间详情背景优先级：

1. `coverKey` 在 `utils/spaceAtmosphere.js` 的 `SPACE_COVER_IMAGES` 中有真实图片路径  
2. 当前家庭氛围（照片 / 渐变 / 纯色）  
3. 默认青雾渐变兜底  

| coverKey | 说明 |
|----------|------|
| `default-indoor` | 云函数默认写入的 key；**目前未挂图片资源**，会落到家庭氛围 |

后续若提供静态图：把文件放到例如 `miniprogram/assets/space-default-indoor.jpg`，并在 `SPACE_COVER_IMAGES` 登记：

```js
'default-indoor': '/assets/space-default-indoor.jpg'
```
