import Papa from "papaparse";

export function reportToCsv(type: string, result: any): string {
  if (!result) return "";
  let rows: Record<string, any>[] = [];

  if (type === "tuition") {
    const histories = result.histories || [];
    rows = histories.map((h: any) => ({
      "Mã học sinh": h.studentId,
      "Tên học sinh": h.studentName || "",
      "Tháng": h.month || "",
      "Tổng học phí (VNĐ)": h.totalFees,
      "Giảm trừ (VNĐ)": h.totalReduction,
      "Phải thu (VNĐ)": h.finalAmount,
      "Trạng thái": h.state || "",
    }));

    if (result.summary) {
      rows.push({
        "Mã học sinh": "TỔNG CỘNG",
        "Tên học sinh": `${result.summary.totalRecords} bản ghi`,
        "Tháng": "",
        "Tổng học phí (VNĐ)": result.summary.totalFees,
        "Giảm trừ (VNĐ)": result.summary.totalReduction,
        "Phải thu (VNĐ)": result.summary.totalFinalAmount,
        "Trạng thái": `Đã thu: ${result.summary.totalCollected} | Còn nợ: ${result.summary.outstanding}`,
      });
    }
  } else if (type === "attendance") {
    const records = result.records || [];
    rows = records.map((r: any) => ({
      "Mã học sinh": r.studentId,
      "Tên học sinh": r.studentName || "",
      "Lớp": r.classId || "",
      "Ngày": r.date || "",
      "Trạng thái": r.status === "present" ? "Có mặt" : r.status === "excused" ? "Nghỉ có phép" : "Nghỉ không phép",
      "Giờ tăng ca": r.overtimeHours || "0",
    }));

    if (result.summary) {
      rows.push({
        "Mã học sinh": "TỔNG CỘNG",
        "Tên học sinh": `Tỷ lệ đi học: ${result.summary.attendanceRate}`,
        "Lớp": "",
        "Ngày": `Có mặt: ${result.summary.presentCount} | Vắng có phép: ${result.summary.excusedCount} | Không phép: ${result.summary.unexcusedCount}`,
        "Trạng thái": "",
        "Giờ tăng ca": `${result.summary.totalOvertimeHours} giờ`,
      });
    }
  } else if (type === "nutrition") {
    const sheets = result.sheets || [];
    rows = sheets.map((s: any) => ({
      "Từ ngày": s.startDate || "",
      "Đến ngày": s.endDate || "",
      "Số học sinh": s.totalStudents || 0,
      "Tiền thực phẩm (VNĐ)": s.totalFoodCost || 0,
      "Tiền điện (VNĐ)": s.electricityCost || 0,
      "Tiền ga (VNĐ)": s.gasCost || 0,
      "Tổng dự toán (VNĐ)": s.estimatedTotal || 0,
      "Thực tế chi (VNĐ)": s.actualTotal || s.estimatedTotal || 0,
      "Trạng thái": s.status || "",
    }));

    if (result.summary) {
      rows.push({
        "Từ ngày": "TỔNG CỘNG",
        "Đến ngày": `${result.summary.totalGrocerySheets} phiếu đi chợ | ${result.summary.menuCount} thực đơn`,
        "Số học sinh": "",
        "Tiền thực phẩm (VNĐ)": result.summary.totalFoodCost,
        "Tiền điện (VNĐ)": "",
        "Tiền ga (VNĐ)": "",
        "Tổng dự toán (VNĐ)": result.summary.estimatedTotal,
        "Thực tế chi (VNĐ)": result.summary.actualTotal,
        "Trạng thái": `Điện/Ga: ${result.summary.totalOperatingCosts}`,
      });
    }
  }

  // Thêm UTF-8 BOM để Excel tự động nhận diện tiếng Việt
  return "﻿" + Papa.unparse(rows);
}
