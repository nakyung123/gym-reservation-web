"use client";

import { calculateGymDistanceKm, formatDistanceKm } from "@/lib/distance";
import { useUserLocation } from "@/hooks/use-user-location";

// 체육관 상세 페이지에서 거리 표시 영역. 사용자 위치가 없거나 체육관 좌표가 없으면
// 아무것도 렌더하지 않는다 (요구사항: 위치 있을 때만 거리 표시).
export function GymDistanceBadge({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const { location } = useUserLocation();
  const km = calculateGymDistanceKm({ latitude, longitude }, location);
  if (km === null) return null;
  return (
    <div className="rounded-md border border-accent/20 bg-accent-tint px-4 py-3">
      <p className="text-xs font-semibold text-accent-strong">거리</p>
      <p className="mt-1 text-lg font-bold text-accent-strong">
        {formatDistanceKm(km)}
      </p>
    </div>
  );
}
