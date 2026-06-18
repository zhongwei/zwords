# Typing Practice: Default Show Word

## Summary

在打字练习页面中，默认在输入区上方显示当前单词文本，用户照着打字。提供切换按钮让用户可以隐藏单词回到纯记忆模式，切换状态全局生效。

## Current Behavior

- `TypingCard` 显示 POS 和中文释义作为提示，不显示单词本身
- 用户需要根据提示回忆单词拼写

## New Behavior

### Layout

```
[Eye/EyeOff toggle]       ← 右上角切换按钮
[pos] [meaning_cn]        ← hint 区域（不变）
[word text]               ← 新增：单词展示行（默认可见）
[audio UK] [audio US]     ← 音频按钮（不变）
[ _ _ _ _ _ ]             ← 输入格（不变）
```

### Component Changes

1. **`TypingPractice`**：新增 `showWord` state（默认 `true`），作为 prop 传给 `TypingCard`
2. **`TypingCard`**：
   - 接收 `showWord` 和 `onToggleShowWord` props
   - 在 hint 区域下方、音频按钮上方渲染 `word.word` 文本
   - 右上角增加眼睛图标按钮（lucide `Eye` / `EyeOff`），点击调用 `onToggleShowWord`
   - 单词行用 framer-motion `AnimatePresence` 包裹，隐藏时淡出
3. **`TypingInput`**：无变更

### Styling

- `.tp-card-word`：单词展示行，较大字号，居中，与输入格视觉层级匹配
- `.tp-card-toggle`：切换按钮，绝对定位卡片右上角，透明背景，hover 时显眼
- 隐藏时条件渲染（AnimatePresence + exit animation）

### State Management

- `showWord` 在 `TypingPractice` 页面管理，默认 `true`
- 切换后对所有后续单词生效
- 结果页重试（restart all / retry errors）时保持当前 `showWord` 状态

### i18n

- 切换按钮的 `title` 属性使用 i18n key：
  - `typing.showWord` / `typing.hideWord`
