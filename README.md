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

## 推荐流程

- 日常开发：用 [dev.bat](/D:/02-Projects/brain/dev.bat)
- 临时直接运行：用 `python app.py`

## 当前主界面

- 所有新内容先进入 `未整理`
- 左侧是主题盒子，支持拖拽归位
- 卡片会给出建议盒子和标签
- 组合内容会以文件夹卡展示，并露出子项预览

## 技术栈

- Flask
- Flask-SQLAlchemy
- SQLite
- 原生 HTML / CSS / JavaScript
