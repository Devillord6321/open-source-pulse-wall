# Contributing Guide

欢迎加入 Open Source Pulse Wall。你只需要提交一个自己的 profile 文件，就能完成一次完整的开源贡献流程。

## 贡献步骤

1. Fork 本仓库。
2. Clone 你的 Fork。
3. 创建一个新分支。
4. 复制 `data/profiles/_template.json`。
5. 将文件命名为 `data/profiles/你的github用户名.json`。
6. 修改里面的个人信息。
7. 运行 `npm run validate`。
8. Commit、Push、发起 Pull Request。

## 推荐命令

```bash
git checkout -b add-your-profile
cp data/profiles/_template.json data/profiles/your-github-id.json
npm run validate
git add data/profiles/your-github-id.json
git commit -m "Add my contributor profile"
git push origin add-your-profile
```

## 格式要求

每个 profile 文件必须是一个 JSON 对象：

```json
{
  "name": "你的名字",
  "github": "your-github-id",
  "role": "First-time contributor",
  "motto": "今天完成我的第一个开源 PR",
  "stack": ["Git", "Open Source"],
  "city": "Beijing",
  "style": "nature",
  "homepage": ""
}
```

字段说明：

| 字段 | 是否必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 你的名字或昵称，最多 40 个字符 |
| `github` | 是 | GitHub 用户名 |
| `role` | 是 | 你的角色，最多 50 个字符 |
| `motto` | 是 | 一句话宣言，最多 120 个字符 |
| `stack` | 是 | 技术标签数组，最多 5 项 |
| `city` | 否 | 城市或课堂位置 |
| `style` | 否 | 卡片风格，可选 `minimal`, `nature`, `sketch`, `notebook`, `ink`, `sage` |
| `homepage` | 否 | 个人主页链接 |

## PR 检查清单

提交前请确认：

1. 文件放在 `data/profiles` 目录下。
2. 文件名使用你的 GitHub 用户名，例如 `data/profiles/octocat.json`。
3. `npm run validate` 可以通过。
4. 只提交自己的 profile 文件，不修改别人的信息。
5. Commit message 清楚，例如 `Add my contributor profile`。
