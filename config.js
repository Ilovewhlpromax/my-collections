// ============================================================
// Supabase 配置（公开的 URL 与 anon key 可安全放在前端）
// 方式一（GitHub Pages / 静态部署）：直接修改下面两个值
// 方式二（Zeabur 容器）：无需修改本文件，在 Zeabur 环境变量中
//   设置 SUPABASE_URL 与 SUPABASE_ANON_KEY，启动时会自动注入
// ============================================================
window.SUPABASE_CONFIG = {
    url: 'YOUR_SUPABASE_URL',          // 例如 https://xxxx.supabase.co
    anonKey: 'YOUR_SUPABASE_ANON_KEY'  // Project Settings -> API -> anon public key
};
