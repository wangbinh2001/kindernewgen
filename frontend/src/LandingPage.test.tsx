import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import LandingPage from "./LandingPage";

describe("KinderNewGenz landing page", () => {
  it("renders the sticky glass navigation with all required items", () => {
    render(<LandingPage />);

    const header = screen.getByTestId("site-header");
    expect(header).toBeInTheDocument();
    expect(within(header).getByRole("link", { name: /KinderNewGenz/i })).toBeInTheDocument();

    const desktopNav = screen.getByTestId("primary-nav");
    expect(within(desktopNav).getByRole("link", { name: /Tính năng/i })).toHaveAttribute("href", "#tinh-nang");
    expect(within(desktopNav).getByRole("link", { name: /Giải pháp/i })).toHaveAttribute("href", "#giai-phap");
    expect(within(desktopNav).getByRole("link", { name: /Bảng giá/i })).toHaveAttribute("href", "#bang-gia");
    expect(within(desktopNav).getByRole("link", { name: /Đánh giá/i })).toHaveAttribute("href", "#danh-gia");
    expect(within(desktopNav).getByRole("link", { name: /Đăng nhập/i })).toBeInTheDocument();
    expect(within(desktopNav).getByRole("link", { name: /Đặt lịch tư vấn/i })).toHaveAttribute("href", "#tu-van");
  });

  it("opens mobile menu and closes it on item click or Escape", async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    const openBtn = screen.getByRole("button", { name: /mở menu/i });
    await user.click(openBtn);

    const dialog = screen.getByRole("dialog", { name: /điều hướng/i });
    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole("link", { name: /Tính năng/i })).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /Bảng giá/i })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("link", { name: /Tính năng/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /điều hướng/i })).not.toBeInTheDocument();
    });
  });

  it("renders the exact hero headline and 4 dashboard metrics", () => {
    render(<LandingPage />);

    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent(/Điều hành trường nhẹ hơn/i);
    expect(h1).toHaveTextContent(/Kết nối phụ huynh tốt hơn/i);

    // 4 metrics
    expect(screen.getByText(/Sĩ số hoạt động/i)).toBeInTheDocument();
    expect(screen.getByText(/Điểm danh hôm nay/i)).toBeInTheDocument();
    expect(screen.getByText(/Yêu cầu chờ duyệt/i)).toBeInTheDocument();
    expect(screen.getByText(/Tổng quan học phí/i)).toBeInTheDocument();
  });

  it("switches role content with active layout when tab clicked", async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    // Default is Chu truong
    expect(screen.getByRole("tabpanel")).toHaveTextContent(/Chủ trường/i);

    // Switch to Giao vien
    await user.click(screen.getByRole("tab", { name: /Giáo viên/i }));
    await waitFor(() => {
      expect(screen.getByRole("tabpanel")).toHaveTextContent(/Giáo viên/i);
    });

    // Switch to Phu huynh
    await user.click(screen.getByRole("tab", { name: /Phụ huynh/i }));
    await waitFor(() => {
      expect(screen.getByRole("tabpanel")).toHaveTextContent(/Phụ huynh/i);
    });
  });

  it("validates form fields contactName, schoolName, phone and submits successfully", async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    const submitBtn = screen.getByRole("button", { name: /Đặt lịch tư vấn/i });
    await user.click(submitBtn);

    // Field errors
    expect(screen.getByText(/Vui lòng nhập họ và tên/i)).toBeVisible();
    expect(screen.getByText(/Vui lòng nhập tên trường/i)).toBeVisible();
    expect(screen.getByText(/Vui lòng nhập số điện thoại/i)).toBeVisible();

    // Fill valid data
    await user.type(screen.getByLabelText(/Họ và tên/i), "Nguyễn Thị Hương");
    await user.type(screen.getByLabelText(/Tên trường/i), "Mầm non Ánh Dương");
    await user.type(screen.getByLabelText(/Số điện thoại/i), "0912345678");
    await user.type(screen.getByLabelText(/Nhu cầu tư vấn/i), "Cần tư vấn 6 cơ sở");

    await user.click(submitBtn);

    expect(await screen.findByText(/Chúng tôi đã nhận được yêu cầu/i)).toBeVisible();
  });

  it("handles form submission error when network or test error number provided", async () => {
    const user = userEvent.setup();
    render(<LandingPage />);

    await user.type(screen.getByLabelText(/Họ và tên/i), "Trần Văn Bình");
    await user.type(screen.getByLabelText(/Tên trường/i), "Mầm non Tuổi Thơ");
    await user.type(screen.getByLabelText(/Số điện thoại/i), "0900000000");

    const submitBtn = screen.getByRole("button", { name: /Đặt lịch tư vấn/i });
    await user.click(submitBtn);

    expect(await screen.findByRole("alert")).toHaveTextContent(/Kết nối tạm thời gián đoạn/i);
  });

  it("does not contain any forbidden em-dash or en-dash characters", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent || "";
    expect(text).not.toContain("—");
    expect(text).not.toContain("–");
  });
});
