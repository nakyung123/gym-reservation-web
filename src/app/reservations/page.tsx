import { redirect } from "next/navigation";

// 예약 조회는 마이페이지 '예약내역' 탭으로 통합됐다(A 통합). 기존 진입은 마이페이지로 보낸다.
export default function ReservationsPage() {
  redirect("/mypage");
}
