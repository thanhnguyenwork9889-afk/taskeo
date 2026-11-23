import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    instantInsights: {
      // Chế độ demo: dữ liệu nằm trên trình duyệt, server chỉ render khung chờ nên trang nào
      // cũng bị báo "dropped". Tạm chỉ kiểm tra segment có khai báo `instant`.
      // Giai đoạn 2 (dữ liệu từ Prisma, render phía server): đổi lại thành "warning".
      validationLevel: "manual-warning",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
