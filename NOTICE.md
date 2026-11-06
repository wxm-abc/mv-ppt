# NOTICE

本仓库包含以下第三方组件。它们各自的许可与署名在此保留，不受本仓库 MIT 许可覆盖。

## vendor/lyricmv

`assets/skeleton/vendor/lyricmv/` —— 后处理镜头（泛光 / 色散 / 扫描线 / 颗粒）、转场 GLSL、
调色板工具，共四个文件。

- 许可：MIT
- 版权：Copyright (c) 2026 Nyankomint
- 原始许可文本：`assets/skeleton/vendor/lyricmv/LICENSE-lyric-mv.txt`

## 随包字体（vendor/fonts）

`assets/skeleton/vendor/fonts/*.woff2` 来自 [@fontsource](https://fontsource.org/)，
全部为 **SIL Open Font License 1.1**，允许随软件一起再分发。

| 字族 | 角色 | 上游 |
|---|---|---|
| Inter | sans —— 界面与正文 | https://github.com/rsms/inter |
| JetBrains Mono | mono —— 标签、数字、代码 | https://github.com/JetBrains/JetBrainsMono |
| Source Serif 4 | serif —— "说话的那把声音" | https://github.com/adobe-fonts/source-serif |

OFL 1.1 全文：https://scripts.sil.org/OFL
字体仅含拉丁字形；中文走 `config.json → fonts.cjk` 的系统字体回退。

## assets/ppt-themes

`assets/ppt-themes/*.html` 是五份用于**反推主题色值**的版面样张，仅作取样来源，
不参与构建，也不含第三方素材。

## 未包含的内容

本仓库不包含任何歌曲、音频、视频或影片截图。`data/lyrics.json` 与 `data/features.json`
在骨架中是占位示例结构，使用者需替换为自己持有权利的素材。
