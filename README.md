# Open Source Pulse Wall

一个课堂上可以完成的 Git 开源贡献小项目。学生通过 Fork、Clone、Branch、Commit、Push、Pull Request 完成第一次开源贡献。老师运行本地实时看板后，只要 `data/profiles` 里的贡献者文件发生变化，页面会自动刷新并给出校验反馈。

新版前端采用手绘高级极简风格，包含纸张质感、铅笔线条、贡献者卡片、实时活动流、Profile Builder 和 JSON 预览，适合直接投影到课堂上使用。

## 这个项目适合讲什么

这套仓库覆盖一节 Git 课最核心的动线：

```text
Fork -> Clone -> Branch -> Edit -> Validate -> Commit -> Push -> Pull Request -> Review -> Merge -> Pull
```

学生的任务很小：复制一个 JSON 模板，改成自己的信息，提交 PR。项目本身有即时反馈：

1. 浏览器里的 Profile Builder 会即时生成 JSON 和预览卡片。
2. `npm run validate` 会在本地检查字段和 JSON 格式。
3. GitHub Actions 会在 PR 上自动校验。
4. 老师本地运行 `npm start` 后，合并或拉取新 profile 文件时，贡献者墙会实时刷新。

## 老师 3 分钟启动

解压仓库后进入目录：

```bash
cd open-source-pulse-wall
npm start
```

打开：

```text
http://localhost:3000
```

这个项目没有运行时依赖，不需要 `npm install`。只要电脑有 Node.js 18 或更高版本即可。

如果你要把它发布成课堂仓库：

```bash
git init
git add .
git commit -m "Initial classroom project"
git branch -M main
```

然后在 GitHub 新建一个空仓库，把远程地址替换成你的地址：

```bash
git remote add origin https://github.com/YOUR_NAME/open-source-pulse-wall.git
git push -u origin main
```

## 学生贡献流程

先 Fork 老师的仓库，然后 clone 自己的 Fork：

```bash
git clone https://github.com/YOUR_NAME/open-source-pulse-wall.git
cd open-source-pulse-wall
```

添加老师仓库为 upstream，方便同步主仓库：

```bash
git remote add upstream https://github.com/TEACHER_NAME/open-source-pulse-wall.git
```

创建分支：

```bash
git checkout -b add-your-profile
```

复制模板。把 `your-github-id` 换成自己的 GitHub 用户名：

```bash
cp data/profiles/_template.json data/profiles/your-github-id.json
```

编辑新文件，然后校验：

```bash
npm run validate
```

提交并推送：

```bash
git add data/profiles/your-github-id.json
git commit -m "Add my contributor profile"
git push origin add-your-profile
```

最后在 GitHub 页面点击 Compare & pull request。

## profile 文件格式

每位同学只需要新增一个文件。文件路径类似：

```text
data/profiles/yoryon.json
```

内容示例：

```json
{
  "name": "Yoryon",
  "github": "your-github-id",
  "role": "First-time contributor",
  "motto": "今天完成我的第一个开源 PR",
  "stack": ["Git", "Open Source"],
  "city": "Beijing",
  "style": "nature",
  "homepage": ""
}
```

`style` 可以使用这些值：

```text
minimal, nature, sketch, notebook, ink, sage
```

## 实时反馈怎么用

老师在投影电脑上运行：

```bash
npm start
```

页面会监听 `data/profiles` 目录。只要有学生 profile 文件被新增或修改，页面会在 1 秒内刷新。如果 JSON 写错，页面会显示具体错误，并保留上一次有效的贡献者墙。

典型课堂演示：

```bash
git pull origin main
```

合并后的新贡献者文件进入本地目录，投影上的贡献者墙会自动点亮新的卡片。

## GitHub Actions 自动检查

仓库里已经包含 `.github/workflows/validate.yml`。学生发起 PR 后，GitHub 会自动运行：

```bash
npm run validate
```

如果字段缺失、JSON 解析失败、GitHub 用户名格式不正确，PR 页面会出现失败提示。这样学生能马上知道自己的贡献是否合格。

## 可选冲突练习

这个项目默认使用“一人一个 JSON 文件”，这样课堂成功率更高。讲冲突时可以临时增加一个练习：

1. 新建 `data/conflict-lab.txt`。
2. 让几位同学都改同一行。
3. 合并 PR 时展示冲突。
4. 讲解 `<<<<<<<`, `=======`, `>>>>>>>` 的含义。

也可以让学生同步主仓库：

```bash
git fetch upstream
git checkout main
git merge upstream/main
git checkout add-your-profile
git rebase main
```

## 课堂建议节奏

第 1 阶段，10 分钟：老师演示 Fork、Clone、Branch。

第 2 阶段，15 分钟：学生用 Profile Builder 生成 JSON，提交自己的分支。

第 3 阶段，15 分钟：学生互相 review PR，老师合并一批 PR，投影展示实时墙更新。

第 4 阶段，10 分钟：挑选一个格式错误的 PR 讲 GitHub Actions，挑选一个冲突练习讲解决冲突。

## 文件结构

```text
open-source-pulse-wall/
├── .github/workflows/validate.yml
├── data/profiles/
│   ├── _template.json
│   ├── github.json
│   └── octocat.json
├── public/
│   ├── app.js
│   ├── favicon.svg
│   ├── index.html
│   └── styles.css
├── scripts/validate-contributors.js
├── server.js
├── package.json
├── CONTRIBUTING.md
└── README.md
```

## 许可证

MIT
