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

项目支持 [ECDICT](https://github.com/skywind3000/ECDICT) 英汉词典。由于词典原始文件和生成索引较大，仓库默认不提交：

- `data/ecdict.csv`
- `data/lemma.en.txt`
- `public/dict/`
- `dist/dict/`
- `android/app/src/main/assets/public/`

许可文件保留在 `data/ECDICT_LICENSE`。如需重新生成本地词典，把 ECDICT 的 `ecdict.csv` 和 lemma 文件放入 `data/` 后运行：

```powershell
npm run dict:build
```

界面里显示的 Collins/Oxford 标记来自 ECDICT 的星级和核心词字段，不包含商业词典全文。

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
