# Open Source Pulse Wall

一个一节课能跑完的 Git 开源贡献项目。学生从 Fork 开始，走完 Clone、Branch、Commit、Push、Pull Request、Review、Merge 这一整条路；老师投影实时贡献墙，看着同学的 profile 卡片一张张被点亮。

新版前端是手绘纸面风格：贡献者卡片墙、实时活动流、Profile Builder + JSON 预览、Issue 与 PR 公告板、Git 历史图，全部由 `data/profiles/*.json` 驱动。

```text
Fork → Clone → Branch → Edit → Validate → Commit → Push → Pull Request → Review → Merge → Pull
```

## 这个仓库能教什么

学生在这里要做四件事：

1. 提交一份**自己的 profile**（必做，完成第一次开源贡献）。
2. 给**别的同学**写寄语 cheer，互相加油，并自然遇到 PR 合并冲突。
3. 提一个 **Issue**（提问 / 报 bug / 提想法 / 求救卡住）。
4. 帮**至少一位同学**做 PR review，并在自己的 PR 里 request reviewer。

每一步都有即时反馈：浏览器 Profile Builder 实时生成 JSON、本地 `npm run validate` 校验、GitHub Actions 在 PR 上自动检查、老师投影实时刷新贡献墙和公告板。

---

## 老师 3 分钟开课

进入仓库目录：

```bash
cd open-source-pulse-wall
npm start
```

浏览器打开：

```text
http://localhost:3008
```

没有运行时依赖，不需要 `npm install`。只要 Node.js 18 或更高即可。

要把它发布成你自己的课堂仓库：

```bash
git init
git add .
git commit -m "Initial classroom project"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/open-source-pulse-wall.git
git push -u origin main
```

---

## 学生贡献流程

### 第一步：Fork & Clone

先在 GitHub 把老师的仓库 Fork 到自己账号下，然后 Clone 自己的 Fork：

```bash
git clone https://github.com/YOUR_NAME/open-source-pulse-wall.git
cd open-source-pulse-wall
```

把老师的仓库设为 upstream，方便后续同步：

```bash
git remote add upstream https://github.com/TEACHER_NAME/open-source-pulse-wall.git
```

### 第二步：提交自己的 profile

```bash
git checkout -b add-your-profile
cp data/profiles/_template.json data/profiles/your-github-id.json
npm run validate
git add data/profiles/your-github-id.json
git commit -m "Add my contributor profile"
git push origin add-your-profile
```

最后到 GitHub 页面点击 **Compare & pull request**。

#### profile 字段

每个 profile 必须是一个 JSON 对象：

```json
{
  "name": "你的名字",
  "github": "your-github-id",
  "role": "First-time contributor",
  "motto": "今天完成我的第一个开源 PR",
  "stack": ["Git", "Open Source"],
  "city": "Beijing",
  "style": "nature",
  "avatar": "avatars/avatar-01.png",
  "homepage": "",
  "cheers": []
}
```

| 字段 | 是否必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 你的名字或昵称，最多 40 个字符 |
| `github` | 是 | GitHub 用户名 |
| `role` | 是 | 你的角色，最多 50 个字符 |
| `motto` | 是 | 一句话宣言，最多 120 个字符 |
| `stack` | 是 | 技术标签数组，最多 5 项 |
| `city` | 否 | 城市或课堂位置 |
| `style` | 否 | 卡片风格：`minimal`, `nature`, `sketch`, `notebook`, `ink`, `sage` |
| `avatar` | 否 | `avatars/avatar-01.png` 到 `avatars/avatar-10.png` |
| `homepage` | 否 | 个人主页链接（http/https 开头） |
| `cheers` | 否 | 别人写给你的寄语数组，**自己不要往里面加内容** |

#### PR 检查清单

1. 文件放在 `data/profiles` 目录下。
2. 文件名是你的 GitHub 用户名小写，例如 `data/profiles/octocat.json`。
3. `npm run validate` 通过。
4. 只提交自己的 profile 文件，不修改别人的非寄语字段。
5. Commit message 清楚，例如 `Add my contributor profile`。

> 不想手写 JSON？打开 `http://localhost:3008` 用页面上的 **Profile Builder**，填表单 → 复制 JSON → 粘到 `data/profiles/your-github-id.json`。

### 第三步：给同学写寄语 Cheers

合并完自己的 profile 后，给至少一位同学的卡片留一句寄语。

#### 工作流

```bash
git fetch upstream
git checkout main
git merge upstream/main
git checkout -b cheer/octocat
```

打开 `data/profiles/octocat.json`，在 `cheers` 数组里追加一项：

```json
{
  "from": "your-github-id",
  "message": "你的 commit message 写得很清楚，赞！",
  "ts": "2026-05-09"
}
```

校验、提交、推送：

```bash
npm run validate
git add data/profiles/octocat.json
git commit -m "Cheer @octocat for clear commit messages"
git push origin cheer/octocat
```

#### 校验规则

- `from` 必须是合法的 GitHub 用户名格式。
- `from` 不能等于 profile 主人自己的 `github`（你不能给自己加油）。
- `message` 必填，不超过 80 个字符。
- `ts` 可选，必须是 ISO 时间字符串（`2026-05-09` 或 `2026-05-09T20:00:00Z`）。
- 同一个作者写给同一个人的同样内容只能出现一次。
- 单个 profile 最多 50 条寄语。

#### 为什么这样设计

多个同学同时给同一个人加油 = 多个 PR 改同一个 JSON 文件 = **真实的合并冲突**。这是下一节冲突处理章节的现成练习场景。

### 第四步：处理冲突（Conflict Handling）

发生冲突的典型信号：你 push 之后 PR 页面显示 `This branch has conflicts that must be resolved`。原因是 main 分支已经被别的 PR 改动过同一行 / 同一文件。下面默认推荐**新手 merge 流程**，进阶可选 rebase。

#### 新手默认：merge upstream/main

不需要 force push，对新人最安全。

```bash
git fetch upstream
git checkout add-your-profile
git merge upstream/main
```

如果有冲突，Git 会提示哪些文件，并在文件里插入冲突标记：

```text
<<<<<<< HEAD
{ "from": "alice", "message": "你太棒了" }
=======
{ "from": "bob", "message": "干得漂亮" }
>>>>>>> upstream/main
```

按下面五步处理：

1. 打开冲突文件，删掉 `<<<<<<<`、`=======`、`>>>>>>>` 三行。
2. 把两侧都需要保留的内容**手动合并成一段合法 JSON**（cheers 这种数组就是把两条都留下，中间加逗号）。
3. 运行 `npm run validate`，确认 JSON 合法、字段没坏。
4. `git add <冲突文件>`。
5. `git commit`（merge 会自带一条 commit message，直接保存即可）。

最后推送：

```bash
git push origin add-your-profile
```

回到 PR 页面，冲突提示会消失。

#### 进阶：rebase upstream/main

历史更干净（没有 merge commit），但需要 force push。

```bash
git fetch upstream
git checkout add-your-profile
git rebase upstream/main
```

每遇到一个冲突 commit，重复：编辑 → `npm run validate` → `git add` → `git rebase --continue`。

中途想放弃：

```bash
git rebase --abort
```

完成后用 `--force-with-lease` 推送（**不要**用 `-f` / `--force`，会盖掉别人推送）：

```bash
git push --force-with-lease origin add-your-profile
```

#### 课堂演示提示

老师可以让两位同学**同时**给第三位同学的 profile 写 cheer。先合并的那个 PR 之后，第二个 PR 必然冲突。投影上现场演示上面五步就行。

### 第五步：开 Issue

不会写代码也能贡献——发现 bug、有改进想法、卡住了想问，都欢迎开 Issue。

#### 四种模板

打开 [Issues 页面](../../issues/new/choose) 选一种：

| 模板 | 何时用 |
| --- | --- |
| 我有一个问题 | 你不知道怎么做，比如 `npm run validate` 报错没看懂 |
| 我发现了 Bug | 页面、脚本、Action 行为不符合预期 |
| 我有改进想法 | 想加新功能 / 改设计 / 优化课堂体验 |
| 我卡住了，求救 | 命令报错 / PR 提不上去 / 别人卡了你 |

#### 一个好 Issue 的样子

1. **标题**用「动词 + 现象」开头，例：`validate 脚本在 Windows PowerShell 下报 path 错误`。
2. 提问前先**搜一下**已有 Issue：右上角搜索框输入关键词。
3. **报 bug 必备**：复现步骤、期望结果、实际结果、环境（OS / Node 版本）。
4. **粘日志要用三个反引号包起来**：

   ````md
   ```
   $ npm run validate
   Error: ENOENT: no such file...
   ```
   ````

5. **截图**：页面问题最好附图，命令行问题最好直接粘文字。

#### 课堂任务

每位同学**至少开一个 Issue**。可以是：「我想知道怎么把卡片背景换成深色」、「希望 cheers 支持表情符号」、「文档第 N 行有错别字」——都算。

### 第六步：请 Reviewer

PR 不是写完就行，**要让别人来看**才完成开源闭环。这个仓库支持三种渠道，按场景选：

#### 1. 最标准：PR 页面右侧 Reviewers 面板

发起 PR 后：

1. 打开 PR 页面。
2. 右侧栏找到 `Reviewers`，点击齿轮图标。
3. 输入老师或同学的 GitHub 用户名，回车选上。
4. 被选中的人会收到通知，PR 列表里会出现「review requested」状态。

> 注：默认 `data/profiles/*` 已配置 CODEOWNERS，老师会**自动**被请求 review。你只需要再额外指定 1 位同学。

#### 2. 自动指派同学（已配置）

仓库里有一个 `.github/workflows/auto-assign-reviewer.yml`，PR 一打开就会从已合并的同学列表里**随机抽一位**作为 reviewer，跳过 PR 作者本人和老师。所以你**不主动指派也会有同学被分配**。

#### 3. 最轻量：在 PR 描述里 @ 同学

如果你想点名某位同学帮忙看：

```md
@octocat 麻烦帮我看下 cheers 那一段 JSON 缩进对不对？
```

GitHub 会发通知给被 @ 的人。

#### Re-request review：被退回后再请同学看一次

如果 reviewer 提了意见、你修改后想再让 ta 看一遍：

1. 打开 PR 页面。
2. 在右侧 `Reviewers` 区找到那位 reviewer。
3. 点头像旁边那个**循环箭头**按钮（Re-request review）。

很多人不知道这个按钮，所以改完代码之后只是默默等 reviewer，结果 reviewer 根本没收到通知。

#### 课堂任务

- 每位同学的 PR 都要**至少 request 1 位同学** + 老师。
- 每位同学**至少给一位同学的 PR 留一条 review 评论**（哪怕只是 `LGTM`，也算练习）。

---

## 实时反馈与公告板

老师在投影电脑上运行 `npm start` 后，页面会自动同步以下信号：

1. **profile 文件变更**：`data/profiles` 目录里有新增或修改时，1 秒内贡献者墙刷新。
2. **GitHub 同步**：每 30 秒拉一次 commit、issue、open PR；公告板列出最近 Issue 和等待 review 的 PR（含 reviewer 头像气泡）。
3. **校验失败**：JSON 写错时页面显示具体错误，并保留上一次有效的贡献者墙。
4. **活动流**：cheer / commit / issue / PR / review_requested 五类事件用不同图标标在时间线上，让同学一眼看到自己的事被记录了。

典型课堂演示：

```bash
git pull origin main
```

合并后的新文件进入本地目录，投影上的贡献墙和公告板会自动点亮新的卡片和事件。

> 想让公告板和 Git 历史拉到 GitHub 远端数据，需要在 `.env` 里配置 `GITHUB_TOKEN`（fine-grained PAT，只读公开仓库即可），把 API 限额从 60 req/h 提到 5000 req/h。

---

## GitHub Actions 自动检查

仓库里已经包含 `.github/workflows/validate.yml`。学生发起 PR 后，GitHub 会自动运行：

```bash
npm run validate
```

字段缺失、JSON 解析失败、GitHub 用户名格式不正确，PR 页面会出现失败提示。这样学生能马上知道贡献是否合格。

另外 `.github/workflows/auto-assign-reviewer.yml` 在 PR 打开时随机抽一位已合并的同学作为 reviewer。

---

## 课堂建议节奏

- **第 1 阶段（10 分钟）**：老师演示 Fork → Clone → Branch → PR 流程。
- **第 2 阶段（15 分钟）**：学生用 Profile Builder 生成 JSON，发起自己的 PR；练习在 PR 里 request 老师 + 1 位同学作为 reviewer。
- **第 3 阶段（15 分钟）**：学生互相 review PR，老师合并一批；同学之间往别人 profile 的 `cheers` 里加寄语 → 当两人同时 cheer 同一个人时**自然产生冲突** → 投影现场演示《冲突处理 5 步法》。
- **第 4 阶段（10 分钟）**：挑选一个失败的 PR 讲 GitHub Actions 校验；让每位同学**开一个 Issue**；投影展示实时贡献者墙、寄语徽章、公告板更新。

---

## 命令速查

```bash
npm start                  # 老师机：启动实时贡献墙
npm run validate           # 校验所有 profile（含 cheers 字段）
git fetch upstream         # 同步老师仓库
git merge upstream/main    # 默认推荐：合并主分支（新手友好）
git rebase upstream/main   # 进阶：变基（历史干净，需 --force-with-lease）
git push --force-with-lease origin <branch>   # rebase 后专用 push
```

---

## 文件结构

```text
open-source-pulse-wall/
├── .github/
│   ├── CODEOWNERS                       # 老师默认被自动 request review
│   ├── ISSUE_TEMPLATE/                  # question / bug / idea / help
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/
│       ├── validate.yml                 # PR/push 自动跑 npm run validate
│       └── auto-assign-reviewer.yml     # 随机抽一位同学做 reviewer
├── data/profiles/
│   ├── _template.json
│   ├── nanzhi84.json
│   └── zhangsan.json
├── public/
│   ├── app.js
│   ├── favicon.svg
│   ├── index.html
│   └── styles.css
├── scripts/
│   ├── validate-contributors.js
│   ├── state-builder.js
│   └── build-static-site.js
├── server.js
├── package.json
└── README.md
```

---

## 许可证

MIT
