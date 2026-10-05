/**
 * Vercel 배포 전용 빌드 스크립트.
 * Vercel의 Node.js 함수 빌더는 "type":"module" 환경에서 TS를 번들링 없이 그대로 올려서,
 * 상대경로 import("../src/lib/http" 등 확장자 없음)를 네이티브 ESM 로더가 못 찾는 문제가 있다
 * (ERR_MODULE_NOT_FOUND). 그래서 api/index.ts + 그 안의 src/** 상대 import 전체를
 * esbuild로 하나의 파일로 미리 번들링해서 api/index.js로 내보낸다.
 * node_modules 패키지(hono, postgres, @supabase/supabase-js, zod)는 external로 두어
 * 그대로 node_modules에서 정상 해석되게 한다 (상대경로가 아니므로 ESM에서도 문제없음).
 *
 * 이 스크립트는 Vercel의 빌드 컨테이너(원격, 임시)에서만 실행된다 — 로컬 저장소의
 * api/index.ts는 그대로 유지되고 로컬 개발(dev:local)에는 영향 없다.
 */
import { build } from "esbuild";
import { readFileSync, rmSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
const external = Object.keys(pkg.dependencies ?? {});

await build({
  entryPoints: ["api/index.ts"],
  outfile: "api/index.js",
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  external,
  logLevel: "info",
});

// 번들된 index.js와 원본 index.ts가 api/ 안에 같이 있으면 Vercel이 둘 다 함수로
// 인식해 충돌할 수 있으므로, 번들링이 끝난 뒤 원본 .ts는 제거한다 (빌드 컨테이너 한정).
rmSync(new URL("../api/index.ts", import.meta.url));

console.log("빌드 완료: api/index.ts -> api/index.js (번들)");
