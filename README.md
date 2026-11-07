# mv-ppt

**用 PPT 的版面设计做代码渲染 MV。**

每一帧都是「歌曲时间」的纯函数在 canvas 里画出来的，而每一页都是一张真正设计过的幻灯片：12 栏网格、六级字号、每页至少一个图形元件、元素按拍依次缓入、翻页落在小节线上，最后由 ffmpeg 编码成片。

> An agent skill that turns a song into a music video where every shot is a laid-out slide — not a subtitle board. Frames are a pure function of song time; page turns land on bar lines; beats, not milliseconds, drive the easing.

<p align="center"><img src="https://github.com/user-attachments/assets/98f954c0-eebb-4c2c-ab91-464886ab5ef2" alt="预览" width="820"></p>

<p align="center"><sub>8 秒 / 4 个镜头 / 一镜一小节 —— 宣纸米底、四个母题（草地 / 落墨 / 相片 / 翻页）、<br>
字幕在固定位置、翻页转场落在小节线上。这四样不是四个特效，是同一套版面纪律的四个可见结果。</sub></p>

> **这段预览全部由仓库里的东西生成**，可以逐样本复现：
> 画面 = `assets/skeleton` + 一张 4 行的镜头表（母题 `field` / `rain` / `frames` / `calendar`）；
> 音轨 = `docs/demo-audio.py` 合成的 8 秒 D 小调循环（120 BPM，纯 Python 标准库，无采样、无外部音频）；
> 文案是自己写的四行。**没有引用任何歌曲、歌词、影片或第三方素材。**
>
> 预览里没有主角。这条演示要展示的是版面与母题本身，人物一进来就成了视觉主体；
> 主角、双人重影、字幕避让人物这些能力在 `assets/skeleton` 的示例 deck 里仍然完整可跑。

---

## 它解决什么问题

用 AI 做歌词 MV，绝大多数产出长一个样：**黑底、一行字、字一行行打出来**。观众在等字打完，画面本身什么也没说。

这个技能把两套方法缝在一起：

| 来自 | 拿来了什么 |
|---|---|
| 代码渲染 MV 方法 | 节拍网格、纯函数 `renderFrame(t)`、WebGL 后处理镜头、ffmpeg 导出、审片 |
| PPT 版面语言 | 主题配色、六级字号、依次缓入、每页一图的版面规范、页码与进度条等页面装置 |

结果同时是两件东西：**一张设计过的幻灯片**，和**一个卡在节拍网格上的镜头**。

## 核心主张

**「像字幕板」和「像设计过的幻灯片」之间的全部距离，是五条版面纪律。**

1. **一页一意** —— 一张 slide 只服务一句话。想说三件事就做三页，翻页是免费的，注意力不是。
2. **网格与层级是硬约束** —— 12 栏、左右留白 7.8%、上下 10.5%、六级字号。所有元素进插槽，不允许"随手摆个坐标"。没有三档以上字号在场的页面是海报，不是幻灯片。
3. **一页一图** —— 每页至少一个图形元件（条形图 / 时间轴 / 流程 / 卡片 / 对比 / 环形 / 数字 / 引言 / 徽章）。纯文字页只能是封面。
4. **依次缓入，用拍计量** —— PPT 的元素依次缓入在这里单位不是毫秒而是**拍**。缓入节奏天然跟着歌走。
5. **翻页是镜头，不是切换** —— 鼓点砸下来用 `cut`，段落推进用 `push`，全曲最亮的一拍用 `flash`。

配套的六条铁律保证「逐帧准确」：一个纯函数、时间只写在节拍网格上、颜色是状态不是装饰、每页回答一个 ID、靠出图审片、世界来自这首歌而不是你上一部喜欢的片子。

## 安装

这是一个 **Agent Skill**（`SKILL.md` 格式），给会读本地文件的编码 Agent 用。

```bash
git clone https://github.com/WXM-ABC/MV-PPT.git mv-ppt

# WorkBuddy / Claude Code 的用户级技能目录
mv mv-ppt ~/.workbuddy/skills/mv-ppt
# 或项目级
mv mv-ppt .claude/skills/mv-ppt
```

不想装 git 的，直接去 [Releases](https://github.com/WXM-ABC/MV-PPT/releases/latest) 下源码包，解开后同样放进技能目录即可。

之后对 Agent 说「把这首歌做成 MV」「歌词 MV」「画面太素了」就会触发。

## 快速开始

```bash
cp -r assets/skeleton my-mv && cd my-mv
npm install                                  # 只要 playwright-core，复用系统 Chrome/Edge
cp /path/to/song.wav input/song.wav          # 44.1 kHz

python ../scripts/song_probe.py input/song.wav    # 时长 / 头静音 / offset
node ../scripts/beatgrid.cjs input/song.wav --out data/features.json

npm run smoke        # 无浏览器跑全片：崩溃 / NaN / 翻页不在小节线 / 缺图形 / 缺字幕
npm run preview      # http://127.0.0.1:5173
npm run export       # 出片
```

Windows 上 ffmpeg 不在 PATH 时，命令前加 `FFMPEG_BIN=D:/bin/ffmpeg.exe`。

## 八步流水线

第 1–2 步是时钟，错了后面全都救不回来。

| # | Stage | 产出 |
|---|---|---|
| 1 | 锁定音频 | `input/song.wav` (44.1 kHz)，记下时长与头部静音 |
| 2 | 测网格与歌词 | `data/features.json`、`data/lyrics.json` |
| 3 | **写 deck** | `data/deck.json` ← 本技能的核心动作 |
| 4 | 写计划 | `docs/PLAN.md`：段落、页面种类、颜色状态 |
| 5 | 配主题 | `config.json → palettes`，五套 PPT 主题 |
| 6 | 跑冒烟 | `deck_smoke.mjs` |
| 7 | 审片 | contact sheet、逐页亮度曲线 |
| 8 | 导出 | 逐帧喂 ffmpeg，音频从 wav 合成 |

## 两种片子，别混用

同一个引擎，两条完全不同的路线——**混用是失败的开始**。

| | 讲解型 slide | MV 型 shot |
|---|---|---|
| 一页 | 8–16 小节（11–22s），够读完一段话 | **2 小节（约 2.7s）**，最短 1.4s |
| 一页有什么 | kicker + title + sub + 一个图形 | **一个母题铺满画面** + 一行字 |
| 缓入 | 4–6 拍依次缓入 | 0.45 拍进完，几乎是硬切 |
| 页脚 | 页码、进度条 | **一个都不要** |

MV 型还有一条最要紧的：**先给片子一个人，再给片子风景。** 30 个母题平摊 85 刀，每个仍要用近 3 次，缩略图扫过去还是一排雷同的格子；一旦画面里有个持续存在的人，同一个地方、她在另一处做另一件事，就是另一个镜头。重复感是被这个消掉的，不是被加素材消掉的。

## 目录

```
SKILL.md                    技能本体：六条铁律、版面五条、流水线、两种片型的岔路
references/                 11 篇手册
  ├── figure.md             主角手册：七种姿态骨骼表、她占多宽、九个踩过的坑
  ├── subtitles.md          字幕手册：字幕盒自动避让人物、按姿态算宽度
  ├── scenes.md             MV 母题手册：30 个母题、色板角色、浅色主题的四个坑
  ├── deck-layout.md        版式母版详解：网格、插槽、缓入算法、每种图形元件
  ├── beat-deck-sync.md     半速错觉、enterBeats 换算、转场选型表
  ├── themes.md             五套主题色值表、怎么从 HTML 模板反推一套主题
  ├── qa-and-delivery.md    审片命令、导出配方、声道检查
  ├── quality-ceiling.md    「质量差距很大」怎么办：廉价渲染的可测特征
  ├── from-song-to-world.md 可借（镜头）vs 不可借（场景）
  ├── case-studies.md       两部真实成片对照（JS 11k 行 / Python 30k 行，同一首歌）
  └── animation-techniques.md  七层动效，按情境路由
scripts/
  ├── song_probe.py         时长、头尾静音、建议 offset
  ├── beatgrid.cjs          bpm / 第一拍 / onsets（纯 Node，零依赖）
  ├── tempo_verify.cjs      三次跑出三个 BPM 时按相位裁决
  ├── loudness_scan.cjs     逐秒响度扫描，按实测动态挑片段
  ├── deck_smoke.mjs        无浏览器全片自检
  └── qa_pixels.mjs         像素审片：抓「没崩溃但画面是空的」
assets/
  ├── skeleton/             可复制的完整工程骨架（引擎 / 版式母版 / 导出器）
  └── ppt-themes/           五份现成的 PPT 风格 HTML，作主题取样来源
docs/
  ├── preview.gif           8s 合成演示（4.0 MB，仓库内可复现）
  ├── cover.jpg             静帧，可用作仓库 Social Preview
  ├── demo-audio.py         生成预览音轨的合成脚本（纯标准库，无采样）
  └── demo.md               预览的完整复现步骤与参数取舍
```

## 几个真踩过的坑

这些是文档里最值钱的部分，因为都是钱和时间换来的：

- **半速错觉** — 自相关给出的是脉冲，可能是真小节的倍频。先确认一小节是几拍，否则整条时间线全是错的。
- **官方 MV ≠ 单曲** — 实测差 9.59 秒。歌词时间码必须对应你渲染的那一个版本。
- **`gridFit` 在 0.25–0.45 是正常值** — onsets 里包含所有人声和旋律起音，只有约三分之一落在拍上。不是失败信号。
- **成片变单声道** — 分析用的 wav 常常是单声道降混，渲染、冒烟、像素 QA 全都不会报警。导出后必须 `ffprobe` 看 `channels`。
- **画面是空的但代码没错** — `deck_smoke.mjs` 只能证明没崩溃。`raised` 与 `bg` 亮度差要从 3–13 提到 ΔL ≥ 19，cards 页 ink 才能从 3% 到 41%。
- **浅色主题别按"比背景亮"判对比度** — 那是深色墨压在浅底上，只能按分位数区间（p95−p05）判断。
- **坐姿的宽度是 `s` 的近 1.8 倍** — 按 `s` 估宽度，字幕必然印在膝盖上。

## 声明

用别人的歌做的片子是**衍生作品**：非商业、遵守权利人自己的条款、并披露 AI 生成内容。

本仓库**不分发**任何歌曲、音频或影片素材。`docs/preview.gif` 是仓库内代码渲染出来的，
它的音轨由 `docs/demo-audio.py` 逐样本合成——没有采样、没有外部音频文件。
`assets/ppt-themes/` 与 `assets/skeleton/` 仅含代码与版式样式。

## 许可

本仓库代码与文档以 **MIT** 发布，见 [LICENSE](LICENSE)。
第三方组件（`vendor/lyricmv` 的 MIT、随包字体的 SIL OFL 1.1）及其署名见 [NOTICE.md](NOTICE.md)。

---

如果这个技能帮你省下了「为什么我的片子看起来像字幕板」那三个星期，点个 star 就够了。
