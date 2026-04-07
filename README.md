# 灵感收集

一个本地运行的 Flask 小工具，用来收集、整理和跟踪零散灵感。

## 功能

- 快速记录文字、链接、图片和视频
- 自动抓取链接标题
- 按分类、类型、状态、关键词筛选
- 批量删除与合并多条记录
- 支持给每条灵感补充来源、标签、备注

## 启动方式

```bash
pip install -r requirements.txt
python app.py
```

启动后访问 [http://localhost:5001](http://localhost:5001)。

## 开发模式

如果你还在频繁改代码或模板，直接双击 [dev.bat](/D:/02-Projects/brain/dev.bat) 就行。
它会启动源码版服务，Flask 自带热重载，保存文件后通常不用重新打包就能看到变化，
并且会自动打开浏览器，命令行会最小化在后台运行。

## 软件形式

你可以直接双击 [start.bat](/D:/02-Projects/brain/start.bat)，它会后台启动并自动打开浏览器。

如果想打包成真正的 Windows 程序，运行 [build.bat](/D:/02-Projects/brain/build.bat) 后，会生成 `dist/LingganShouji.exe`。
之后你只要双击这个 `exe` 就行，不需要再开终端。

新版本会优先打开原生窗口；如果机器缺少 WebView 运行时，会自动退回浏览器。

## 推荐流程

- 日常开发：用 [dev.bat](/D:/02-Projects/brain/dev.bat)
- 体验软件壳：用 [start.bat](/D:/02-Projects/brain/start.bat)
- 正式打包：用 [build.bat](/D:/02-Projects/brain/build.bat)

## 技术栈

- Flask
- Flask-SQLAlchemy
- SQLite
- 原生 HTML / CSS / JavaScript

## Windows + Android Client (Flutter)

This repository now includes a starter mobile/desktop client at `flutter_app/`.

- Install stable Flutter SDK first.
- In `flutter_app/`, run:

```bash
flutter create . --platforms=windows,android
flutter pub get
```

- Or run `flutter_app/setup.bat` on Windows.
- Start backend API with `run_mobile_api.bat` (listens on `0.0.0.0:5001`).

Run examples:

```bash
# Windows
flutter run -d windows

# Android device (replace with your LAN IP)
flutter run --dart-define=API_BASE_URL=http://192.168.1.100:5001
```
