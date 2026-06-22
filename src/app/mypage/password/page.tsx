import { redirect } from "next/navigation";

// 비밀번호 변경은 마이페이지 '회원정보변경' 탭 안으로 인라인됐다. 기존 진입은 그 탭으로 보낸다.
export default function PasswordChangePage() {
  redirect("/mypage?tab=info");
}
