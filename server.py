"""DeepSeek for Word — 本地 HTTPS 服务器
使用 Microsoft Office 开发证书，在 localhost:3000 提供加载项静态文件。
"""
import http.server
import ssl
import os

CERT = os.path.join(os.environ["USERPROFILE"], ".office-addin-dev-certs", "localhost.crt")
KEY = os.path.join(os.environ["USERPROFILE"], ".office-addin-dev-certs", "localhost.key")


class Handler(http.server.SimpleHTTPRequestHandler):
    # 显式覆盖 MIME 映射：ES module 要求 .js 必须是 JS 类型，
    # Windows 上默认映射受注册表影响、跨机器不确定，这里固定为 text/javascript
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".yml": "text/yaml",
        ".yaml": "text/yaml",
    }

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, fmt, *args):
        print(f"[HTTPS] {args[0]}")


def main():
    if not os.path.exists(CERT) or not os.path.exists(KEY):
        print("[错误] 未找到 Office 开发证书，请先运行:")
        print("       npx office-addin-dev-certs install --days 365")
        return

    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(CERT, KEY)

    srv = http.server.HTTPServer(("localhost", 3000), Handler)
    srv.socket = ctx.wrap_socket(srv.socket, server_side=True)

    print("=" * 44)
    print("  DeepSeek for Word — HTTPS 服务器")
    print("  https://localhost:3000")
    print("=" * 44)
    print("  保持此窗口打开。加载项用法：")
    print("  Word → 插入 → 我的加载项 → 共享文件夹")
    print("=" * 44)

    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n[已停止] 服务器已关闭")


if __name__ == "__main__":
    main()
