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

## Desktop 桌面版

桌面版是当前主方向：本地零摩擦收集工作台，数据存储在 Electron `userData` 目录下的
`brain-desktop.db`。

```bash
cd desktop
npm install
npm start
```

常用入口：

- `Ctrl+Shift+B`：从任意软件收集当前剪贴板文本、链接或图片。
- `Ctrl+Alt+B`：开启或关闭剪贴板自动监听。
- 托盘菜单：立即收集剪贴板、开启/关闭自动监听、打开主窗口、退出。
- 当前选中盒子会作为默认收集目标；没有选中盒子时进入默认收件箱。

## 开发模式

如果你还在频繁改代码或模板，直接双击 [dev.bat](/D:/02-Projects/brain/dev.bat) 就行。
它会启动源码版服务，Flask 自带热重载，保存文件后通常不用重新打包就能看到变化，
并且会自动打开浏览器，命令行会最小化在后台运行。

## 推荐流程

- 日常开发：用 [dev.bat](/D:/02-Projects/brain/dev.bat)
- 临时直接运行：用 `python app.py`
- 对外发布：用 `waitress-serve --host 0.0.0.0 --port 5001 wsgi:app`

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

## 发布前最小配置

如果只是本地自己用，直接 `python app.py` 就够了。  
如果要放到云主机或给别人访问，至少补下面这些环境变量：

```bash
BRAIN_DEBUG=0
BRAIN_HOST=0.0.0.0
BRAIN_PORT=5001
BRAIN_SECRET_KEY=换成一串长随机字符串
BRAIN_PASSWORD=换成一个访问密码
BRAIN_SESSION_COOKIE_SECURE=1
```

说明：

- `BRAIN_PASSWORD`：开启最小访问保护。不配就不会有登录门。
- `BRAIN_SECRET_KEY`：必须自己设置，别用临时值。
- `BRAIN_SESSION_COOKIE_SECURE=1`：只在 HTTPS 下发送登录 cookie，正式环境建议开启。

## 最小发布建议

推荐放到一台有持久磁盘的云主机上，再挂 Nginx 或 Caddy：

1. 安装依赖：`pip install -r requirements.txt`
2. 配环境变量
3. 用生产服务启动：`waitress-serve --host 0.0.0.0 --port 5001 wsgi:app`
4. 反向代理到你的域名并开启 HTTPS
5. 定期备份 `instance/` 和 `uploads/`

## 健康检查

- 健康检查地址：`/healthz`
- 成功时返回：`{"ok": true}`
