# Design System Tokens & Foundations

## 1. Color Tokens
- `--color-primary`: `#023664` (Deep Navy)
- `--color-primary-hover`: `#012546`
- `--color-accent`: `#FAD105` (Warm Gold)
- `--color-accent-hover`: `#E0BC02`
- `--color-bg-canvas`: `#F8FAFC`
- `--color-bg-surface`: `#FFFFFF`
- `--color-border`: `#E2E8F0`
- `--color-text-primary`: `#0F172A`
- `--color-text-secondary`: `#475569`
- `--color-text-muted`: `#94A3B8`
- `--color-success`: `#10B981`
- `--color-warning`: `#F59E0B`
- `--color-danger`: `#EF4444`

## 2. Anti-Pattern Guardrails
- Không lồng card trong card (no card-in-card nesting).
- Không dùng gradient tím-xanh generic AI.
- Không dùng gray trung tính thuần `#000000`/`#888888` (luôn pha tint xanh Navy slate).
- Tránh Inter/Arial; chuẩn hóa `Plus Jakarta Sans`.
- Sidebar dạng Collapsible (Full: 240px, Mini: 64px) với tooltip trạng thái.
- Motion: transition `150ms–250ms cubic-bezier(0.16, 1, 0.3, 1)`. Không dùng bounce lố.
