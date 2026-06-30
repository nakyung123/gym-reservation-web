// 로딩 화면(app/loading.tsx) 디자인 확인용 미리보기. 실제 로딩은 순식간에 끝나
// 디자인을 보기 어려우므로, 이 라우트(/loading-preview)에서 같은 화면을 계속 띄운다.
// 배포 전 제거하거나 남겨둬도 무방하다(실 사용 흐름과 무관한 개발용 페이지).
import Loading from "@/app/loading";

export const metadata = {
  title: "로딩 미리보기 — 서울체육예약",
};

export default function LoadingPreviewPage() {
  return <Loading />;
}
