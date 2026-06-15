---
"yoda": patch
---

修复"在旁边打开"的副面板没有 tabs：上一版为避免副面板显示主任务的全局 tabs 而直接隐藏了标题栏 tab strip，结果副面板完全没有 tab 可切换。现在副面板渲染**自己任务**的 tab strip（由该面板自身的 `tabManager` 驱动：overview / 会话 / 文件 / diff），点击切换、可关闭，overview 固定不可关。
