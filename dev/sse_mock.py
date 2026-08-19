"""SSE Mock 服务（开发期验证工具，不消耗 API 费用）

模拟 DeepSeek 流式接口，用于验证 chatStream 的七种场景：
- POST /v1/chat/completions    → 正常流：5 块 delta，0.3s 间隔，末尾 [DONE]
- POST /v1/bad/chat/completions → 401 错误 JSON（Key 无效场景）
- POST /v1/die/chat/completions → 直接断开连接（断网场景）
- POST /v1/flaky/chat/completions   → 第一次断连，之后正常流（验证自动重试）
- POST /v1/auth/chat/completions    → 第一次 401，之后正常流（验证 401 不重试）
- POST /v1/halfdie/chat/completions → 发送 1 块后掐断（验证已出内容不重试）

用法：python dev/sse_mock.py（配合 dev/stream-smoke.mjs 使用）
"""
import http.server
import json
import re
import time

PORT = 3999


class MockHandler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    # 类级计数器：各故障场景的第几次调用（第一次触发故障，之后走正常流）
    flaky_count = 0
    auth_count = 0
    halfdie_count = 0

    def do_POST(self):
        # 非流式路由（长文 Map/Reduce 用）：按段号与模式回显内容，便于断言
        if self.path == "/v1/plain/chat/completions":
            self._send_plain()
            return

        # flaky 场景：第一次断连，之后正常流（验证网络异常自动重试）
        if self.path == "/v1/flaky/chat/completions":
            MockHandler.flaky_count += 1
            if MockHandler.flaky_count == 1:
                self.close_connection = True
                return
            self._send_normal_stream()
            return

        # auth 场景：第一次 401，之后正常流（验证 401 明确拒绝不重试）
        if self.path == "/v1/auth/chat/completions":
            MockHandler.auth_count += 1
            if MockHandler.auth_count == 1:
                self._send_401()
                return
            self._send_normal_stream()
            return

        # halfdie 场景：第一次发送 1 块后协议层掐断（验证已出部分内容不重试）；
        # 第二次起走正常流——若客户端误重试，第二次就会成功，断言即失败
        if self.path == "/v1/halfdie/chat/completions":
            MockHandler.halfdie_count += 1
            if MockHandler.halfdie_count == 1:
                self._send_halfdie()
            else:
                self._send_normal_stream()
            return

        # 重置计数器（冒烟脚本每次运行前调用，保证可重复执行）
        if self.path == "/v1/reset":
            MockHandler.flaky_count = 0
            MockHandler.auth_count = 0
            MockHandler.halfdie_count = 0
            body = b'{"ok": true}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # 401 场景：返回错误 JSON
        if self.path == "/v1/bad/chat/completions":
            self._send_401()
            return

        # 断网场景：不发任何响应直接断开
        if self.path == "/v1/die/chat/completions":
            self.close_connection = True
            return

        # 正常流场景
        self._send_normal_stream()

    def _send_401(self):
        """返回 401 错误 JSON（Key 无效场景）"""
        body = json.dumps({"error": {"message": "Invalid API key"}}).encode("utf-8")
        self.send_response(401)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_plain(self):
        """非流式回显（长文本 Map/Reduce 用）：按段号与模式回显内容，便于断言

        - 段号为 3 的请求返回 401（供"段失败"断言）
        - proofread（含'请校对以下文本'）：逐字回显段原文
          （故意 sleep 0.2s，供"中止"断言的竞态窗口）
        - summarize Map（含'请提取以下文本的核心要点'）：回显"要点第N段：原文前 20 字"
        - Reduce（含'生成层级摘要'）：回显固定层级摘要
        """
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length))
        except (ConnectionError, json.JSONDecodeError):
            # 客户端已中止（abort 场景）读不到完整 body，静默退出
            return
        content = payload["messages"][-1]["content"]

        m = re.search(r"\[这是文档的第 (\d+)/(\d+) 段\]", content)
        # 段号 3 拒绝：供"第 3 段处理失败"断言
        if m and int(m.group(1)) == 3:
            try:
                self._send_401()
            except (ConnectionAbortedError, BrokenPipeError):
                # 客户端已中止，静默退出
                pass
            return

        # 段原文 = marker 行、指令行与空行之后的部分（Map 提示词结构固定）
        seg = re.sub(r"^\[这是文档的第 \d+/\d+ 段\]\n[^\n]*\n\n", "", content, count=1)

        if "请校对以下文本" in content:
            time.sleep(0.2)   # 放慢回显，供中止场景的竞态窗口
            reply = seg
        elif "请提取以下文本的核心要点" in content:
            reply = f"要点第{m.group(1)}段：{seg[:20]}"
        elif "生成层级摘要" in content:
            reply = "## 一句话结论\n测试结论：文档整体内容。\n\n## 核心要点\n1. 要点一\n2. 要点二\n3. 要点三"
        else:
            reply = "(未知消息)"

        resp = {"choices": [{"message": {"content": reply}}]}
        body = json.dumps(resp, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (ConnectionAbortedError, BrokenPipeError):
            # 客户端已中止（abort 场景），静默退出
            pass

    def _send_normal_stream(self):
        """发送正常 SSE 流：5 块 delta，0.3s 间隔，末尾 [DONE]"""
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

    def _send_halfdie(self):
        """发送 1 块 delta 后制造协议层错误（验证已出内容不重试）

        RST/FIN 掐断在 Node(undici) 上会被当作正常 EOF，客户端不报错。
        改用 Content-Length 谎报：声明远大于实际 body 的长度后提前断开，
        undici 因长度不符必然抛出读取错误。
        """
        data = json.dumps({"choices": [{"delta": {"content": "第一块"}}]}, ensure_ascii=False)
        chunk = f"data: {data}\n\n".encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Content-Length", str(len(chunk) + 5000))   # 谎报：实际远未达到就断开
        self.end_headers()
        self.wfile.write(chunk)
        self.wfile.flush()
        time.sleep(0.3)
        self.connection.close()
        self.close_connection = True   # 防止 handler 在已关闭的 socket 上继续读而打印噪音堆栈

    def log_message(self, fmt, *args):
        print(f"[mock] {args[0]}")


if __name__ == "__main__":
    srv = http.server.HTTPServer(("localhost", PORT), MockHandler)
    print(f"SSE mock 服务已启动: http://localhost:{PORT}")
    srv.serve_forever()
