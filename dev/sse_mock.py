"""SSE Mock 服务（开发期验证工具，不消耗 API 费用）

模拟 DeepSeek 流式接口，用于验证 chatStream 的四种场景：
- POST /v1/chat/completions    → 正常流：5 块 delta，0.3s 间隔，末尾 [DONE]
- POST /v1/bad/chat/completions → 401 错误 JSON（Key 无效场景）
- POST /v1/die/chat/completions → 直接断开连接（断网场景）

用法：python dev/sse_mock.py（配合 dev/stream-smoke.mjs 使用）
"""
import http.server
import json
import time

PORT = 3999


class MockHandler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_POST(self):
        # 401 场景：返回错误 JSON
        if self.path == "/v1/bad/chat/completions":
            body = json.dumps({"error": {"message": "Invalid API key"}}).encode("utf-8")
            self.send_response(401)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # 断网场景：不发任何响应直接断开
        if self.path == "/v1/die/chat/completions":
            self.close_connection = True
            return

        # 正常流场景
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()

        chunks = ["你好，", "这是", "一段", "流式", "响应。"]
        try:
            for chunk in chunks:
                data = json.dumps({"choices": [{"delta": {"content": chunk}}]}, ensure_ascii=False)
                self.wfile.write(f"data: {data}\n\n".encode("utf-8"))
                self.wfile.flush()
                time.sleep(0.3)

            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
        except (ConnectionAbortedError, BrokenPipeError):
            # 客户端主动中止（正常场景），静默退出
            pass

    def log_message(self, fmt, *args):
        print(f"[mock] {args[0]}")


if __name__ == "__main__":
    srv = http.server.HTTPServer(("localhost", PORT), MockHandler)
    print(f"SSE mock 服务已启动: http://localhost:{PORT}")
    srv.serve_forever()
