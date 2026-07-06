# Lingua Float

轻量划词翻译浮窗，面向 Windows 桌面和 Android。目标是快、轻、低打扰：单词优先走本地词典，长句走 OpenAI 兼容的 `chat/completions` 翻译接口。

## 功能

- Windows：Electron 透明毛玻璃浮窗、系统托盘、设置页、快捷键开关监听。
- 划词触发：开启监听后，按住 `Ctrl` 划词才翻译，普通划词不弹窗。
- Android：Capacitor 容器，支持系统 `PROCESS_TEXT` 文本处理入口。
- 单词：优先查询本地 ECDICT 词典，不消耗 API。
- 长句：使用可配置的 API key、endpoint、model 和目标语言。
- 界面：极简浮窗、点击空白处隐藏、接近 iOS 的半透明毛玻璃视觉。

## 本地词典

项目支持 [ECDICT](https://github.com/skywind3000/ECDICT) 英汉词典。ECDICT 是开源英中双解词典数据库，使用 CSV 存储，字段包含单词、音标、英文释义、中文释义、词性、Collins 星级、Oxford 核心词标记、考试标签和词形变化等。

为了避免仓库过大，以下文件默认不提交到 Git：

- `data/ecdict.csv`
- `data/lemma.en.txt`
- `public/dict/`
- `dist/dict/`
- `android/app/src/main/assets/public/`

许可文件保留在 `data/ECDICT_LICENSE`。界面里显示的 Collins/Oxford 标记来自 ECDICT 的星级和核心词字段，不包含商业词典全文。

### 下载词典

推荐下载两个文件：

- `ecdict.csv`：主词典数据。
- `lemma.en.txt`：词形还原数据，例如 `gave -> give`、`taken -> take`，用于查变形词。

方式一：直接下载单个文件。

```powershell
New-Item -ItemType Directory -Force data
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv" -OutFile "data/ecdict.csv"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/skywind3000/ECDICT/master/lemma.en.txt" -OutFile "data/lemma.en.txt"
```

方式二：下载整个 ECDICT 仓库 ZIP。

1. 打开 <https://github.com/skywind3000/ECDICT>
2. 点击 `Code` -> `Download ZIP`
3. 解压后复制：
   - `ECDICT-master/ecdict.csv` 到本项目的 `data/ecdict.csv`
   - `ECDICT-master/lemma.en.txt` 到本项目的 `data/lemma.en.txt`

最终目录应该长这样：

```text
translate-float/
  data/
    ECDICT_LICENSE
    ecdict.csv
    lemma.en.txt
```

### 导入并生成索引

下载好词典后，在项目根目录运行：

```powershell
npm install
npm run dict:build
```

脚本会读取：

- `data/ecdict.csv`
- `data/lemma.en.txt`

并生成：

```text
public/dict/
  index.json
  buckets/
    a.json
    b.json
    ...
    _.json
  forms/
    a.json
    b.json
    ...
```

生成逻辑：

- `buckets/`：按单词首个英文字母分桶，运行时只加载需要的桶，避免一次性加载大词典。
- `forms/`：按变形词分桶，用于把 `running`、`gave`、`teeth` 等还原到原词再查。
- `index.json`：记录生成时间、词条数量、字段说明和来源。

生成成功后终端会显示类似：

```text
Built ECDICT buckets: 770000/770000 entries
```

具体数量以 ECDICT 当前版本为准。

### 让 Windows 使用词典

生成 `public/dict/` 后，重新构建前端：

```powershell
npm run build
```

构建后会把词典复制到：

```text
dist/dict/
```

Windows 桌面版在生产模式下读取 `dist/dict/`。如果你正在运行 Lingua Float，需要退出并重新打开应用，新的词典才会生效。

### 让 Android 使用词典

先生成词典并构建：

```powershell
npm run dict:build
npm run build
```

再同步到 Android 工程：

```powershell
npm run sync:android
```

同步后词典会进入：

```text
android/app/src/main/assets/public/dict/
```

然后用 Android Studio 重新运行，或打 debug 包：

```powershell
cd android
.\gradlew.bat assembleDebug
```

### 更新词典

如果 ECDICT 发布了新数据，重复以下流程即可：

```powershell
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv" -OutFile "data/ecdict.csv"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/skywind3000/ECDICT/master/lemma.en.txt" -OutFile "data/lemma.en.txt"
npm run dict:build
npm run build
npm run sync:android
```

更新后建议重启 Windows 应用，Android 端需要重新安装或运行新的构建。

### 常见问题

如果提示找不到 `data/ecdict.csv` 或 `data/lemma.en.txt`：

- 确认文件名全部小写。
- 确认文件放在项目根目录下的 `data/`，不是 `data/ECDICT-master/`。
- 确认当前终端路径是项目根目录，也就是包含 `package.json` 的目录。

如果单词查不到：

- 先确认 `public/dict/index.json` 已生成。
- 重新运行 `npm run build`，确保 Windows 读取的 `dist/dict/` 已更新。
- Android 端还需要运行 `npm run sync:android`。

如果 Git 状态里出现大量词典 JSON：

- 这是生成物，正常不提交。
- `.gitignore` 已忽略 `public/dict/`、`dist/` 和 Android assets。
- 如已误加入暂存区，可运行：

```powershell
git restore --staged public/dict dist android/app/src/main/assets/public
```

## Windows 使用

开发模式：

```powershell
npm install
npm run build
npm run electron:start
```

已创建桌面快捷方式时，双击 `Lingua Float` 会打开设置页。右上角 `X` 只隐藏窗口，不退出托盘进程。

使用流程：

1. 打开设置页，填入 API key、endpoint、model。
2. 打开 `Selection watcher`。
3. 按住 `Ctrl`，用鼠标拖选文本。
4. 松开鼠标后自动弹出翻译。

默认监听开关快捷键是 `Ctrl+Alt+T`。

## Android 使用

Android 工程位于 `android/`。安装 Android Studio 和 SDK 后：

```powershell
npm run sync:android
npm run android:open
```

或直接：

```powershell
cd android
.\gradlew.bat assembleDebug
```

在支持系统划词菜单的 App 中选中文本，选择 `Lingua Float` 即可打开翻译界面。

## API 配置

运行时可以在设置页填写 API key。也可以在本地创建 `.env`，用于个人构建时内置默认值：

```env
VITE_TRANSLATE_API_KEY=your_key_here
VITE_TRANSLATE_ENDPOINT=https://api.openai.com/v1/chat/completions
VITE_TRANSLATE_MODEL=gpt-4.1-mini
VITE_TRANSLATE_TARGET=简体中文
VITE_AUTO_TRANSLATE_HOTKEY=CommandOrControl+Alt+T
```

DeepSeek 兼容接口也可填写，例如：

```env
VITE_TRANSLATE_ENDPOINT=https://api.deepseek.com/chat/completions
VITE_TRANSLATE_MODEL=deepseek-v4-flash
```

注意：客户端内置 key 可以被逆向提取，只适合个人工具或受控分发。公开分发建议改成自建代理服务。

## 开发命令

```powershell
npm run dict:build
npm run dev
npm run electron:dev
npm run build
npm run lint
npm run sync:android
npm run dist:win
```

## 当前限制

- Windows 自动取词通过轻量鼠标监听加临时 `Ctrl+C` 实现，部分禁止复制选区的应用无法自动读取文本。
- 当前仓库不提交完整 ECDICT 数据，需要按需自行放入 `data/` 后生成索引。
- Android Debug 构建需要本机配置 `ANDROID_HOME` 或 `ANDROID_SDK_ROOT`。
