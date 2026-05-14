# 发版指南 (Release Workflow)

> 本仓库使用 `CHANGELOG.md` 作为发版唯一事实源。发布流程已与 CI 打通,
> 推送一个符合规范的 git tag,CI 会自动:
> 1. 跨平台构建 (Windows / macOS x64 / macOS arm64 / Linux)
> 2. 从 `CHANGELOG.md` 抽取当前 tag 对应版本块作为 Release body
> 3. 创建 GitHub Release 并上传所有产物
> 4. 同步到 Gitee / WebDAV 镜像 (其他 workflow 自动跟随)

---

## 0. 前置:确保本地工作树干净

```bash
git status            # 应该是 clean,或者只剩本次要发的功能改动
git pull --rebase     # 与远端 main 对齐
```

## 1. 决定版本号

遵循 [SemVer](https://semver.org/lang/zh-CN/):

| 改动类型 | 升级位 | 示例 |
| --- | --- | --- |
| 新增大功能 (向后兼容) | minor | `1.13.0 → 1.14.0` |
| 小修复 / 微优化 | patch | `1.14.0 → 1.14.1` |
| 不兼容改动 (协议变化等) | major | `1.x → 2.0.0` |

## 2. 更新 `package.json` 与 `CHANGELOG.md`

### `package.json`

```jsonc
{
  "version": "1.14.0"   // 改成新版本
}
```

### `CHANGELOG.md`

在**文件顶部** (`---` 标记之后) 插入新版本块,格式必须严格遵守:

```markdown
## [v1.14.0] - 2026-05-15 · 一句话主题 ✨

简短的介绍段落 (1-3 句)。

### ✨ 新增 / 🔧 优化 / 🐛 修复
- 功能点 1 (含入口路径: 设置 → XXX)
- 功能点 2
```

**关键规则:**

- 标题必须是 `## [vX.Y.Z]` 开头,方括号里写 tag 名(`v` 开头),与 git tag 完全一致。
  CI 用正则 `[$TAG_NAME]` 匹配,**漏了方括号或大小写不一致都会回退到 commit message**。
- 文档底部的链接引用 `[v1.14.0]: https://github.com/...` 也要补上。
- 内容写给**终端用户**看 —— 描述功能与入口,避免一堆 `refactor()` 之类提交术语。

### 本地预览 Release body

```bash
yarn release:preview v1.14.0
# 或
bash scripts/preview-release-notes.sh v1.14.0
```

输出应该是你将看到的 GitHub Release 正文 (也是软件内"检查更新"弹窗的更新说明)。

## 3. 提交 + 打 tag + 推送

```bash
# 一个提交把 package.json + CHANGELOG.md + 本次功能改动一起带上
git add -A
git commit -m "release: v1.14.0"

# 推主分支
git push origin main

# 打 annotated tag —— 这一步触发 CI
git tag -a v1.14.0 -m "v1.14.0"
git push origin v1.14.0

# 同步推 gitee 镜像 (如果有)
git push gitee main
git push gitee v1.14.0
```

## 4. 等 CI 跑完

打开 [GitHub Actions](https://github.com/timeshiftsauce/CeruMusic/actions) 看 `AutoBuild` 工作流:

- 4 个矩阵节点 (`windows-latest` / `macos-15-intel` / `macos-latest` / `ubuntu-latest`)
  各自构建并上传产物
- 每个节点会跑 "Extract changelog section" 步骤,日志里能看到 body preview
- Release 步骤把产物与 body 一起发布到 GitHub Releases

打开 [Releases](https://github.com/timeshiftsauce/CeruMusic/releases) 确认:

- ✅ Release body 是 `CHANGELOG.md` 里抽取的内容
- ✅ 产物齐全 (Windows `.exe` + `.blockmap`, macOS `.dmg`+`.zip` 双架构, Linux `.AppImage` 等)
- ✅ `latest.yml` / `latest-mac.yml` / `latest-linux.yml` 存在 —— 软件自动更新依赖这些文件

## 5. 出错怎么办

### CI 失败

修复后:

```bash
# 删本地 + 远端 tag
git tag -d v1.14.0
git push origin :refs/tags/v1.14.0

# (如果你已经修了 commit) 强推 main
git push origin main --force-with-lease

# 重打 tag,CI 会再跑一次
git tag -a v1.14.0 -m "v1.14.0"
git push origin v1.14.0
```

### Release body 错了

最简单:在 GitHub Releases 页面手动点 Edit 改 body。或者:

1. 在 GitHub 上删 Release
2. 在 `CHANGELOG.md` 里修内容,本地 commit 但**不要 amend** (历史已发出去了)
3. 删 tag、重推 tag,CI 重跑会用新的 changelog

---

## CI 抽取逻辑细节

`.github/workflows/main.yml` 的 `Extract changelog section` 步骤用 awk 抽取:

```bash
awk -v tag="$TAG_NAME" '
  BEGIN { in_block = 0 }
  /^## \[/ {
    if (in_block) { exit }
    if (index($0, "[" tag "]") > 0) { in_block = 1; next }
  }
  in_block { print }
' CHANGELOG.md
```

含义:
- 扫描每一行,遇到 `## [` 开头的标题行
- 如果当前不在块内,且这个标题包含 `[<tag>]`,从下一行开始进入"打印模式"
- 再次遇到 `## [` 开头的行 → 退出 (上一个版本块结束)
- 中间所有内容原样输出

如果 `CHANGELOG.md` 缺失或抽不出对应版本,自动回退到 `git log -1 --pretty=%B`
(最新 commit message)。
