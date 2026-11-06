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
  // noFig：这一镜不放主角。slot:'top'：字幕走上插槽，位置固定，画面在背后换。
  { t: 0.0, zh: '纸是米白的',     m: 'field',    noFig: true, slot: 'top' },
  { t: 2.0, zh: '墨落下来',       m: 'rain',     noFig: true, slot: 'top',
    params: { dot: [0.72, 0.55] } },
  { t: 4.0, zh: '一页只讲一件事', m: 'frames',   noFig: true, slot: 'top', e: 'push' },
  { t: 6.0, zh: '翻页落在拍上',   m: 'calendar', noFig: true, slot: 'top', e: 'flip',
    params: { label: '翻页' } },
];
```

（`p` / `f` / `s` / `x` 这几个姿态字段在 `noFig` 下不参与构图——主角不在，就没有"躲开她"这件事；
它们留着是因为镜头表模板本来就要写，去掉反而会让这份示例和模板对不上。）

**为什么统一走 `top`**：八个常用母题里没有一个把底部留空——它们全都有落地感（草坡、水面、纸页、相片）。
人物在的时候，字幕靠"她站哪边就往另一边放"来决定左右；人物一撤，这条规则就失效了。
实测下来，字幕放上方是最稳的：位置一致，四镜之间只换画面、不换字幕位置，读起来才是成片而不是幻灯片。
`rain` 的墨点落点默认在正中下方（正好是 0.735 的字幕带），所以用 `dot` 把它挪到右侧。

把它填进 `tools/shotlist.example.mjs` 的 `SHOTS`（复制成 `tools/build_deck.mjs`），
`node tools/build_deck.mjs` 就会写出 `data/deck.json`，并打出五个验收数字：

```
shots 4   average 2.00s   shortest 2.00s   longest 2.00s
motifs 4   uses/motif 1.0   subtitles 4/4   two-shots 0
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
600px / 48 色是 4.0 MB 且看不出色带。纸纹是 GIF 的天敌，抖动参数比分辨率更影响体积。

## 4. 做这条演示时修掉的三处

**一、画面里不该有某一种语言。** `calendar` 母题把一个日文词硬编码在画面上——它来自这部引擎
最初的日本歌项目，但母题是引擎的公共部件，渲染法文 deck 的人会拿到一个日本日历。改为**没有默认
文字**，需要时传 `params: { label: '翻页' }`。同一次清理把另外 19 处代码注释里的日文标题换成了
已有的英文释义——那些标题原本是原曲的歌词短语。

**二、母题的焦点会和字幕抢同一块地方。** `rain` 的墨点落点写死在 `0.80`，正好在 0.735 的字幕带上
——墨点砸在字幕上。现在支持 `params: { dot: [x, y] }` 换落点，默认值不动。

**三、字幕那条小横杠一直画错位置。** 它是按 `r.y + r.h * 0.06` 定位的，但 `r.h` 是**量出来的文字
高度**，不是插槽高度：字幕在 `head` 时横杠压在第一行的字头上（被文字盖住，看不出），换到 `top`
就变成空纸中间一根孤零零的红线。改为锚在文字本身（最后一行基线下方），任何插槽都跟着字走。

这三处都不是这条演示特有的问题——是任何人换个母题、换个插槽就会撞上的。
