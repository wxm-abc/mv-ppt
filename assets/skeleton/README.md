# deck skeleton

一个可以跑的「PPT 版面 × 代码渲染 MV」。一页 = 一张设计过的幻灯片；一次翻页 = 在一个
小节线上的一个镜头。一个纯函数画每一帧，无头浏览器逐帧渲染，ffmpeg 编码。

```bash
npm install                                   # 只要 playwright-core；复用系统 Chrome/Edge
cp /path/to/song.wav input/song.wav           # 44.1 kHz wav
npm run preview                               # http://127.0.0.1:5173
npm run smoke                                 # 无浏览器全片自检（崩溃 / NaN / 翻页落点）
npm run sheet                                 # 四张静帧拼成 out/qa.png
npm run export                                # 整片
```

Windows：`ffmpeg` 不在 PATH 上时，命令前加 `FFMPEG_BIN=D:/bin/ffmpeg.exe`。

## 要按顺序替换的东西

1. `input/song.wav` — 你的音频，44.1 kHz。先探针：
   `python <skill>/scripts/song_probe.py input/song.wav --expect-sec <ref> --ref-lead <ref>`。
2. `data/features.json` — **真实**的节拍网格（`bpm`、`beat0`、`duration`）。
   后面所有时间都是对着它写的。
3. `data/lyrics.json` — 一行一条：`{ bar, t, dur, text, key }`，压在小节线上。
4. **`data/deck.json` — 页面。** 这是本骨架的核心，也是你唯一需要天天改的文件。
5. `config.json` — 尺寸、fps、`timing.offset`、主题（`palettes`）、字号角色、codec。
6. `src/stage.js` — 页面背后那堵墙。按新歌自己的名词重做（见 skill 的第 6 条铁律）。

`src/engine.js`（时钟）、`src/deck.js`（版式母版）通常不动；要加图形元件或版式时改后者。

## deck.json 速查

```jsonc
{
  "slides": [{
    "id": "hook",            // 审片时叫得出名字
    "atBar": 4,              // 第 4 小节翻页 —— 不是秒
    "enter": "push",         // cut | push | wipe | flip | flash
    "theme": "cyber-red",    // config.json -> palettes 里的一套
    "layout": "bullets",     // cover | headline | split | bullets | cards | chart | compare | quote | full
    "enterBeats": 4,         // 整页元素入场的窗口（拍）
    "valign": "middle",      // 内容少的时候用它把插槽居中
    "blocks": [
      { "type": "kicker", "text": "CHAPTER 02", "bar": true },
      { "type": "title",  "text": "刺还在，{{温}}也还在", "hit": true },
      { "type": "bullets","at": 1.6, "icon": "bolt", "items": ["…", "…"] },
      { "type": "pagenum" }, { "type": "progress" }
    ]
  }]
}
```

文字里可以写强调：`[[强调色]]`、`{{反白底框}}`、`__下划线__`、`**加重**`。

### MV 型页面（一句一景）

给歌做 MV 时不要用上面那套（一个论点一页、元素依次缓入）。改用满幅版式，
**每个镜头一个母题**，2 小节一刀，字幕只在该唱的那句给一行：

```jsonc
{
  "id": "warm", "atBar": 80, "enter": "flash", "theme": "warm-paper",
  "layout": "stage",          // scene 铺满全画，lyric 压在下方，没有页脚
  "enterBeats": 1.1,
  "blocks": [
    { "type": "scene", "motif": "path", "at": 0, "dur": 0.45,
      "fill": 1, "slot": "main", "from": "none", "hit": true,
      // 画面里要有个人。同一个地方、她在别处做别的事，就是另一个镜头——
      // 这是 30 个母题撑起 85 刀而不显重复的唯一手段。`at` 是她的落脚点。
      "figure": {
        "at": [0.30, 0.900], "s": 0.40, "facing": -1, "pose": "walk", "lamp": true,
        // 她记住的那个人：同一个函数画，由房间的颜色构成
        "also": { "at": [0.445, 0.900], "s": 0.39, "facing": -1, "pose": "walk", "ghost": true }
      } },
    { "type": "lyric", "text": "还温热地留着", "at": 0.35, "dur": 0.7, "slot": "head" }
  ]
}
```

- 母题见 `src/scenes.js`，30 种；写法、色板规则、浅色主题的坑见
  `<skill>/references/scenes.md`。
- 人物见 `src/figure.js`：`pose` 取 `walk|stand|sit|kneel|crouch|reach|lookup`，
  `facing: 0` 是背影，`s` 是景别（0.13 远景 / 0.40 近景），`y` 要踩在母题自己的地面上。
  完整说明见 `<skill>/references/figure.md`。
- `from` 必须是 `"none"`——满幅画面滑动会露出底色。
- **每一刀都要有 `lyric`**，一行，别留无字的镜头。字幕放左还是放右由 `captionBox()`
  算出来（写进 `lyric` 的 `dx`/`w`），不要手挑——她有多宽是按姿态算的，坐姿是 `s` 的
  近 1.8 倍。见 `<skill>/references/subtitles.md`。
- 与其手写几十页 JSON，不如写一张镜头表脚本（`tools/shotlist.example.mjs` 是现成的例子：
  `{ t, zh, m, p, f, s, x, g }`，`t` 是这一句唱到的秒，切点跟着人声走）。
- **不要** MV 页上加 `progress` / `pagenum`：那是讲解型 PPT 的装置，压在画面上很脏。

块类型与全部字段见 `<skill>/references/deck-layout.md`；拍数怎么换算见
`<skill>/references/beat-deck-sync.md`；主题色值见 `<skill>/references/themes.md`。

## Commands

```bash
node ../scripts/deck_smoke.mjs .                          # 无浏览器全片自检（推荐先跑）
node export/export.mjs --sheet out/qa.png --times 12.5,13,13.5 --cols 3
node export/export.mjs --sheet out/qa.png --from 29.4 --to 44.6 --step 0.9 --cols 4
node export/export.mjs --start 58 --end 76 --width 960 --height 540 --fps 30 --out out/try.mp4
node export/export.mjs                                    # 用 config.json 的尺寸与 fps
ffprobe -v error -show_entries stream=channels -of default=noprint_wrappers=1 out/film.mp4
# channels=1 ? 说明 config.paths.audio 是分析用的单声道 wav：用原始无损音源重混（不重渲）
ffmpeg -y -i out/film.mp4 -i song_stereo.wav -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart out/film_fixed.mp4
```

预览快捷键：`space` 播放/暂停，`,` `.` 逐帧，`←` `→` 跳一秒，`?t=150` 直接开在 150 s。
`?stage=0` / `?post=0` 分别关掉舞台层与后处理层，方便判断某一层值不值。

## 这个骨架守住的东西

- `renderFrame(t)` 是歌曲时间的纯函数。没有帧间状态，不读墙上时钟，不用 `Math.random()`。
- 翻页写 `atBar`，入场写拍。代码里不出现手写的秒。
- 预览与导出调用同一个函数：审到的就是出片的。
- `deck_smoke.mjs` 几秒钟能把崩溃、NaN 几何、翻页不在小节线上、缺图形元件全查一遍。

## 文件

| | |
|---|---|
| `index.html` | 预览播放器 + 导出器调用的 `window.__mv` |
| `src/engine.js` | `renderFrame`、`beat()/bar()`、翻页转场、相机、`postState`、主题 |
| `src/deck.js` | 版式母版：网格、字号、插槽、缓入、19 种块类型 |
| `src/stage.js` | 页面背后的墙与光（`back()` / `frontLayer()`） |
| `src/fonts.js` | 三个字型角色的加载（本地 woff2，离线可用；中文走 `fonts.cjk` 回退） |
| `data/deck.json` | 页面 |
| `vendor/lyricmv` | 后处理镜头（泛光/色散/扫描线/颗粒），四个文件 |
| `export/` | 本地静态服务器 + 逐帧导出与 contact sheet |

相机工具已经内置在 `src/engine.js`：`camera(ctx, W, H, {x, y, zoom, rot})`、`lerpCam(a, b, k)`。
缓动：`smooth` `easeOut` `easeIn` `easeInOut` `easeBack` `span` `pulse` `lerp`。
确定性噪声：`hash(i)`，永远不要用 `Math.random()`。
