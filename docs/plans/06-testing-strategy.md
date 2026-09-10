# 06 Testing Strategy

1. **Layer Test:** Test API foundation TRƯỚC. Viết unit/integration test bằng \un:test\.
2. **Methodology:** Sử dụng \pp.request()\ của Hono để test toàn bộ flow (Request -> Route -> Middleware -> Service -> DB -> Response).
3. **Mocking:** Dùng DB test riêng hoặc transaction rollback. Không mock Hono context, test API call thật qua memory.
4. **TDD:** Write failing test -> Implement -> Pass.
