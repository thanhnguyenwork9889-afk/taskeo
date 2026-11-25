import { addDays, toISODate } from "@/domain/dates";
import type { Activity, CalendarEvent, Priority, Space, Task, TaskStatus, WorkspaceFile, WorkspaceState } from "@/domain/types";

// Dữ liệu mẫu cho chế độ demo, lấy từ prototype. Ngày tháng tính tương đối theo hôm nay.

const SPACES: Omit<Space, "driveFolderId">[] = [
  { id: "sp-viewix", name: "Viewix Factory", description: "Sáng tạo những trải nghiệm khác biệt", color: "#8B73D5", tint: "#F0ECFA", icon: "palette" },
  { id: "sp-retail", name: "Smart Retail", description: "Giải pháp bán lẻ thông minh", color: "#4C9C86", tint: "#E9F4EF", icon: "shopping" },
  { id: "sp-ielts", name: "IELTS", description: "Mỗi ngày tiến gần hơn đến mục tiêu", color: "#D6A243", tint: "#FCF4E2", icon: "graduation" },
  { id: "sp-service", name: "Thợ Điện Lạnh", description: "Vận hành & phát triển dịch vụ", color: "#598FD0", tint: "#EBF2FC", icon: "wrench" },
];

const PROJECTS = [
  { id: "pj-web", spaceId: "sp-viewix", name: "Website redesign", description: "Thiết kế trải nghiệm mới cho website Viewix." },
  { id: "pj-brand", spaceId: "sp-viewix", name: "Brand identity", description: "Xây dựng bản sắc thương hiệu nhất quán." },
  { id: "pj-blog", spaceId: "sp-viewix", name: "Viewix Content (Blog)", description: "Từ ý tưởng đến bài viết — cùng tạo nên những nội dung có giá trị." },
  { id: "pj-sales", spaceId: "sp-retail", name: "Quản lý bán hàng", description: "Theo dõi doanh thu và tồn kho." },
  { id: "pj-ielts", spaceId: "sp-ielts", name: "Road to 7.0", description: "Lộ trình luyện thi IELTS 7.0." },
  { id: "pj-ops", spaceId: "sp-service", name: "Vận hành dịch vụ", description: "Lịch bảo trì và chăm sóc khách hàng." },
];

type TaskSeed = [id: string, title: string, projectId: string, status: TaskStatus, priority: Priority, dueOffset: number | null];

const TASKS: TaskSeed[] = [
  ["t-1", "Hoàn thiện thiết kế landing page", "pj-web", "IN_PROGRESS", "HIGH", 0],
  ["t-2", "Cập nhật báo cáo doanh thu", "pj-sales", "TODO", "MEDIUM", 1],
  ["t-3", "Luyện Writing Task 2", "pj-ielts", "DONE", "MEDIUM", 0],
  ["t-4", "Gửi proposal cho khách hàng", "pj-brand", "DONE", "HIGH", 0],
  ["t-5", "Kiểm tra lịch bảo trì tuần này", "pj-ops", "DONE", "LOW", 0],
  ["t-6", "Nghiên cứu người dùng", "pj-web", "DONE", "MEDIUM", 3],
  ["t-7", "Sắp xếp thư mục dự án", "pj-sales", "DONE", "LOW", 3],
  ["t-8", "Đọc tài liệu Listening", "pj-ielts", "TODO", "LOW", 3],
  ["t-9", "Duyệt kế hoạch tháng", "pj-ops", "TODO", "URGENT", -1],
  ["t-101", "Lên ý tưởng chủ đề blog tháng này", "pj-blog", "DONE", "MEDIUM", 0],
  ["t-102", "Nghiên cứu từ khóa & lập content brief", "pj-blog", "DONE", "HIGH", 0],
  ["t-103", "Viết bài: Xu hướng thiết kế website", "pj-blog", "IN_PROGRESS", "HIGH", 0],
  ["t-104", "Thiết kế hình ảnh minh họa bài viết", "pj-blog", "TODO", "MEDIUM", 1],
  ["t-105", "Tối ưu SEO và lên lịch xuất bản", "pj-blog", "TODO", "LOW", 3],
  ["t-106", "Chờ duyệt nội dung từ đối tác", "pj-blog", "PAUSED", "MEDIUM", 3],
];

type FileSeed = [id: string, name: string, kind: WorkspaceFile["kind"], projectId: string, minutesAgo: number];

const FILES: FileSeed[] = [
  ["f-1", "Kế hoạch phát triển Q3", "doc", "pj-web", 10],
  ["f-2", "Báo cáo doanh thu tháng 5", "sheet", "pj-sales", 35],
  ["f-3", "Brand strategy", "slide", "pj-brand", 60],
  ["f-4", "Kế hoạch nội dung Blog", "doc", "pj-blog", 180],
  ["f-5", "Bộ từ khóa & lịch xuất bản", "sheet", "pj-blog", 300],
  ["f-6", "Định hướng hình ảnh Blog", "slide", "pj-blog", 1440],
];

/** Số việc hoàn thành mẫu cho 6 ngày trước hôm nay (biểu đồ 7 ngày). */
const PAST_COMPLETIONS = [2, 4, 3, 6, 4, 5];

export const SAMPLE_EVENTS: CalendarEvent[] = [
  { id: "ev-1", start: "09:00", end: "10:00", title: "Họp kế hoạch tuần", subtitle: "Viewix Factory", color: "#7960CE" },
  { id: "ev-2", start: "14:00", end: "15:30", title: "Review thiết kế website", subtitle: "Website redesign", color: "#4C91C9" },
  { id: "ev-3", start: "19:00", end: "20:00", title: "Luyện IELTS Speaking", subtitle: "Road to 7.0", color: "#CB9840" },
];

function pastActivities(now: Date): Activity[] {
  return PAST_COMPLETIONS.flatMap((count, index) => {
    const day = new Date(now);
    day.setDate(day.getDate() - (PAST_COMPLETIONS.length - index));
    day.setHours(10, 0, 0, 0);
    return Array.from({ length: count }, (_, n) => ({
      id: `act-seed-${index}-${n}`,
      type: "task_done" as const,
      entityId: null,
      message: "Hoàn thành công việc",
      createdAt: day.toISOString(),
    }));
  });
}

export function createSeedState(now: Date): WorkspaceState {
  const today = toISODate(now);
  const nowIso = now.toISOString();
  const projectSpace = new Map(PROJECTS.map((p) => [p.id, p.spaceId]));

  const tasks: Task[] = TASKS.map(([id, title, projectId, status, priority, dueOffset]) => ({
    id,
    title,
    projectId,
    spaceId: projectSpace.get(projectId) ?? null,
    status,
    priority,
    description: "",
    dueDate: dueOffset === null ? null : addDays(today, dueOffset),
    completedAt: status === "DONE" ? nowIso : null,
    addToCalendar: false,
    linkedFileIds: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  }));

  const files: WorkspaceFile[] = FILES.map(([id, name, kind, projectId, minutesAgo]) => ({
    id,
    name,
    kind,
    projectId,
    spaceId: projectSpace.get(projectId) ?? SPACES[0].id,
    modifiedAt: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
    url: null,
  }));

  const todayDone: Activity[] = tasks
    .filter((t) => t.status === "DONE")
    .map((t) => ({ id: `act-${t.id}`, type: "task_done", entityId: t.id, message: "Hoàn thành công việc", createdAt: nowIso }));

  return {
    version: 1,
    spaces: SPACES.map((s) => ({ ...s, driveFolderId: null })),
    projects: PROJECTS.map((p) => ({ ...p, status: p.id === "pj-brand" ? "ON_HOLD" : "ACTIVE", dueDate: addDays(today, 7) })),
    tasks,
    files,
    activities: [...pastActivities(now), ...todayDone],
  };
}
