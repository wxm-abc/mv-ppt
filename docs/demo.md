# 预览是怎么做出来的

`docs/preview.gif` 不是截图，是这个仓库跑出来的。任何人照着做会得到同一个结果。

## 1. 音轨

```bash
python docs/demo-audio.py song.wav     # -> 8.0s / 120 BPM / 立体声 / 44100 Hz
```

纯 Python 标准库合成，没有采样、没有外部音频文件。120 BPM × 4 小节 = 8.0 秒，
调性 D 小调，四小节循环 Dm – B♭ – F – C。因为音频是生成的，**网格真值已知**（120 BPM、
首拍 0.000s），所以 `data/features.json` 直接用真值，而不是用 `beatgrid.cjs` 的实测值——
后者在同一文件上量出 119.158 BPM / beat0 0.472s，0.7% 的误差在 8 秒里会漂 40ms。
真实音乐相反：永远信测量 + `tempo_verify.cjs`。

## 2. 镜头表

4 个镜头，一镜一小节（2.0s），全部 `warm-paper` 主题：

```js
const THEMES = [[0, 'warm-paper']];

const SHOTS = [
  { t: 0.0, zh: '纸是米白的',     m: 'field',    p: 'walk',  f: -1, s: 0.22, x: 0.72, sec: 1 },
  { t: 2.0, zh: '墨落下来',       m: 'rain',     p: 'stand', f:  1, s: 0.34, x: 0.30 },
  { t: 4.0, zh: '一页只讲一件事', m: 'frames',   p: 'stand', f:  0, s: 0.40, x: 0.66, g: 1, e: 'push' },
  { t: 6.0, zh: '翻页落在拍上',   m: 'calendar', p: 'walk',  f: -1, s: 0.30, x: 0.28, e: 'flip',
    params: { label: '翻页' } },
];
```

把它填进 `tools/shotlist.example.mjs` 的 `SHOTS`（复制成 `tools/build_deck.mjs`），
`node tools/build_deck.mjs` 就会写出 `data/deck.json`，并打出五个验收数字：

```
shots 4   average 2.00s   shortest 2.00s   longest 2.00s
motifs 4   uses/motif 1.0   subtitles 4/4   two-shots 1
adjacent repeats: none
one-apart repeats: none
caption boxes under 0.40 of the frame: none
```

四行文案是**为这条演示写的**，讲的就是这套版面纪律本身：纸、墨、一页一意、翻页落在拍上。
没有一句来自任何现有歌曲。

## 3. 出片

```bash
FFMPEG_BIN=/path/to/ffmpeg node scripts/deck_smoke.mjs .    # OK — no crashes, no NaN, every page turns on a bar
FFMPEG_BIN=/path/to/ffmpeg node export/export.mjs --start 0 --end 8 \
  --width 1280 --height 720 --fps 30 --out out/demo.mp4
ffprobe -v error -select_streams a:0 -show_entries stream=channels -of csv=p=0 out/demo.mp4
# -> 2   （是 1 就用原始无损音源重混，见 references/qa-and-delivery.md §3b）

ffmpeg -i out/demo.mp4 -vf "fps=8,scale=600:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" -loop 0 docs/preview.gif
```

600px / 8fps / 48 色是试出来的：640px 全彩要 6.4 MB，640px / 32 色降到 3.3 MB 但渐变开始分层，
600px / 48 色是 3.9 MB 且看不出色带。纸纹是 GIF 的天敌，抖动参数比分辨率更影响体积。

## 4. 顺便修掉的一个缺陷

做这条演示时发现 `src/scenes.js` 的 `calendar` 母题把「めくる」（日文"翻页"）硬编码在画面上
——它来自这部引擎最初的日本歌项目。母题是引擎的一部分，不该把某一种语言焊进画面，
所以现在支持 `params: { label: ... }` 覆盖，默认值保留，老 deck 渲染不变。
