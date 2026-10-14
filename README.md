# eat what

一桌人一起决定工作日午饭。一个页面，一份餐厅列表，一次现场抽选。不用账号。

打开同一个网址的人，看到的是同一份列表、同一个结果。时钟是上海时间，今天是周几由服务器决定，不看每个人自己电脑上的日期。

## 怎么用

- 周一到周五可以抽午饭。周六、周日不抽，列表还留着。
- **总列表**是这桌常去的餐厅。谁都可以加，谁都可以去掉。名字会一直留着，换周也不会删。
- **今天的列表**在新的一天开始时，从总列表抄一份，并去掉这周已经选过的餐厅。今天不去的，可以只从今天的列表里去掉，总列表不受影响。当天新加的餐厅会马上进今天的列表，当天就能抽到。今天已经确定之后，新加的只留在总列表里，下一天再进入今天的列表。周末没有抽选，加到总列表即可，周一会把它抄进今天的列表。
- 点 **抽一家餐厅**，从今天的列表里抽一家。点 **再抽一家** 会换掉今天的结果；今天的列表里还有别的选择时，不会再抽到刚刚抽到的那家。只剩一家时，再抽还是这一家。点 **自己选**，从今天还在的餐厅里直接定一家，这桌看到的是同一个结果。今天的列表是空的就不会编一家。今天已经确定之后，自己选也不能再改。
- 点 **确定今天的选择** 之后，今天就不能再改。不能再抽，也不能把这家从今天的列表或总列表里去掉。下一天重新开始。
- 这周已经过去、但还没确定的日子，可以点那一天的记录重新选，也可以选 **空**，然后再确定。已经确定的日子不能再改。空不会占掉别的餐厅。
- 新的一周从周一开始。上一周抽中的结果会清空，餐厅列表还在。

线上地址是 [https://eatwhatlunch.cn](https://eatwhatlunch.cn)，[https://www.eatwhatlunch.cn](https://www.eatwhatlunch.cn) 打开的是同一个房间。

从中国大陆访问这个 `.cn` 域名，还需要 ICP 备案。这个应用跑在 Cloudflare Workers 上，不是大陆机房，备案不能在这套部署上单独完成。在备案解决之前，大陆的手机和宽带可能打不开这个网址。人不在大陆网络里时，上面的地址是可以打开的。

## 在自己电脑上运行

本地开发不需要 Cloudflare 账号，也不需要任何密钥。

```bash
npm install
npm run dev
```

在跑着开发服务器的那台电脑上打开 [http://127.0.0.1:43123](http://127.0.0.1:43123)。这个地址不能从手机或另一台电脑打开。

`npm test` 会检查星期、周次和抽选规则。

## 用手机或其他电脑打开本地版本

先保持 `npm run dev` 在跑，再开一条临时公网隧道：

```bash
cloudflared tunnel --url http://127.0.0.1:43123
```

如果还没有 [cloudflared](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)，先安装它。命令会打印一个 `https://….trycloudflare.com` 链接。手机、笔记本或其他设备打开这个链接，大家进的是同一个午饭房间。开发服务器或隧道一停，链接就失效，下次启动主机名也会变。

想要一个关掉电脑还在的地址，用下面的方式部署到 Cloudflare。线上房间是新的，不会把临时隧道里的餐厅列表拷过去。

## 部署

你已经有 Cloudflare 账号（用 GitHub 登录的那个）。部署只需要登录一次，再跑一条命令。不部署也可以在自己电脑上用。

### 费用

2026 年 10 月 3 日对照 [Durable Objects 定价](https://developers.cloudflare.com/durable-objects/platform/pricing/) 核对过（该页最后更新于 2026 年 9 月 30 日）。

使用 SQLite 存储的 Durable Objects 可以放在 **Workers 免费计划** 上。这个应用用的就是这种存储（`new_sqlite_classes`），免费账号就够。Workers 付费计划是每月 5 美元，不是必需的，它只是提高包含的额度。

免费计划里，Durable Objects 每天包含 10 万次请求和 13,000 GB-s 的运行时长。收到的 WebSocket 消息按 20:1 计入请求。超过当天免费额度后，该类操作会失败，直到 UTC 零点恢复。一小桌人午饭用，停在这个额度里面。没人操作时，WebSocket 会休眠，房间不会一直占着时长。

### 登录一次

Wrangler 已经是这个仓库的依赖。`npm install` 会装上它。下面的命令用本地这份。

用已经开通 Cloudflare 的 GitHub 账号做一次浏览器登录：

```bash
npx wrangler login
```

也可以在 Cloudflare 控制台创建 [API 令牌](https://dash.cloudflare.com/profile/api-tokens)，在自己的终端里导出为 `CLOUDFLARE_API_TOKEN`。不要把令牌贴进应用，也不要提交到仓库。

### 发布

```bash
npm run deploy
```

这条命令会构建页面和 Worker，再发布构建结果。Worker 的名字是 `eat-what`。`eatwhatlunch.cn` 和 `www.eatwhatlunch.cn` 已经接在这个 Worker 上，以后再部署也会留着这两个地址。

域名注册在阿里云万网，域名服务器已经改到 Cloudflare（`coraline.ns.cloudflare.com` 和 `greg.ns.cloudflare.com`）。要打开的地址是 `https://eatwhatlunch.cn`。
