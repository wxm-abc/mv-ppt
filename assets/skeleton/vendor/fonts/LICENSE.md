# 随包字体许可

本目录下所有 `.woff2` 来自 [@fontsource](https://fontsource.org/)，均为
**SIL Open Font License 1.1**（OFL-1.1），允许随软件一起再分发与嵌入。

| 字族 | 文件前缀 | 角色 | 上游项目 |
|---|---|---|---|
| Inter | `inter-latin-*` | sans —— 界面与正文 | https://github.com/rsms/inter |
| JetBrains Mono | `jetbrains-mono-latin-*` | mono —— 标签、数字、代码 | https://github.com/JetBrains/JetBrainsMono |
| Source Serif 4 | `source-serif-4-latin-*` | serif —— 引文与"说话的声音" | https://github.com/adobe-fonts/source-serif |

- OFL 1.1 全文：https://scripts.sil.org/OFL
- 这些字体**只含拉丁字形**。中文不走这里，而是由 `config.json` 的 `fonts.cjk`
  回退到系统字体（Microsoft YaHei / PingFang SC / Noto Sans CJK SC / Source Han Sans SC）。

字体文件随包分发是为了让同一份 deck 在任何机器上渲染结果一致、且**完全离线**——
不联网、不依赖系统装了什么字体。
