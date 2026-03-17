# 更新日志

本项目的所有显著更改都将记录在此文件中。

## [Unreleased]

## [1.2.2] - 2026-03-17

### 新增
 - 在 GitHub 发布正文中包含双语内容

## [1.2.1] - 2026-03-17

### 新增
 - package.json 版本更改时自动触发发布
 - 完成本地化，修复注销安全，并解决最终审核意见（PR #31）
 - 任务和系统设置的完整本地化（PR #31）
 - 主仪表板视图的完整本地化（主页、内存、令牌、设置）（PR #31）
 - 实施国际化基础设施和基本中文翻译（PR #31）

 ### 修复
 - 解决持续的 gitlink 警告（PR #31）
 - 从索引中删除顽固的嵌入式 gitlink (PR #31)
 - 永久删除嵌入的 git 存储库引用（PR #31）
 - 删除意外的 gitlink 并恢复干净的工作目录（PR #31）

## [1.2.0] - 2026-03-16

### 新增
- **成本控制中心**：用于监控和优化令牌消耗的全方位仪表板。
- **优化器服务**：基于 WebSocket 的智能流程，支持历史记录和撤销操作，有效降低成本。
- **诊断服务**：实时识别高成本模式并提供可操作的效率优化建议。
- 新增用于成本可视化和时间线详情的交互式界面组件。

### 修复
- 增强了优化器中 WebSocket 的可靠性。
- 改进了诊断处理逻辑和用户反馈清晰度。
- 优化了仪表板中的成功提示语。

## [1.1.4] - 2026-03-13

 ### 修复
 - 短路不支持的运行时路径
 - 明确暴露 cron 不可用
 - 加强限制端点处理
 - 对齐不支持的监视器字段
 - 澄清不支持的仪表板状态
 - 实现 IS_DOCKER 检测并禁用主机执行

## [1.1.3] - 2026-03-10

 ### 新增
 - Docker 镜像支持：添加了 `Dockerfile`、`.dockerignore` 和 CI 工作流程，用于自动将镜像发布到 GitHub 容器注册表 (#24)（感谢 @ForceConstant 在问题 #24 中的贡献和建议）
 - README 中的 Docker 使用说明

 ### 修复
 - 将 --token 和其他 CLI 参数从 install.sh 传播到 setup.sh (PR #26)

## [1.1.1] - 2026-02-26

 ### 新增
 - **完整 macOS 支持**：ClawBridge 现已正式与 macOS（Intel/Apple Silicon）兼容。 
- **服务管理（Launchd）**：通过“.plist”代理支持 macOS“launchd”，以实现后台执行和自动重启。 
- **跨平台 CI**：自动化测试和 lint 现在可验证 Linux 和 macOS 上的稳定性。 

### 修复
 - **网络兼容性**：通过实施多重回退逻辑（“ip 路由”->“主机名”->“ifconfig”）解决了“主机名 -I”的问题，确保 Alpine Linux、WSL 和 macOS 上的可靠性。 （特别感谢[@StewartLi666](https://x.com/StewartLi666)的反馈）
 - **Sed 兼容性**：修复了 GNU/Linux 和 BSD/macOS 之间由 `sed -i` 差异引起的脚本错误。 
- **VPN 和网络**：修复了 macOS 的 VPN 接口检测和服务重启逻辑。 
- **快速隧道可靠性**：更新后获取和显示 Cloudflare 快速隧道 URL 时提高了可靠性。 
- **Systemd 日志提示**：更正了 `journalctl` 命令提示以准确反映用户级与系统级服务。 

### 已更改
 - 在 1.1.1 变更日志中添加 PR #16

## [1.1.0] - 2026-02-25

### 新增
 - 解析 git 历史记录以查找变更日志生成中省略的提交
 - 新的全屏登录页面，具有现代用户界面和呼吸背景。 
- 注意旧版魔法链接尝试的覆盖。 
- 暴力保护：每个 IP 每 60 秒最多尝试 10 次登录。 
- 高风险端点的强制确认（`/api/kill`）。 
- 破坏性端点的速率限制。 
- Jest + Supertest 测试套件，包含单元和 API 集成测试。 （感谢 [@yaochao](https://github.com/yaochao) 建议 #7）
- ESLint + Prettier 代码风格强制执行。 （感谢 [@yaochao](https://github.com/yaochao) 建议 #7）
- GitHub Actions CI 工作流程在每次推送时运行测试和 lint。 （感谢 [@yaochao](https://github.com/yaochao) 建议 #7）
 - 将“public/index.html”拆分为单独的“public/css/dashboard.css”和“public/js/dashboard.js”以实现可维护性。 （感谢 [@yaochao](https://github.com/yaochao) 建议 #3） 
- 安装后将仪表板 URL 显示为终端二维码，以便即时移动扫描。 如果可用，则使用“qrencode”CLI，回退到“qrcode-terminal”npm 包，如果两者都不存在，则静默跳过。 （感谢@斯图超哥建议#12）

 ### 修复
 - 安全性：用基于 HttpOnly cookie 的会话替换了 URL 查询身份验证。 （感谢 [@yaochao](https://github.com/yaochao) 报告 #1）
 - 安全性：增加了远程端点的保护措施。 （感谢 [@yaochao](https://github.com/yaochao) 报告#2）
 - Bug：改进了错误处理并删除了静默 catch 块。 （感谢 [@yaochao](https://github.com/yaochao) 报告#4）
 - Bug：删除了硬编码路径以实现更好的环境可移植性。 （感谢 [@yaochao](https://github.com/yaochao) 报告#5）
 - 错误：提高了会话文件丢失时上下文读取的稳定性。 

### 已更改
 - 重构安装程序（`setup.sh`）以删除魔术链接输出以支持安全登录。 
 - 重构：将 index.js 拆分为模块化的 src/ 目录。 （感谢 [@yaochao](https://github.com/yaochao) 建议 #3）
- 将“wget”替换为 Node.js 原生“https”模块以进行二进制下载。 （感谢 [@yaochao](https://github.com/yaochao) 报告#6）
 - 清理未使用的依赖项以减少占用空间。
