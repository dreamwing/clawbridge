const translations = {
    en: {
        // App Title
        app_name: "ClawBridge",
        app_tagline: "Mobile-first mission control for OpenClaw agents.",
        about_desc: "ClawBridge is the mobile-first dashboard for your AI Agent runtime.<br>Designed for monitoring, cost tracking, and task management.",
        
        // Navigation / Tabs
        tab_status: "Home",
        tab_logs: "Logs",
        tab_usage: "Tokens",
        tab_jobs: "Missions",
        tab_scripts: "Scripts",
        tab_memory: "Memory",
        tab_settings: "Settings",

        // Legend
        legend_title: "Activity Legend",
        legend_tool: "Tool Call",
        legend_tool_desc: "External actions (search, exec, write)",
        legend_thinking: "Thinking",
        legend_thinking_desc: "AI reasoning & planning process",
        legend_script: "Script",
        legend_script_desc: "Background automation (Cron jobs)",
        legend_file: "File IO",
        legend_file_desc: "Workspace file creation or updates",
        legend_system: "System",
        legend_system_desc: "High CPU or resource alerts",
        legend_note: "Note: Monitoring polls every 3 seconds to minimize CPU usage. Extremely short-lived scripts (<3s) may not be captured in real-time logs.",

        // Global Actions
        refresh: "Refresh",
        loading: "Loading...",
        connecting: "Connecting...",
        connected: "Connected",
        disconnected: "Disconnected",
        retry: "Retry",
        btn_retry: "Retry",

        // Status states
        status_live: "● Live",
        status_busy: "● Busy",
        status_idle: "● Idle",
        status_error: "● Error",

        // Settings
        lang_label: "Language",
        lang_en: "English",
        lang_zh: "Chinese",
        logout: "Logout",
        access_key: "Access Key",
        version: "ClawBridge Version",
        danger_zone: "Danger Zone",
        restart_gateway: "Restart Gateway Service",
        kill_all: "Emergency Stop All Scripts",
        about: "About",
        env: "Environment",
        server_tz: "Server Timezone",
        oc_core: "OpenClaw Core",
        cb_source: "ClawBridge Source",
        view_github: "View GitHub",
        gateway_stopped: "Stopped / Not Found",
        
        // Common Labels
        ram: "RAM",
        disk: "Disk",
        uptime: "Uptime",
        model: "Model",
        tokens: "Tokens",
        cost: "Cost",
        actions: "Actions",
        show_all: "Show all",
        show_less: "Show less",
        unit_per_month: "/mo",

        // New Status / Home Entries
        sys_status: "System Status",
        cpu_load: "CPU Load",
        live_activity: "LIVE ACTIVITY",
        memory_timeline: "Memory Timeline",
        today: "Today",
        btn_prev: "← Previous",
        btn_next: "Next →",

        // Token Economy
        token_economy: "Tokens Analysis",
        total_label: "Total",
        today_cost: "Today's Cost",
        est_monthly: "Est. Monthly",
        cache_hit: "Cache Hit",
        last_updated: "LAST UPDATED",
        recalc_note: "System automatically recalculates every hour.",
        input_read: "INPUT (READ)",
        output_write: "OUTPUT (WRITE)",
        cost_trend: "COST TREND (7 DAYS)",
        top_models: "TOP MODELS",
        detail_in: "Input",
        detail_out: "Output",
        detail_cache_r: "Cache R",
        detail_cache_w: "Cache W",

        // Memory
        memory_loading: "Accessing agent memories...",
        memory_empty: "No memory records found for this date.",
        memory_failed: "Failed to load memory.",

        // Missions & Control
        mission_control: "Mission Control",
        no_jobs: "No jobs found",
        confirm_run: "Execute task?",
        run_failed: "Failed to run job.",
        confirm_kill_all: "⚠️ STOP ALL SCRIPTS?",
        stop_failed: "Failed to stop scripts.",
        confirm_restart: "♻️ RESTART GATEWAY?",
        restart_failed: "Failed to restart gateway.",
        schedule_manual: "Manual",

        // Scripts/Status
        scripts_running: "Running",
        scripts_none: "No scripts running",
        docker_unavailable: "Unavailable in Docker Mode",

        // Optimizer
        opt_system_optimized: "System Optimized",
        opt_efficient_desc: "Token usage is highly efficient.",
        opt_btn_history: "History",
        opt_title: "Optimization Scanner",
        opt_desc: "Scanning for wasteful agent behaviors...",
        opt_btn_apply: "Apply",
        opt_btn_skip: "Skip",
        opt_btn_undo: "Undo",
        opt_impact: "Impact",
        opt_savings: "Monthly Savings",
        opt_no_data: "No usage data yet.",
        opt_preventative: "Preventative",
        opt_skipped_title: "Skipped Recommendations",
        opt_toggle_view: "Toggle View",
        opt_side_effect: "Side Effect",
        opt_tech_details: "Technical Details",
        opt_btn_restore: "Restore",
        opt_btn_confirm: "Confirm?",
        opt_btn_applying: "Applying...",
        opt_btn_applied: "Applied",
        opt_btn_disable: "Disable",
        opt_action_singular: "action",
        opt_action_plural: "actions",
        opt_implemented_title: "Implemented Optimizations",
        opt_manual_action: "Manual Action Required",
        opt_history_title: "Recent Optimizations",
        opt_toast_applied: "Optimization Applied",
        opt_toast_failed: "Operation Failed",
        opt_toast_undone: "Optimization Reverted",
        opt_toast_skipped: "Recommendation Skipped",
        opt_toast_restored: "Recommendation Restored",
        opt_analyzing: "Analyzing Usage Patterns",
        opt_current: "Current",
        opt_optimized: "Optimized",
        opt_actions_found: "Cost-Saving Actions Found",
        opt_actions_available: "action(s) available",
        opt_tap_to_save: "Tap to save",
        opt_tap_to_review: "Tap to review & protect.",
        opt_no_data_title: "No usage data yet.",
        opt_no_data_desc: "Start chatting with your AI agent, then come back to see Token cost analysis and savings.",
        opt_btn_optimize: "Optimize",
        opt_no_history: "No optimization history yet.",
        opt_toast_undoing: "Reverting optimization...",
        opt_step_reading: "Reading history...",
        opt_step_calculating: "Calculating tokens...",
        opt_step_checking: "Checking models...",
        opt_step_referencing: "Cross-referencing config...",
        opt_step_finalizing: "Finalizing measures...",
        opt_your_choice: "your choice",
        hist_saved: "saved",
        hist_undo: "Undo",
        hist_undo_unavailable: "Undo unavailable due to newer changes.",
        hist_restore_skills: "Restore Skills",
        hist_undoing: "Reverting...",

        // Skill Audit
        opt_audit_summary: "{n} skills selected for removal.",
        opt_audit_none_selected: "No skills selected for removal.",
        opt_audit_btn_keep_all: "Keep All",
        opt_audit_btn_remove_all: "Remove Selected",
        opt_audit_group_suggested: "Suggested Removal",
        opt_audit_group_manual: "Manual Review",
        opt_audit_choice_remove: "Remove",
        opt_audit_choice_keep: "Keep",
        opt_restore_title: "Restore Removed Skills",
        opt_restore_btn: "Restore Selected",
        undo_skill_desc: "Select skills to restore from this backup. Keep checked to restore all.",

        // Login
        login_title: "Secure Dashboard Login",
        login_key_placeholder: "Access Key",
        login_btn: "Sign In",
        login_verifying: "Verifying Identity...",
        login_error_invalid: "Invalid Access Key",
        login_error_network: "Connection lost. Check your network.",
        login_magic_notice: "⚠️ For security reasons, this version of ClawBridge no longer supports direct Magic Link access. Please enter your Access Key manually.",

        // Modals
        modal_cloudflare_title: "Configure Permanent Link",
        modal_cloudflare_desc: "To keep your URL fixed, you need a Cloudflare Tunnel Token.",
        modal_token_find: "Where to find your Token?",
        modal_token_step1: "1. Go to Cloudflare Dash > Networking > Tunnels.",
        modal_token_step2: "2. Create a tunnel, choose 'Docker' (easiest to copy) or your OS, and grab the token string (starts with 'ey...').",
        modal_token_step3: "3. After install, go to Public Hostname in your Tunnel settings and map your domain to localhost:3000.",
        modal_option_agent: "Option 1: Ask your Agent",
        modal_option_agent_desc: "Send this message to the chat: 'Connect this session to my Cloudflare Tunnel token: YOUR_TOKEN'",
        modal_fix_url_msg: "Run this command to fix my dashboard URL:",
        modal_option_terminal: "Option 2: Terminal Command",
        modal_update_title: "Update Available",
        modal_update_desc: "A new version of ClawBridge is ready.",
        modal_update_agent: "Option 1: Ask Agent",
        modal_update_agent_desc: "Send: 'Update ClawBridge to the latest version'",
        modal_update_terminal: "Option 2: Terminal",
        modal_btn_cancel: "Cancel",
        modal_btn_select_all: "Select All",
        modal_btn_clear_all: "Clear All",
        modal_btn_skip: "Skip this version",

        // Alerts
        alert_new_ver: "New Version Available:",
        alert_tap_update: "Tap here to Update",
        alert_temp_session: "Temporary Session:",
        alert_temp_desc: "This URL will expire on restart.",
        alert_tap_permanent: "Tap here to configure a Permanent Domain",

        // Error Messages
        auth_failed: "Authentication Failed. Redirecting...",
        err_load_tokens: "Failed to load token stats",
        err_load_diagnostics: "Failed to load diagnostics",
        err_load_history: "Failed to load optimization history",
        err_generic: "An error occurred. Please try again.",
        hist_moved_to_backup: "Moved to backup: {n}",
        hist_restored_keys: "Restored {n} keys",
        hist_restored_skills: "Restored {n} skills",
        hist_restored_from: "from {f}",
        hist_concise_soul: "Added concise mode to SOUL.md",
        'A01_title': "Downgrade AI Model",
        'A01_desc': "Primary usage is on a premium model. Switching to a cheaper alternative saves significant costs.",
        'A01_help': "AI models come in different tiers. Premium models are smarter but cost more per message. This switches to a model that's almost as good but significantly cheaper.",
        'A01_side_effect': "Mild decrease in performance on highly complex reasoning tasks.",
        'A02_title': "Adjust Heartbeat Interval",
        'A02_desc': "Reducing heartbeat (background checking) frequency saves tokens.",
        'A02_help': "'Heartbeat' is the AI's background refresh. Just like your phone syncing email in the background, every check consumes a few tokens. Lowering the frequency reduces wake-ups, saving significant idle costs by extending 'deep sleep'.",
        'A02_side_effect': "Longer intervals delay cross-agent message delivery.",
        'A02_opt_disable': "Disable",
        'A02_opt_30m': "Every 30m",
        'A02_opt_1h': "Every 1h",
        'A02_opt_2h': "Every 2h",
        'A02_opt_4h': "Every 4h",
        'A02_opt_6h': "Every 6h",
        'A02_opt_12h': "Every 12h",
        'A02_opt_24h': "Every 24h",
        'A03_title': "Reduce Session Resets",
        'A03_desc': "Continuing existing conversations instead of starting new ones saves input tokens.",
        'A03_help': "Every new conversation loads the full system prompt and context from scratch. Continuing an existing conversation reuses what's already loaded, saving input tokens.",
        'A03_side_effect': "Longer conversations may eventually need compaction.",
        'A04_title': "Audit Possibly Inactive Skills",
        'A04_desc': "Removing unused skills reduces the system prompt size.",
        'A04_help': "This is a heuristic audit based on file activity, not a true skill usage log. Checked skills will be removed, unchecked skills will be kept. Use it to review which installed skills still look worth keeping loaded.",
        'A04_side_effect': "Removed Skills will no longer be available until re-installed.",
        'A05_title': "Reduce Thinking Overhead",
        'A05_desc': "Making the AI think less before answering reduces internal reasoning tokens.",
        'A05_help': "AI models can \"think\" before responding — like showing their work on a math problem. This uses extra tokens. Minimal mode skips most internal reasoning to save costs.",
        'A05_side_effect': "May reduce mathematical or logical accuracy on hard prompts.",
        'A06_title': "Enable Prompt Caching",
        'A06_desc': "Turning on memory for repeated prompts saves up to 90% in input costs.",
        'A06_help': "Every round of conversation sends repetitive \"instructions\" to the AI. Caching is like providing the AI with high-speed bookmarks, allowing it to quickly retrieve previously read content without charging you to read it again.",
        'A06_side_effect': "First message per session remains full price.",
        'A07_title': "Enable Compaction Safeguard",
        'A07_desc': "Auto-trim long conversations to save money and prevent billing shock.",
        'A07_help': "Extremely long conversations can generate massive bills. Automatic compaction acts as a \"fuse,\" truncating and summarizing history before costs spiral out of control, preventing unexpected charges for tens of thousands of tokens.",
        'A07_side_effect': "May truncate history during massive code translation sessions.",
        'A09_title': "Reduce Output Verbosity",
        'A09_desc': "Asking the AI to give shorter answers saves output token costs.",
        'A09_help': "AI responses include explanations, examples, and formatting. \"Concise mode\" tells the AI to skip the fluff and give direct answers — saving output tokens.",
        'A09_side_effect': "Responses become visibly shorter.",
        'A11_title': "Set Daily Budget Limit",
        'A11_desc': "Protect your wallet against runaway AI tasks.",
        'A11_help': "Highly recommended for all users. Even if budget is not an issue, a daily $5 limit protects your wallet if an agent enters an infinite reasoning loop.",
        'A11_side_effect': "Operations will be blocked once the limit is reached.",

        // Time & Units
        time_s_ago: "{n}s ago",
        time_m_ago: "{n}m ago",
        time_h_ago: "{n}h ago",
        time_d_ago: "{n}d ago",
        time_just_now: "just now",
        time_never: "never",
        time_in_m: "({n}m later)",
        time_in_h: "({n}h later)",
        time_every_m: "Every {n} min",
        time_every_h: "Every {n} hour",
        unit_tasks: "task(s)",
        unit_tok_run: "tok/run",
        unit_agg_runs_mo: "aggregated runs/mo",
    },
    zh: {
        // App Title
        app_name: "ClawBridge",
        app_tagline: "行動優先 OpenClaw Agent 任務控制中心。",
        about_desc: "ClawBridge 是行動優先 AI Agent 運行環境儀表板。<br>專為監控、成本追蹤和任務管理而設計。",
        
        // Navigation / Tabs
        tab_status: "主頁",
        tab_logs: "日誌",
        tab_usage: "成本",
        tab_jobs: "任務",
        tab_scripts: "腳本",
        tab_memory: "記憶",
        tab_settings: "設定",

        // Legend
        legend_title: "活動圖例",
        legend_tool: "工具呼叫",
        legend_tool_desc: "外部操作 (搜尋、執行、寫入)",
        legend_thinking: "思考中",
        legend_thinking_desc: "AI 推理與規劃過程",
        legend_script: "腳本",
        legend_script_desc: "後台自動化 (计划任務)",
        legend_file: "檔案 IO",
        legend_file_desc: "工作區檔案建立或更新",
        legend_system: "系統",
        legend_system_desc: "高 CPU 或資源警報",
        legend_note: "注：监测每 3 秒轮询一次以最小化 CPU 佔用。運行時間极短的腳本（<3秒）可能无法在即時日誌中被捕捉到。",

        // Global Actions
        refresh: "重新整理",
        loading: "載入中...",
        connecting: "連線中...",
        connected: "已連線",
        disconnected: "已斷線",
        retry: "重試",
        btn_retry: "重試",

        // Status states
        status_live: "● 上線",
        status_busy: "● 繁忙",
        status_idle: "● 閒置",
        status_error: "● 錯誤",

        // Settings
        lang_label: "語言",
        lang_en: "English",
        lang_zh: "中文",
        logout: "登出",
        access_key: "存取金鑰",
        version: "ClawBridge 版本",
        danger_zone: "危險區域",
        restart_gateway: "重新啟動網關服務",
        kill_all: "紧急停止所有腳本",
        about: "关于",
        env: "執行環境",
        server_tz: "伺服器時區",
        oc_core: "OpenClaw 核心",
        cb_source: "ClawBridge 原始碼",
        view_github: "檢視 GitHub",
        gateway_stopped: "已停止 / 未發現",
        
        // Common Labels
        ram: "記憶體",
        disk: "磁碟",
        uptime: "運行時間",
        model: "模型",
        tokens: "執行",
        cost: "成本",
        actions: "操作",
        show_all: "顯示全部",
        show_less: "收合",
        unit_per_month: "/月",

        // New Status / Home Entries
        sys_status: "系統状态",
        cpu_load: "CPU 負載",
        live_activity: "即時活動",
        memory_timeline: "記憶时间轴",
        today: "今天",
        btn_prev: "← 上一頁",
        btn_next: "下一頁 →",

        // Token Economy
        token_economy: "成本分析",
        total_label: "總計",
        today_cost: "今日成本",
        est_monthly: "月度預估",
        cache_hit: "快取命中",
        last_updated: "最後更新",
        recalc_note: "系統每小时自动重新计算。",
        input_read: "輸入 (讀)",
        output_write: "輸出 (寫)",
        cost_trend: "成本趨勢 (7天)",
        top_models: "熱門模型",
        detail_in: "输入",
        detail_out: "输出",
        detail_cache_r: "快取讀",
        detail_cache_w: "快取寫",

        // Memory
        memory_loading: "正在调取 Agent 記憶...",
        memory_empty: "未找到该日期的記憶记录。",
        memory_failed: "記憶加载失败。",

        // Missions & Control
        mission_control: "任務控制台",
        no_jobs: "未找到任務",
        confirm_run: "执行任務？",
        run_failed: "執行失敗。",
        confirm_kill_all: "⚠️ 停止所有腳本？",
        stop_failed: "停止失敗。",
        confirm_restart: "♻️ 重新啟動網關？",
        restart_failed: "重新啟動失敗。",
        schedule_manual: "手動",

        // Scripts/Status
        scripts_running: "執行中",
        scripts_none: "暂无執行中的腳本",
        docker_unavailable: "Docker 模式下無法使用",

        // Optimizer
        opt_system_optimized: "系統已优化",
        opt_efficient_desc: "執行使用效率极高。",
        opt_btn_history: "歷史記錄",
        opt_title: "優化掃描器",
        opt_desc: "正在掃描低效的代理行為...",
        opt_btn_apply: "套用",
        opt_btn_skip: "跳過",
        opt_btn_undo: "復原",
        opt_impact: "影響",
        opt_savings: "月度節省",
        opt_no_data: "暫無使用資料。",
        opt_preventative: "預防性",
        opt_skipped_title: "已跳過的建议",
        opt_toggle_view: "切換視圖",
        opt_side_effect: "副作用",
        opt_tech_details: "技術細節",
        opt_btn_restore: "復原",
        opt_btn_confirm: "确定?",
        opt_btn_applying: "套用中...",
        opt_btn_applied: "已套用",
        opt_btn_disable: "完全停用",
        opt_action_singular: "",
        opt_action_plural: "",
        opt_implemented_title: "已套用的优化",
        opt_manual_action: "需要手動操作",
        opt_history_title: "最近的優化",
        opt_toast_applied: "优化已套用",
        opt_toast_failed: "操作失敗",
        opt_toast_undone: "优化已復原",
        opt_toast_skipped: "已跳過建议",
        opt_toast_restored: "已復原建议",
        opt_analyzing: "分析使用模式中",
        opt_current: "當前",
        opt_optimized: "優化後",
        opt_actions_found: "發現可節省成本的操作",
        opt_actions_available: "項操作待處理",
        opt_tap_to_save: "點擊以每月節省",
        opt_tap_to_review: "点击以查看并保护系統。",
        opt_no_data_title: "無使用資料",
        opt_no_data_desc: "開始與 AI 代理對話，稍後再回來查看成本分析和節省建議。",
        opt_btn_optimize: "立即優化",
        opt_no_history: "暫無優化歷史。",
        opt_toast_undoing: "正在復原优化...",
        opt_step_reading: "读取歷史記錄中...",
        opt_step_calculating: "计算執行消耗中...",
        opt_step_checking: "核對模型設定中...",
        opt_step_referencing: "交叉引用設定中...",
        opt_step_finalizing: "最終量化評估中...",
        opt_your_choice: "自訂",
        hist_saved: "已節省",
        hist_undo: "復原",
        hist_undo_unavailable: "由于存在更新的配置变更，无法復原。",
        hist_restore_skills: "還原技能",
        hist_undoing: "正在復原...",

        // Skill Audit
        opt_audit_summary: "已選擇 {n} 個待移除技能。",
        opt_audit_none_selected: "未選擇待移除技能。",
        opt_audit_btn_keep_all: "全部保留",
        opt_audit_btn_remove_all: "移除已選",
        opt_audit_group_suggested: "建議移除",
        opt_audit_group_manual: "需手動核对",
        opt_audit_choice_remove: "移除",
        opt_audit_choice_keep: "保留",
        opt_restore_title: "復原已移除的技能",
        opt_restore_btn: "復原所选技能",
        undo_skill_desc: "请选择要从该备份中復原的技能。保留勾选以全部復原。",

        // Optimizer Action Mappings
        'A01_title': "切換到更便宜的 AI 模型",
        'A01_desc': "主要使用量集中在旗艦模型。切換為小型模型可顯著降低成本。",
        'A01_help': "AI 模型分為不同的層級。旗艦模型更聰明，但每條訊息的成本更高。此操作將切換到幾乎同樣出色但價格顯著降低的模型。",
        'A01_side_effect': "在高度复杂的推理任務中性能可能略有下降。",
        'A02_title': "降低心跳偵測頻率",
        'A02_desc': "降低后台检测频率可减少執行消耗。",
        'A02_help': "“心跳”是 AI 的后台重新整理机制。就像您的手机在后台同步电子邮件一样，每一次检查都会消耗少量執行。降低频率可以减少唤醒次数，通过延长“深度睡眠”时间来节省大量的闲置成本。",
        'A02_side_effect': "較長的間隔會延遲跨代理的訊息投遞。",
        'A02_opt_disable': "完全停用",
        'A02_opt_30m': "每 30 分鐘",
        'A02_opt_1h': "每 1 小時",
        'A02_opt_2h': "每 2 小時",
        'A02_opt_4h': "每 4 小時",
        'A02_opt_6h': "每 6 小時",
        'A02_opt_12h': "每 12 小時",
        'A02_opt_24h': "每 24 小時",
        'A03_title': "繼續現有對話",
        'A03_desc': "重用上下文而非启动新会话可节省输入執行。",
        'A03_help': "每一个新对话都会从头加载完整的系統提示词和上下文。繼續現有對話可以重用已加载的内容，节省输入執行。",
        'A03_side_effect': "較長的對話最終可能需要進行壓縮處理。",
        'A04_title': "審計可能閒置的技能",
        'A04_desc': "移除未使用的技能可减小系統提示词体积。",
        'A04_help': "这是一个基于文件活动的启发式审计，而非真实的技能使用日誌。选中的技能将被移除，未选中的将保留。利用此功能检查已安装的技能中哪些仍值得保留。",
        'A04_side_effect': "移除的技能在重新安裝前將無法使用。",
        'A05_title': "減少 AI 思考開銷",
        'A05_desc': "启用最小思考模式可减少内部推理執行。",
        'A05_help': "AI 模型在回答之前可以进行“思考”——就像在数学题上展示解题步骤。这会消耗额外的執行.最小模式跳過大部分内部推理以节省成本。",
        'A05_side_effect': "可能會降低處理難題時的數學或邏輯準確性。",
        'A06_title': "開啟提示詞快取",
        'A06_desc': "快取重複提示詞可節省高達 90% 的輸入成本。",
        'A06_help': "每一轮对话都会向 AI 发送重复的“指令”。缓存就像为 AI 提供高速书签，让它快速检索以前读过的内容，而不需要再次付费读取。",
        'A06_side_effect': "每個會話的第一條訊息仍按原價計算。",
        'A07_title': "啟用自動壓縮保護",
        'A07_desc': "自動裁剪長對話以防止帳單失控。",
        'A07_help': "极长的对话可能会产生巨额账单。自动压缩充当“保险丝”，在成本失控之前截断并总结歷史記錄，防止产生意外的高额费用。",
        'A07_side_effect': "在大规模代码翻译过程中可能会截断歷史記錄。",
        'A09_title': "要求 AI 言簡意賅",
        'A09_desc': "缩短回复内容可节省输出執行成本。",
        'A09_help': "AI 的回复包括解释、示例和格式化。“简洁模式”告诉 AI 跳過虚饰，直接给出答案——节省输出執行。",
        'A09_side_effect': "回覆內容會明顯變短。",
        'A11_title': "設定每日预算上限",
        'A11_desc': "为钱包加锁，防止 AI 任務失控产生高额费用。",
        'A11_help': "强烈建议所有用户开启。即使预算充足，設定每日 $5.00 的上限也可以在 Agent 陷入无限推理循环时保护您的财产安全。",
        'A11_side_effect': "达到上限后，所有操作将被暂时拦截。",

        // Time & Units
        time_s_ago: "{n}秒前",
        time_m_ago: "{n}分鐘前",
        time_h_ago: "{n}小時前",
        time_d_ago: "{n}天前",
        time_just_now: "剛剛",
        time_never: "從未",
        time_in_m: "({n}分鐘後)",
        time_in_h: "({n}小時後)",
        time_every_m: "每 {n} 分鐘",
        time_every_h: "每 {n} 小時",
        unit_tasks: "个任務",
        unit_tok_run: "執行/執行",
        unit_agg_runs_mo: "月度累計執行次數",

        // Login
        login_title: "儀表板安全登入",
        login_key_placeholder: "存取金鑰",
        login_btn: "登录",
        login_verifying: "身份驗證中...",
        login_error_invalid: "无效的存取金鑰",
        login_error_network: "连接已斷線，请检查网络。",
        login_magic_notice: "⚠️ 出于安全考虑，此版本的 ClawBridge 不再支持魔法链接（Magic Link）直接访问。请手動输入存取金鑰。",

        // Modals
        modal_cloudflare_title: "設定永久網域",
        modal_cloudflare_desc: "要保持您的 URL 固定不变，您需要一个 Cloudflare Tunnel Token。",
        modal_token_find: "在哪裡可以找到 Token？",
        modal_token_step1: "1. 前往 Cloudflare 控制台 > Networking > Tunnels。",
        modal_token_step2: "2. 创建一个 Tunnel，选择 'Docker'（最容易复制）或您的系統，获取 Token 字符串（以 'ey...' 开头）。",
        modal_token_step3: "3. 安装后，在 Tunnel 設定中前往 Public Hostname，将您的域名映射到 localhost:3000。",
        modal_option_agent: "方案 1：詢問您的 Agent",
        modal_option_agent_desc: "在聊天中傳送：「將此會話連接到我的 Cloudflare Tunnel token：YOUR_TOKEN」",
        modal_fix_url_msg: "請執行此命令以固定儀表板 URL：",
        modal_option_terminal: "方案 2：終端機命令",
        modal_update_title: "發現新版本",
        modal_update_desc: "新版本的 ClawBridge 已準備就緒。",
        modal_update_agent: "方案 1：询问 Agent",
        modal_update_agent_desc: "傳送：「Update ClawBridge to the latest version」",
        modal_update_terminal: "方案 2：終端機",
        modal_btn_cancel: "取消",
        modal_btn_select_all: "全選",
        modal_btn_clear_all: "清空",
        modal_btn_skip: "跳過此版本",

        // Alerts
        alert_new_ver: "發現新版本：",
        alert_tap_update: "點擊此處更新",
        alert_temp_session: "臨時會話：",
        alert_temp_desc: "此 URL 將在重啟後失效。",
        alert_tap_permanent: "点击此处設定永久網域",

        // Error Messages
        auth_failed: "認證失敗。正在跳轉...",
        err_load_tokens: "成本資料載入失敗",
        err_load_diagnostics: "診斷資料載入失敗",
        err_load_history: "歷史記錄加载失败",
        err_generic: "发生錯誤，请稍后重試",
        hist_moved_to_backup: "已移至備份：{n}",
        hist_restored_keys: "已復原 {n} 个配置项",
        hist_restored_skills: "已復原 {n} 个技能项",
        hist_restored_from: "自備份檔案 {f}",
        hist_concise_soul: "已在 SOUL.md 中開啟簡潔模式",
    }
};

let currentLang = localStorage.getItem('clawbridge_lang') || 
                  (navigator && navigator.language && navigator.language.startsWith('zh') ? 'zh' : 'en');

function t(key) {
    if (!translations[currentLang]) currentLang = 'en';
    return translations[currentLang][key] ?? key;
}

function setLanguage(lang) {
    if (translations[lang]) {
        currentLang = lang;
        localStorage.setItem('clawbridge_lang', lang);
        applyTranslations();
        
        // Custom events for dynamic components to re-render
        window.dispatchEvent(new CustomEvent('clawbridge-lang-change', { detail: { lang } }));
    }
}

function applyTranslations() {
    // Update document lang
    document.documentElement.lang = currentLang;

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        
        // Dynamic content protection
        if (el.id === 'activity-feed' || el.id === 'memory-content') {
            const currentText = el.textContent.trim();
            // Expanded initial states to include memory_empty and memory_failed
            const initialStates = Object.keys(translations).flatMap(l => [
                translations[l].loading, 
                translations[l].memory_loading, 
                translations[l].connecting,
                translations[l].memory_empty, 
                translations[l].memory_failed,
                'Loading...', 
                'Accessing agent memories...', 
                'Connecting...',
                'No memory records found for this date.', 
                'Failed to load memory.'
            ]);
            
            const isInitial = initialStates.some(s => currentText === s);
            if (!isInitial) return;
        }

        if (el.classList.contains('job-list')) return;

        const translation = t(key);
        if (translation !== key) {
            if (key === 'about_desc' || key === 'legend_note') {
                el.innerHTML = translation;
            } else {
                el.textContent = translation;
            }
        }
    });
    
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });

    const selector = document.getElementById('lang-selector');
    if (selector) selector.value = currentLang;
}

// Expose i18n helpers for deferred scripts and inline handlers.
window.t = t;
window.setLanguage = setLanguage;
window.applyTranslations = applyTranslations;
window.translations = translations;

// Initial application
applyTranslations();
document.addEventListener('DOMContentLoaded', applyTranslations);
