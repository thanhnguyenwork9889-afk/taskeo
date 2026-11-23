import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Ranh giới giữa các lớp trong src/ (xem docs/04-architecture.md).
// Lớp dưới không được import lớp trên; code chạy trên trình duyệt không chạm vào server/.
const LAYER_RULES = [
  {
    files: ["src/config/**"],
    message: "config/ là lớp thấp nhất, chỉ đọc biến môi trường.",
    group: ["@/*"],
  },
  {
    files: ["src/domain/**"],
    message: "domain/ là logic thuần: không phụ thuộc UI, store, server hay route.",
    group: ["@/app/*", "@/server/*", "@/store/*", "@/features/*", "@/components/*", "react", "next/*"],
  },
  {
    files: ["src/store/**", "src/features/**", "src/components/**"],
    message: "Code giao diện không import server/ (trừ server action trong server/auth/actions).",
    regex: "^@/(server/(?!auth/actions$)|app/)",
  },
  {
    files: ["src/components/ui/**"],
    message: "components/ui/ là UI dùng chung, không phụ thuộc feature, layout hay store.",
    group: ["@/features/*", "@/components/layout/*", "@/store/*"],
  },
];

// Mỗi luật dùng `group` (glob) hoặc `regex` (khi cần ngoại lệ, vì phủ định kiểu gitignore
// không mở lại được file nằm trong thư mục đã bị chặn).
const layerConfigs = LAYER_RULES.map(({ files, message, group, regex }) => ({
  files,
  rules: {
    "no-restricted-imports": ["error", { patterns: [regex ? { regex, message } : { group, message }] }],
  },
}));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...layerConfigs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
