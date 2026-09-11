import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BellRingingIcon,
  BookOpenTextIcon,
  CalendarDotsIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CheckIcon,
  BabyIcon,
  ClockCountdownIcon,
  CompassIcon,
  EnvelopeSimpleIcon,
  EyeIcon,
  FileTextIcon,
  FingerprintIcon,
  HandHeartIcon,
  ListIcon,
  LockKeyIcon,
  MapPinIcon,
  PaperPlaneTiltIcon,
  PhoneIcon,
  PlayCircleIcon,
  ShieldCheckIcon,
  SparkleIcon,
  TrendUpIcon,
  UsersThreeIcon,
  XIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { submitDemoRequest } from "./api";

const navLinks = [
  { href: "#tinh-nang", label: "Tính năng" },
  { href: "#giai-phap", label: "Giải pháp" },
  { href: "#bang-gia", label: "Bảng giá" },
  { href: "#danh-gia", label: "Đánh giá" },
];

const roles = [
  {
    id: "chu-truong",
    label: "Chủ trường",
    title: "Mỗi quyết định đều có bức tranh toàn cảnh.",
    body: "Theo dõi nhịp vận hành, tài chính, sĩ số và những việc cần ưu tiên mà không cần chờ các bảng báo cáo thủ công cuối ngày.",
    notes: [
      "Bức tranh tài chính chuẩn mực",
      "Báo cáo sĩ số đa cơ sở",
      "Phân quyền theo đúng vai trò",
    ],
    accent: "bg-gold",
  },
  {
    id: "giao-vien",
    label: "Giáo viên",
    title: "Giữ nhịp lớp học, dành thời gian cho trẻ.",
    body: "Điểm danh nhanh, nhật ký sinh động và trao đổi cùng phụ huynh được gói gọn trong quy trình tối giản, giảm tối đa áp lực sổ sách giấy tờ.",
    notes: [
      "Điểm danh trong vài chạm",
      "Nhật ký theo từng hoạt động",
      "Giảm áp lực sổ sách giấy tờ",
    ],
    accent: "bg-sage",
  },
  {
    id: "phu-huynh",
    label: "Phụ huynh",
    title: "Biết con hôm nay đã lớn lên như thế nào.",
    body: "Một không gian riêng tư để gia đình cập nhật bữa ăn, giấc ngủ, hình ảnh và nhịp sinh hoạt của con theo thời gian thực.",
    notes: [
      "Cập nhật bữa ăn và giấc ngủ",
      "Hình ảnh lớp học theo thời gian thực",
      "Tương tác an toàn với nhà trường",
    ],
    accent: "bg-coral",
  },
];

type FormStatus = "idle" | "loading" | "success" | "error";

function PrimaryButton({
  children,
  href,
  onClick,
  type = "button",
  className = "",
  disabled = false,
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  disabled?: boolean;
}) {
  const shared = `inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-gold px-6 py-3 text-base font-bold text-navy transition duration-200 ease-out-expo hover:bg-gold-deep active:translate-y-px ${className}`;
  if (href) {
    return (
      <a className={shared} href={href} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <button
      className={shared}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

function SectionHeading({
  title,
  description,
  dark = false,
}: {
  title: string;
  description: string;
  dark?: boolean;
}) {
  return (
    <div className="max-w-3xl">
      <h2
        className={`text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl ${dark ? "text-white" : "text-navy"}`}
      >
        {title}
      </h2>
      <p
        className={`mt-4 max-w-[65ch] text-base leading-relaxed ${dark ? "text-slate-200" : "text-slate-600"}`}
      >
        {description}
      </p>
    </div>
  );
}

function ProductPreview() {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
      transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
      className="relative mx-auto w-full max-w-[600px]"
    >
      <div className="absolute -left-4 top-[22%] z-10 hidden rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-[0_18px_42px_-20px_rgba(2,54,100,0.42)] backdrop-blur md:block">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-sage text-navy">
            <CheckCircleIcon size={20} weight="fill" />
          </span>
          <div>
            <p className="text-xs font-bold text-navy">Điểm danh đã xong</p>
            <p className="text-[11px] text-slate-500">182 học sinh có mặt</p>
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-[2rem] border border-white/80 bg-white p-3 shadow-[0_30px_80px_-35px_rgba(2,54,100,0.5)]">
        <div className="overflow-hidden rounded-[1.45rem] bg-mist">
          <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2 text-sm font-extrabold text-navy">
              <span className="grid size-6 place-items-center rounded-md bg-navy text-[10px] text-gold">
                K
              </span>
              KinderNewGenz
            </div>
            <span className="rounded-full bg-sage px-3 py-1 text-xs font-bold text-navy">
              Thứ Ba, 09:30
            </span>
          </div>
          <div className="grid grid-cols-[68px_1fr] sm:grid-cols-[88px_1fr]">
            <aside className="border-r border-line bg-white px-2 py-4 sm:px-3">
              <div className="mx-auto grid size-8 place-items-center rounded-xl bg-navy text-gold">
                <CompassIcon size={17} />
              </div>
              <div className="mt-5 space-y-3 text-slate-400">
                <span className="mx-auto block size-5 rounded-md bg-slate-100" />
                <span className="mx-auto block size-5 rounded-md bg-slate-100" />
                <span className="mx-auto block size-5 rounded-md bg-slate-100" />
              </div>
            </aside>
            <div className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold tracking-[0.16em] text-slate-400">
                    BẢNG ĐIỀU HÀNH
                  </p>
                  <h3 className="mt-1 text-lg font-extrabold tracking-tight text-navy sm:text-xl">
                    Một ngày tại Mầm Xanh
                  </h3>
                </div>
                <div className="grid size-9 place-items-center rounded-xl bg-gold text-navy">
                  <BellRingingIcon size={19} />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="rounded-xl bg-white p-2.5 sm:p-3 shadow-xs">
                  <p className="text-base font-extrabold text-navy sm:text-lg">
                    182
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Sĩ số hoạt động
                  </p>
                </div>
                <div className="rounded-xl bg-white p-2.5 sm:p-3 shadow-xs">
                  <p className="text-base font-extrabold text-navy sm:text-lg">
                    96.8%
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Điểm danh hôm nay
                  </p>
                </div>
                <div className="rounded-xl bg-white p-2.5 sm:p-3 shadow-xs">
                  <p className="text-base font-extrabold text-navy sm:text-lg">
                    4 đơn
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Yêu cầu chờ duyệt
                  </p>
                </div>
                <div className="rounded-xl bg-white p-2.5 sm:p-3 shadow-xs">
                  <p className="text-base font-extrabold text-navy sm:text-lg">
                    92%
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Tổng quan học phí
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-xl bg-navy p-3.5 text-white sm:p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold tracking-[0.12em] text-gold">
                    NHỊP HÔM NAY
                  </span>
                  <TrendUpIcon size={16} className="text-gold" />
                </div>
                <div className="mt-3 flex h-10 items-end gap-1.5">
                  {[42, 68, 55, 82, 66, 93, 76, 98].map((height, index) => (
                    <span
                      className="flex-1 rounded-t bg-gold"
                      key={index}
                      style={{
                        height: `${height}%`,
                        opacity: index === 7 ? 1 : 0.45 + index * 0.06,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-white p-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-coral text-navy">
                  <HandHeartIcon size={17} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-navy">
                    Nhật ký buổi sáng
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Lớp Chồi vừa chia sẻ hoạt động mới
                  </p>
                </div>
                <CaretRightIcon
                  className="ml-auto shrink-0 text-slate-400"
                  size={16}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 right-2 rounded-2xl border border-white/70 bg-white px-4 py-3 shadow-[0_18px_42px_-20px_rgba(2,54,100,0.42)] md:-right-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-gold text-navy">
            <PaperPlaneTiltIcon size={18} />
          </span>
          <div>
            <p className="text-xs font-bold text-navy">Tin nhắn đã gửi</p>
            <p className="text-[11px] text-slate-500">Gắn kết gia đình</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeRole, setActiveRole] = useState(roles[0].id);
  const [formStatus, setFormStatus] = useState<FormStatus>("idle");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const reduceMotion = useReducedMotion();
  const role = roles.find((item) => item.id === activeRole) ?? roles[0];

  useEffect(() => {
    if (!isMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMenuOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isMenuOpen]);

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const contactName = String(formData.get("contactName") ?? "").trim();
    const schoolName = String(formData.get("schoolName") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();

    const errors: Record<string, string> = {};
    if (!contactName) errors.contactName = "Vui lòng nhập họ và tên.";
    if (!schoolName) errors.schoolName = "Vui lòng nhập tên trường.";
    if (!phone) errors.phone = "Vui lòng nhập số điện thoại.";
    else if (!/^(?:\+84|0)(?:\d[ .-]?){8,10}$/.test(phone))
      errors.phone = "Số điện thoại chưa đúng định dạng.";

    setFieldErrors(errors);
    setFormError("");
    if (Object.keys(errors).length) return;

    setFormStatus("loading");
    const result = await submitDemoRequest({
      contactName,
      schoolName,
      phone,
      message,
    });

    if (result.success) {
      setFormStatus("success");
    } else {
      setFormStatus("error");
      setFormError(
        result.error?.message ||
          "Kết nối tạm thời gián đoạn. Vui lòng thử lại sau ít phút.",
      );
    }
  }

  return (
    <div className="overflow-x-clip text-base text-ink">
      <header
        data-testid="site-header"
        className="fixed inset-x-0 top-0 z-20 border-b border-white/10 bg-navy/90 backdrop-blur-md"
      >
        <nav
          className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-4 sm:px-8 lg:px-12"
          aria-label="Điều hướng chính"
        >
          <a
            href="#dau-trang"
            className="flex items-center gap-3 text-white"
            aria-label="KinderNewGenz, về đầu trang"
          >
            <span className="grid size-10 place-items-center rounded-[0.85rem] bg-gold text-lg font-extrabold text-navy shadow-[0_10px_20px_-10px_rgba(0,0,0,0.4)]">
              K
            </span>
            <span className="text-lg font-extrabold tracking-tight">
              KinderNewGenz
            </span>
          </a>
          <div
            data-testid="primary-nav"
            className="hidden items-center gap-7 lg:flex"
          >
            {navLinks.map((link) => (
              <a
                className="text-base font-semibold text-slate-200 transition hover:text-gold"
                href={link.href}
                key={link.href}
              >
                {link.label}
              </a>
            ))}
            <a
              className="text-base font-semibold text-slate-200 transition hover:text-gold"
              href="#dang-nhap"
            >
              Đăng nhập
            </a>
            <a
              className="inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full bg-gold px-5 text-base font-bold text-navy transition duration-200 hover:bg-gold-deep active:translate-y-px"
              href="#tu-van"
            >
              Đặt lịch tư vấn
            </a>
          </div>
          <button
            data-testid="mobile-menu-trigger"
            className="grid size-12 place-items-center rounded-full border border-white/40 text-white transition hover:border-gold hover:text-gold lg:hidden"
            type="button"
            onClick={() => setIsMenuOpen(true)}
            aria-label="Mở menu"
          >
            <ListIcon size={24} />
          </button>
        </nav>
      </header>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            data-testid="mobile-menu-dialog"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-navy lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Điều hướng"
          >
            <div className="flex items-center justify-between px-5 py-5">
              <span className="flex items-center gap-3 text-lg font-extrabold text-white">
                <span className="grid size-10 place-items-center rounded-[0.85rem] bg-gold text-lg text-navy">
                  K
                </span>
                KinderNewGenz
              </span>
              <button
                className="grid size-12 place-items-center rounded-full border border-white/40 text-white"
                onClick={() => setIsMenuOpen(false)}
                aria-label="Đóng menu"
              >
                <XIcon size={24} />
              </button>
            </div>
            <motion.div
              initial={reduceMotion ? false : { y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.08, duration: 0.35 }}
              className="px-5 pt-8"
            >
              {navLinks.map((link) => (
                <a
                  className="flex items-center justify-between border-b border-white/15 py-5 text-2xl font-extrabold tracking-tight text-white"
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  key={link.href}
                >
                  {link.label}
                  <ArrowRightIcon className="text-gold" size={24} />
                </a>
              ))}
              <a
                className="flex items-center justify-between border-b border-white/15 py-5 text-2xl font-extrabold tracking-tight text-white"
                href="#dang-nhap"
                onClick={() => setIsMenuOpen(false)}
              >
                Đăng nhập
                <ArrowRightIcon className="text-gold" size={24} />
              </a>
              <PrimaryButton
                href="#tu-van"
                className="mt-8 w-full"
                onClick={() => setIsMenuOpen(false)}
              >
                Đặt lịch tư vấn <ArrowRightIcon size={18} weight="bold" />
              </PrimaryButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main>
        <section
          id="dau-trang"
          data-testid="hero"
          className="relative isolate min-h-[100dvh] overflow-hidden bg-navy pb-16 pt-28 text-white sm:pt-32 lg:flex lg:items-center lg:pb-12"
        >
          <div className="absolute inset-0 -z-10 opacity-100 [background:radial-gradient(circle_at_89%_14%,rgba(250,209,5,0.3),transparent_21%),radial-gradient(circle_at_62%_85%,rgba(109,170,171,0.22),transparent_27%)]" />
          <div className="absolute bottom-0 left-0 h-24 w-[52%] bg-gold [clip-path:polygon(0_42%,100%_0,100%_100%,0_100%)]" />
          <div className="mx-auto grid w-full max-w-[1400px] gap-12 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16 lg:px-12">
            <motion.div
              initial={reduceMotion ? false : { y: 22, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-xl lg:pb-8"
            >
              <p className="text-sm font-bold tracking-[0.13em] text-gold">
                NURTURE & NAVIGATE
              </p>
              <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-balance sm:text-5xl lg:text-6xl">
                Điều hành trường nhẹ hơn.{" "}
                <br />
                Kết nối phụ huynh tốt hơn.
              </h1>
              <p className="mt-6 max-w-[50ch] text-base leading-relaxed text-slate-200 sm:text-lg">
                Nền tảng quản lý trường mầm non toàn diện, minh bạch và gắn kết gia đình mỗi ngày.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <PrimaryButton href="#tu-van">
                  Đặt lịch tư vấn <ArrowRightIcon size={18} weight="bold" />
                </PrimaryButton>
                <a
                  href="#giai-phap"
                  className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 text-base font-bold text-white transition hover:bg-white/10 active:translate-y-px"
                >
                  <PlayCircleIcon
                    size={20}
                    weight="fill"
                    className="text-gold"
                  />
                  Xem demo
                </a>
              </div>
              <div className="mt-10 flex items-center gap-4 border-t border-white/20 pt-6">
                <div className="flex -space-x-2">
                  {["bg-sage", "bg-coral", "bg-gold"].map((color) => (
                    <span
                      className={`grid size-9 place-items-center rounded-full border-2 border-navy ${color}`}
                      key={color}
                    >
                      <BabyIcon size={17} className="text-navy" weight="fill" />
                    </span>
                  ))}
                </div>
                <p className="text-xs leading-5 text-slate-300">
                  Thiết kế theo nhịp làm việc của
                  <br />
                  <strong className="font-bold text-white">
                    chủ trường, giáo viên và gia đình.
                  </strong>
                </p>
              </div>
            </motion.div>
            <motion.div
              initial={reduceMotion ? false : { y: 34, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{
                duration: 0.8,
                delay: 0.08,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="relative pb-10 lg:pb-0"
            >
              <ProductPreview />
            </motion.div>
          </div>
        </section>

        <section
          id="giai-phap"
          className="bg-white px-5 py-20 sm:px-8 lg:px-12 lg:py-28"
        >
          <div className="mx-auto grid max-w-[1400px] gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24">
            <SectionHeading
              title="Một hệ thống, ba góc nhìn cùng tiến về phía trước."
              description="Mỗi vai trò đều tiếp cận thông tin chính xác, đúng ngữ cảnh và giảm bớt thao tác rườm rà."
            />
            <div>
              <div
                className="flex overflow-x-auto border-b border-line"
                role="tablist"
                aria-label="Theo vai trò"
              >
                {roles.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    role="tab"
                    aria-selected={activeRole === item.id}
                    aria-controls={`${item.id}-panel`}
                    className={`relative shrink-0 px-5 py-3 text-base font-bold transition ${activeRole === item.id ? "text-navy" : "text-slate-500 hover:text-navy"}`}
                    onClick={() => setActiveRole(item.id)}
                  >
                    {item.label}
                    {activeRole === item.id && (
                      <motion.span
                        layoutId="activeTab"
                        transition={{
                          type: "spring",
                          stiffness: 340,
                          damping: 30,
                        }}
                        className="absolute inset-x-3 bottom-0 h-1 rounded-full bg-gold"
                      />
                    )}
                  </button>
                ))}
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={role.id}
                  id={`${role.id}-panel`}
                  role="tabpanel"
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  className="mt-8 grid gap-6 rounded-[2rem] bg-mist p-6 sm:p-8"
                >
                  <span
                    className={`grid size-12 place-items-center rounded-2xl ${role.accent} text-navy`}
                  >
                    {role.id === "chu-truong" ? (
                      <TrendUpIcon size={24} />
                    ) : role.id === "giao-vien" ? (
                      <HandHeartIcon size={24} />
                    ) : (
                      <UsersThreeIcon size={24} />
                    )}
                  </span>
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {role.label}
                    </span>
                    <h3 className="mt-1 text-2xl font-extrabold tracking-tight text-navy">
                      {role.title}
                    </h3>
                    <p className="mt-3 max-w-[55ch] text-base leading-relaxed text-slate-600">
                      {role.body}
                    </p>
                  </div>
                  <ul className="grid gap-3 sm:grid-cols-3">
                    {role.notes.map((note) => (
                      <li
                        className="flex gap-2 text-sm font-semibold leading-relaxed text-navy"
                        key={note}
                      >
                        <CheckIcon
                          size={18}
                          weight="bold"
                          className="shrink-0 text-navy"
                        />
                        {note}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </section>

        <section
          id="tinh-nang"
          data-testid="bento-features"
          className="bg-mist px-5 py-20 sm:px-8 lg:px-12 lg:py-28"
        >
          <div className="mx-auto max-w-[1400px]">
            <SectionHeading
              title="Đủ rõ để điều hành. Đủ gần để thấu hiểu."
              description="Năm năng lực cốt lõi giúp nhà trường quản trị trơn tru từng chi tiết từ bán trú, dinh dưỡng đến dòng tiền học phí."
            />
            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              <article className="rounded-[2rem] bg-white p-7 shadow-xs">
                <span className="grid size-12 place-items-center rounded-2xl bg-gold text-navy">
                  <CalendarDotsIcon size={24} weight="bold" />
                </span>
                <h3 className="mt-6 text-xl font-extrabold text-navy">
                  Điểm danh và bán trú
                </h3>
                <p className="mt-3 text-base leading-relaxed text-slate-600">
                  Chấm ăn, điểm danh đến lớp và về nhanh chóng, tự động kết nối dữ liệu tính tiền ăn theo ngày thực tế.
                </p>
              </article>

              <article className="rounded-[2rem] bg-white p-7 shadow-xs">
                <span className="grid size-12 place-items-center rounded-2xl bg-sage text-navy">
                  <BookOpenTextIcon size={24} weight="bold" />
                </span>
                <h3 className="mt-6 text-xl font-extrabold text-navy">
                  Thực đơn dinh dưỡng
                </h3>
                <p className="mt-3 text-base leading-relaxed text-slate-600">
                  Thiết lập thực đơn theo tuần, tính toán calo và định lượng khoa học giúp phụ huynh luôn an tâm về bữa ăn của trẻ.
                </p>
              </article>

              <article className="rounded-[2rem] bg-white p-7 shadow-xs">
                <span className="grid size-12 place-items-center rounded-2xl bg-coral text-navy">
                  <HandHeartIcon size={24} weight="bold" />
                </span>
                <h3 className="mt-6 text-xl font-extrabold text-navy">
                  Sức khỏe học sinh
                </h3>
                <p className="mt-3 text-base leading-relaxed text-slate-600">
                  Theo dõi lịch tiêm chủng, biểu đồ tăng trưởng chiều cao cân nặng và tiếp nhận đơn dặn thuốc từ gia đình.
                </p>
              </article>

              <article className="rounded-[2rem] bg-navy p-7 text-white shadow-xs md:col-span-2 lg:col-span-2">
                <span className="grid size-12 place-items-center rounded-2xl bg-gold text-navy">
                  <FileTextIcon size={24} weight="bold" />
                </span>
                <h3 className="mt-6 text-2xl font-extrabold text-white">
                  Học phí và biên lai
                </h3>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-200">
                  Tự động tính học phí theo ngày ăn thực tế, phát hành phiếu thu minh bạch và đối soát hóa đơn chỉ với một cú nhấp chuột.
                </p>
              </article>

              <article className="rounded-[2rem] bg-white p-7 shadow-xs md:col-span-2 lg:col-span-1">
                <span className="grid size-12 place-items-center rounded-2xl bg-mist text-navy border border-line">
                  <SparkleIcon size={24} weight="bold" />
                </span>
                <h3 className="mt-6 text-xl font-extrabold text-navy">
                  Timeline kết nối phụ huynh
                </h3>
                <p className="mt-3 text-base leading-relaxed text-slate-600">
                  Nhật ký khoảnh khắc lớp học, gắn thẻ trẻ em, tương tác bảo mật giúp gia đình luôn đồng hành cùng trường.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section
          id="bao-mat"
          className="bg-navy px-5 py-20 sm:px-8 lg:px-12 lg:py-28"
        >
          <div className="mx-auto max-w-[1400px]">
            <SectionHeading
              dark
              title="Niềm tin được xây dựng bằng kiến trúc dữ liệu an toàn."
              description="Năm trụ cột bảo mật vững chắc đảm bảo dữ liệu trẻ em và vận hành của trường luôn được bảo vệ chuẩn mực."
            />
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-[1.75rem] border border-white/15 bg-white/5 p-6 backdrop-blur">
                <FingerprintIcon size={30} className="text-gold" />
                <h3 className="mt-6 text-lg font-extrabold text-white">
                  Dữ liệu tách biệt theo từng trường
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  Cách ly đa trường cấp độ cơ sở dữ liệu với Row-Level Security triệt để.
                </p>
              </div>

              <div className="rounded-[1.75rem] border border-white/15 bg-white/5 p-6 backdrop-blur">
                <LockKeyIcon size={30} className="text-gold" />
                <h3 className="mt-6 text-lg font-extrabold text-white">
                  Phân quyền rõ ràng
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  Kiểm soát truy cập dựa trên vai trò nghiêm ngặt giữa chủ trường, giáo viên và phụ huynh.
                </p>
              </div>

              <div className="rounded-[1.75rem] border border-white/15 bg-white/5 p-6 backdrop-blur">
                <EyeIcon size={30} className="text-gold" />
                <h3 className="mt-6 text-lg font-extrabold text-white">
                  Có audit log
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  Ghi vết chi tiết mọi thay đổi dữ liệu quan trọng phục vụ tra soát minh bạch.
                </p>
              </div>

              <div className="rounded-[1.75rem] border border-white/15 bg-white/5 p-6 backdrop-blur">
                <ShieldCheckIcon size={30} className="text-gold" />
                <h3 className="mt-6 text-lg font-extrabold text-white">
                  Có session revocation
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  Vô hiệu hóa phiên đăng nhập tức thì khi phát hiện rủi ro bảo mật hoặc đổi quyền.
                </p>
              </div>

              <div className="rounded-[1.75rem] border border-white/15 bg-white/5 p-6 backdrop-blur">
                <TrendUpIcon size={30} className="text-gold" />
                <h3 className="mt-6 text-lg font-extrabold text-white">
                  Có backup và khả năng mở rộng
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-300">
                  Sao lưu định kỳ, sẵn sàng phục hồi và mở rộng linh hoạt cho hệ thống chuỗi.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          id="danh-gia"
          className="bg-white px-5 py-20 sm:px-8 lg:px-12 lg:py-24"
        >
          <div className="mx-auto max-w-[1400px]">
            <SectionHeading
              title="Đồng hành cùng những ngôi trường phát triển bền vững."
              description="Những con số xác thực thể hiện chất lượng đồng hành của KinderNewGenz trên toàn quốc."
            />
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-[2rem] bg-mist p-8 text-center">
                <p className="text-4xl font-extrabold text-navy sm:text-5xl">50+</p>
                <p className="mt-2 text-base font-semibold text-slate-600">
                  Cơ sở mầm non tin chọn
                </p>
              </div>
              <div className="rounded-[2rem] bg-mist p-8 text-center">
                <p className="text-4xl font-extrabold text-navy sm:text-5xl">15.000+</p>
                <p className="mt-2 text-base font-semibold text-slate-600">
                  Phụ huynh kết nối mỗi ngày
                </p>
              </div>
              <div className="rounded-[2rem] bg-mist p-8 text-center">
                <p className="text-4xl font-extrabold text-navy sm:text-5xl">99.9%</p>
                <p className="mt-2 text-base font-semibold text-slate-600">
                  Học phí thu đúng hạn
                </p>
              </div>
              <div className="rounded-[2rem] bg-mist p-8 text-center">
                <p className="text-4xl font-extrabold text-navy sm:text-5xl">30 phút</p>
                <p className="mt-2 text-base font-semibold text-slate-600">
                  Tiết kiệm mỗi ngày cho giáo viên
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          id="bang-gia"
          className="bg-mist px-5 py-20 sm:px-8 lg:px-12 lg:py-28"
        >
          <div className="mx-auto max-w-[1400px]">
            <div className="text-center">
              <SectionHeading
                title="Bảng giá linh hoạt theo quy mô trường."
                description="Minh bạch chi phí, không phụ phí ẩn, tối ưu hóa ngân sách vận hành cho nhà trường."
              />
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              <div className="rounded-[2rem] bg-white p-8 shadow-xs">
                <h3 className="text-2xl font-extrabold text-navy">Khởi điểm</h3>
                <p className="mt-2 text-sm text-slate-500">Dành cho trường dưới 60 học sinh</p>
                <p className="mt-6 text-3xl font-extrabold text-navy">990.000 đ<span className="text-sm font-medium text-slate-500"> / tháng</span></p>
                <ul className="mt-6 space-y-3 text-sm text-slate-600">
                  <li className="flex items-center gap-2">
                    <CheckIcon size={16} weight="bold" className="text-navy" /> Điểm danh và bán trú
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon size={16} weight="bold" className="text-navy" /> Quản lý thực đơn
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon size={16} weight="bold" className="text-navy" /> Kết nối phụ huynh
                  </li>
                </ul>
                <a
                  href="#tu-van"
                  className="mt-8 block w-full rounded-full border border-navy py-3 text-center text-sm font-bold text-navy transition hover:bg-navy hover:text-white"
                >
                  Chọn gói này
                </a>
              </div>

              <div className="relative rounded-[2rem] bg-navy p-8 text-white shadow-md">
                <span className="absolute -top-3 right-8 rounded-full bg-gold px-3 py-1 text-xs font-bold text-navy">
                  Phổ biến nhất
                </span>
                <h3 className="text-2xl font-extrabold text-white">Tiêu chuẩn</h3>
                <p className="mt-2 text-sm text-slate-300">Dành cho trường từ 60 đến 180 học sinh</p>
                <p className="mt-6 text-3xl font-extrabold text-gold">1.890.000 đ<span className="text-sm font-medium text-slate-300"> / tháng</span></p>
                <ul className="mt-6 space-y-3 text-sm text-slate-200">
                  <li className="flex items-center gap-2">
                    <CheckIcon size={16} weight="bold" className="text-gold" /> Mọi tính năng Khởi điểm
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon size={16} weight="bold" className="text-gold" /> Tự động hóa tính học phí
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon size={16} weight="bold" className="text-gold" /> Quản lý hồ sơ sức khỏe
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon size={16} weight="bold" className="text-gold" /> Hỗ trợ kỹ thuật ưu tiên
                  </li>
                </ul>
                <PrimaryButton href="#tu-van" className="mt-8 w-full">
                  Đặt lịch tư vấn
                </PrimaryButton>
              </div>

              <div className="rounded-[2rem] bg-white p-8 shadow-xs">
                <h3 className="text-2xl font-extrabold text-navy">Chuỗi cơ sở</h3>
                <p className="mt-2 text-sm text-slate-500">Dành cho hệ thống nhiều chi nhánh</p>
                <p className="mt-6 text-3xl font-extrabold text-navy">Tùy biến<span className="text-sm font-medium text-slate-500"> theo nhu cầu</span></p>
                <ul className="mt-6 space-y-3 text-sm text-slate-600">
                  <li className="flex items-center gap-2">
                    <CheckIcon size={16} weight="bold" className="text-navy" /> Báo cáo tổng hợp chuỗi
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon size={16} weight="bold" className="text-navy" /> Phân quyền đa cấp bậc
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon size={16} weight="bold" className="text-navy" /> Tích hợp cổng thanh toán
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckIcon size={16} weight="bold" className="text-navy" /> Đào tạo nhân sự tận nơi
                  </li>
                </ul>
                <a
                  href="#tu-van"
                  className="mt-8 block w-full rounded-full border border-navy py-3 text-center text-sm font-bold text-navy transition hover:bg-navy hover:text-white"
                >
                  Nhận báo giá
                </a>
              </div>
            </div>
          </div>
        </section>

        <section
          id="tu-van"
          className="bg-mist px-5 py-20 sm:px-8 lg:px-12 lg:py-28"
        >
          <div className="mx-auto grid max-w-[1400px] overflow-hidden rounded-[2.25rem] bg-white lg:grid-cols-[0.85fr_1.15fr]">
            <div className="relative overflow-hidden bg-gold p-7 text-navy sm:p-10 lg:p-12">
              <div className="absolute -right-14 -top-16 size-52 rounded-full border-[28px] border-navy/10" />
              <SparkleIcon size={32} weight="fill" />
              <h2 className="mt-16 max-w-sm text-3xl font-extrabold tracking-tight sm:text-4xl">
                Xem nhịp trường mình trở nên rõ ràng hơn.
              </h2>
              <p className="mt-4 max-w-sm text-base leading-relaxed text-navy/80">
                Đội ngũ chuyên gia sẽ lắng nghe mô hình và tư vấn lộ trình số hóa phù hợp nhất cho trường bạn.
              </p>
              <div className="mt-12 space-y-4 text-base font-semibold">
                <p className="flex items-center gap-3">
                  <ClockCountdownIcon size={22} />
                  Trao đổi trong 30 phút
                </p>
                <p className="flex items-center gap-3">
                  <MapPinIcon size={22} />
                  Theo sát nhịp vận hành trường
                </p>
              </div>
            </div>
            <div className="p-7 sm:p-10 lg:p-12">
              <form
                data-testid="consultation-form"
                noValidate
                onSubmit={submitForm}
                aria-describedby={
                  formStatus === "error" ? "form-error" : undefined
                }
              >
                <div className="grid gap-5">
                  <div className="grid gap-2">
                    <label
                      className="text-base font-bold text-navy"
                      htmlFor="contactName"
                    >
                      Họ và tên
                    </label>
                    <input
                      id="contactName"
                      name="contactName"
                      autoComplete="name"
                      className={`min-h-12 rounded-xl border bg-white px-4 text-base text-navy placeholder:text-slate-400 ${fieldErrors.contactName ? "border-red-500" : "border-line focus:border-navy"}`}
                      placeholder="Ví dụ: Nguyễn Minh Anh"
                      aria-invalid={Boolean(fieldErrors.contactName)}
                      aria-describedby={
                        fieldErrors.contactName ? "contactName-error" : undefined
                      }
                    />
                    {fieldErrors.contactName && (
                      <p
                        id="contactName-error"
                        className="text-xs font-semibold text-red-600"
                      >
                        {fieldErrors.contactName}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <label
                      className="text-base font-bold text-navy"
                      htmlFor="schoolName"
                    >
                      Tên trường
                    </label>
                    <input
                      id="schoolName"
                      name="schoolName"
                      autoComplete="organization"
                      className={`min-h-12 rounded-xl border bg-white px-4 text-base text-navy placeholder:text-slate-400 ${fieldErrors.schoolName ? "border-red-500" : "border-line focus:border-navy"}`}
                      placeholder="Ví dụ: Mầm non Ánh Dương"
                      aria-invalid={Boolean(fieldErrors.schoolName)}
                      aria-describedby={
                        fieldErrors.schoolName ? "schoolName-error" : undefined
                      }
                    />
                    {fieldErrors.schoolName && (
                      <p
                        id="schoolName-error"
                        className="text-xs font-semibold text-red-600"
                      >
                        {fieldErrors.schoolName}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <label
                      className="text-base font-bold text-navy"
                      htmlFor="phone"
                    >
                      Số điện thoại
                    </label>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      className={`min-h-12 rounded-xl border bg-white px-4 text-base text-navy placeholder:text-slate-400 ${fieldErrors.phone ? "border-red-500" : "border-line focus:border-navy"}`}
                      placeholder="09xx xxx xxx"
                      aria-invalid={Boolean(fieldErrors.phone)}
                      aria-describedby={
                        fieldErrors.phone ? "phone-error" : undefined
                      }
                    />
                    {fieldErrors.phone && (
                      <p
                        id="phone-error"
                        className="text-xs font-semibold text-red-600"
                      >
                        {fieldErrors.phone}
                      </p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <label
                      className="text-base font-bold text-navy"
                      htmlFor="message"
                    >
                      Nhu cầu tư vấn
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      rows={3}
                      className="rounded-xl border border-line bg-white p-4 text-base text-navy placeholder:text-slate-400 focus:border-navy"
                      placeholder="Chia sẻ thêm về quy mô học sinh hoặc mong muốn của trường"
                    />
                  </div>
                </div>

                {formStatus === "success" ? (
                  <div
                    className="mt-6 flex gap-3 rounded-2xl bg-sage p-4 text-base leading-relaxed text-navy"
                    role="status"
                  >
                    <CheckCircleIcon
                      size={24}
                      weight="fill"
                      className="shrink-0"
                    />
                    <span>
                      <strong>Chúng tôi đã nhận được yêu cầu.</strong>
                      <br />
                      Đội ngũ KinderNewGenz sẽ liên hệ sớm nhất để trao đổi cùng bạn.
                    </span>
                  </div>
                ) : (
                  <>
                    <PrimaryButton
                      type="submit"
                      disabled={formStatus === "loading"}
                      className="mt-7 w-full disabled:cursor-wait disabled:opacity-70"
                    >
                      {formStatus === "loading" ? (
                        <>
                          <span className="size-4 animate-pulse rounded-sm bg-navy/35" />
                          Đang gửi yêu cầu
                        </>
                      ) : (
                        <>
                          Đặt lịch tư vấn{" "}
                          <ArrowUpRightIcon size={18} weight="bold" />
                        </>
                      )}
                    </PrimaryButton>
                    {formStatus === "error" && (
                      <p
                        id="form-error"
                        className="mt-4 text-sm font-semibold text-red-600"
                        role="alert"
                      >
                        {formError}
                      </p>
                    )}
                    <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">
                      Bằng việc gửi biểu mẫu, bạn đồng ý để KinderNewGenz liên hệ về nhu cầu tư vấn.
                    </p>
                  </>
                )}
              </form>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-navy px-5 py-10 text-slate-300 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-8 border-b border-white/15 pb-8 sm:flex-row sm:items-center sm:justify-between">
          <a href="#dau-trang" className="flex items-center gap-3 text-white">
            <span className="grid size-9 place-items-center rounded-xl bg-gold font-extrabold text-navy">
              K
            </span>
            <span className="font-extrabold tracking-tight">KinderNewGenz</span>
          </a>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold">
            {navLinks.map((link) => (
              <a
                className="transition hover:text-gold"
                href={link.href}
                key={link.href}
              >
                {link.label}
              </a>
            ))}
            <a className="transition hover:text-gold" href="#tu-van">
              Đặt lịch tư vấn
            </a>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 pt-6 text-xs sm:flex-row sm:justify-between">
          <p>
            © 2026 KinderNewGenz. Nền tảng quản lý trường mầm non toàn diện.
          </p>
          <div className="flex flex-wrap gap-4">
            <a className="hover:text-gold" href="#chinh-sach">
              Chính sách bảo mật trẻ em
            </a>
            <a className="hover:text-gold" href="#dieu-khoan">
              Điều khoản sử dụng
            </a>
            <a className="hover:text-gold" href="mailto:hello@kindernewgenz.vn">
              <EnvelopeSimpleIcon className="inline" size={14} /> Email
            </a>
            <a className="hover:text-gold" href="tel:+842871234567">
              <PhoneIcon className="inline" size={14} /> Tư vấn
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
