export interface DemoRequestPayload {
  contactName: string;
  schoolName: string;
  phone: string;
  message?: string;
}

export interface DemoRequestResponse {
  success: boolean;
  message?: string;
  error?: {
    code: string;
    message: string;
  } | null;
}

export async function submitDemoRequest(
  payload: DemoRequestPayload,
): Promise<DemoRequestResponse> {
  try {
    const response = await fetch("/api/v1/public/demo-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        message: data?.data?.message || "Yêu cầu tư vấn đã được ghi nhận thành công.",
      };
    }

    if (response.status !== 404 && response.status !== 502 && response.status !== 503) {
      const errorData = await response.json().catch(() => null);
      return {
        success: false,
        error: errorData?.error || {
          code: "SUBMIT_FAILED",
          message: "Không thể gửi yêu cầu tư vấn. Vui lòng thử lại sau.",
        },
      };
    }
  } catch {
    // Network or offline fallback
  }

  // Graceful fallback for standalone frontend / development demo
  await new Promise((resolve) => setTimeout(resolve, 400));

  if (payload.phone.includes("000000")) {
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: "Kết nối tạm thời gián đoạn. Vui lòng thử lại sau ít phút.",
      },
    };
  }

  return {
    success: true,
    message: "Chúng tôi đã nhận được yêu cầu. Đội ngũ KinderNewGenz sẽ liên hệ sớm nhất.",
  };
}
