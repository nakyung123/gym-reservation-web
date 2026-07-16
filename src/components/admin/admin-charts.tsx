"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AdminReservationTrendPoint } from "@/lib/admin/admin-overview-client";
import { formatGymPrice } from "@/lib/gym-utils";
import { reservationStatusLabel } from "@/components/reservation/reservation-ticket";

// 관리자 차트 색 SSOT. 상태별로 색을 분리한다(예약=퍼플·이용 완료=에메랄드·취소=로즈).
// 정산 차트의 주인공 막대는 퍼플(accent), 예약가치 context 라인만 회색(neutral)으로 de-emphasis.
// dataviz 검증: 대비 3:1 이상·CVD 분리 고려. (차트는 정적 상수라 CSS 변수 대신 팔레트 값을 직접 둔다.)
export const ADMIN_CHART_COLORS = {
  reserved: "#5f43ff", // 퍼플 (예약)
  used: "#10b981", // 에메랄드 (이용 완료)
  cancelled: "#f43f5e", // 로즈 (취소)
  accent: "#5f43ff", // 정산 막대(주인공) = 퍼플
  neutral: "#767676", // 회색 라인(정산 예약가치 context, de-emphasis)
  grid: "#ececf1", // admin --border-base
  tick: "#767676", // admin --subtle
} as const;

// recharts 공용 스타일(축·그리드는 눈에 띄지 않게, 데이터가 주인공).
export const adminChartAxisProps = {
  tick: { fontSize: 11, fill: ADMIN_CHART_COLORS.tick },
  axisLine: false,
  tickLine: false,
} as const;

export const adminChartTooltipStyle = {
  contentStyle: {
    borderRadius: 10,
    border: "1px solid #ececf1",
    fontSize: 12,
    boxShadow: "none", // 그림자 금지(플랫)
  },
  labelStyle: { fontWeight: 600, color: "#111111" },
  cursor: { fill: "rgba(95, 67, 255, 0.08)" }, // 퍼플 틴트 hover
} as const;

// "MM-DD"로 축약(연도는 헤더 문맥이 이미 제공).
function shortDate(date: string): string {
  return date.slice(5);
}

type ReservationTrendChartProps = {
  trend: AdminReservationTrendPoint[];
};

// 월별 매출 추이 포인트(매출/정산 화면 차트용).
export type MonthlyRevenuePoint = {
  // "YYYY-MM"
  month: string;
  used: number;
  expected: number;
};

type MonthlyRevenueChartProps = {
  points: MonthlyRevenuePoint[];
  usedLabel: string;
  expectedLabel: string;
};

// 월별 매출 추이. 확정 매출(이용 완료)=퍼플 막대가 주인공, 예약가치 합계=회색 라인은
// 문맥(emphasis 패턴: 1 hue + gray).
export function MonthlyRevenueChart({
  points,
  usedLabel,
  expectedLabel,
}: MonthlyRevenueChartProps) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={points}
          margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
        >
          <CartesianGrid
            vertical={false}
            stroke={ADMIN_CHART_COLORS.grid}
            strokeDasharray="3 3"
          />
          <XAxis dataKey="month" {...adminChartAxisProps} />
          <YAxis
            width={72}
            tickFormatter={(value: number) => formatGymPrice(value)}
            {...adminChartAxisProps}
          />
          <Tooltip
            {...adminChartTooltipStyle}
            formatter={(value) => formatGymPrice(Number(value))}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            iconType="circle"
            iconSize={8}
          />
          <Bar
            dataKey="used"
            name={usedLabel}
            fill={ADMIN_CHART_COLORS.accent}
            radius={[2, 2, 0, 0]}
            maxBarSize={40}
          />
          <Line
            dataKey="expected"
            name={expectedLabel}
            stroke={ADMIN_CHART_COLORS.neutral}
            strokeWidth={2}
            dot={{ r: 3 }}
            type="monotone"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export type GymRevenueDatum = {
  gymName: string;
  used: number;
};

type GymRevenueBarChartProps = {
  data: GymRevenueDatum[];
};

// 이 개수를 넘는 시설은 "기타"로 합산한다(범주 과다 방지).
export const GYM_REVENUE_CHART_MAX_BARS = 8;

// 시설별 확정 매출 가로 막대. 명목 범주라 단일 hue(퍼플)에 직접 값 라벨을 단다.
export function GymRevenueBarChart({ data }: GymRevenueBarChartProps) {
  // 행당 32px + 여백. 데이터 수에 맞춰 높이를 계산해 막대가 뭉개지지 않게 한다.
  const height = Math.max(120, data.length * 32 + 24);
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 88, bottom: 0, left: 8 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="gymName"
            width={140}
            {...adminChartAxisProps}
          />
          <Tooltip
            {...adminChartTooltipStyle}
            formatter={(value) => formatGymPrice(Number(value))}
          />
          <Bar
            dataKey="used"
            fill={ADMIN_CHART_COLORS.accent}
            radius={[0, 2, 2, 0]}
            maxBarSize={20}
          >
            <LabelList
              dataKey="used"
              position="right"
              formatter={(value) => formatGymPrice(Number(value))}
              style={{ fontSize: 11, fill: "#505050" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// 일별 예약 상태 추이. 스택 막대 대신 상태별 선 3개로 분리해 각 흐름을 겹침 없이 비교한다.
export function ReservationTrendChart({ trend }: ReservationTrendChartProps) {
  return (
    <div className="h-56 w-full" aria-hidden={false}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={trend}
          margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
        >
          <CartesianGrid
            vertical={false}
            stroke={ADMIN_CHART_COLORS.grid}
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            interval="preserveStartEnd"
            {...adminChartAxisProps}
          />
          <YAxis allowDecimals={false} {...adminChartAxisProps} />
          <Tooltip
            {...adminChartTooltipStyle}
            labelFormatter={(label) => String(label)}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            iconType="plainline"
            iconSize={16}
          />
          <Line
            dataKey="reserved"
            name={reservationStatusLabel.reserved}
            stroke={ADMIN_CHART_COLORS.reserved}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            type="monotone"
          />
          <Line
            dataKey="used"
            name={reservationStatusLabel.used}
            stroke={ADMIN_CHART_COLORS.used}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            type="monotone"
          />
          <Line
            dataKey="cancelled"
            name={reservationStatusLabel.cancelled}
            stroke={ADMIN_CHART_COLORS.cancelled}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            type="monotone"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
