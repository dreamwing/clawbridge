# 更新日志

本项目的所有显著更改都将记录在此文件中。

## [Unreleased]

## [1.1.1] - 2026-02-26

### 修复
- 鲁棒的 IP 检测：用弹性的多回退逻辑（`ip route`、`hostname`、`ifconfig`）替换了脆弱的 `hostname -I`，以防止在某些 Linux 发行版（如 Alpine）和 WSL 上出现空 IP 问题。（感谢 @斯图超哥 的反馈）
- 快速隧道刷新：通过在服务重启前清理过时的快速隧道 URL，提高了可靠性，确保正确获取并显示最新的公共 URL。
- Systemd 日志提示：根据安装类型正确区分 `--user` 和系统级 `journalctl` 命令。
- 合并 PR #16 来自 dreamwing/feature/macos-support

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
