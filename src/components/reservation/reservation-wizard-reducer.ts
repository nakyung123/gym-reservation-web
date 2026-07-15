/**
 * 예약 위저드의 "단계 진행" 상태를 한곳에서 관리하는 리듀서.
 *
 * 예약 폼은 종목 → 달력 → 인원 → 예약자 정보 → 약관 → 결제 순으로 진행되며,
 * 각 단계에서 "선택완료를 누르면 현재 섹션을 접고 다음 섹션을 편다"는 규칙이
 * 반복된다. 이 전이 규칙을 컴포넌트 곳곳의 setState 조합으로 흩어 두면
 * 조합 실수로 "다음 단계가 안 열리는" 류의 버그가 나기 쉬워서 리듀서로 모은다.
 *
 * 여기서 다루는 것은 진행 상태(어느 섹션이 열렸는지 + 확정 플래그)뿐이다.
 * 선택 값(종목·날짜·시간·인원·결제수단·약관 체크)은 파생 계산에 쓰이므로
 * 컴포넌트의 개별 상태로 남겨 둔다.
 */

/** 위저드 섹션 식별자(진행 순서와 동일). */
export type WizardSection =
  | "sport"
  | "date"
  | "people"
  | "profile"
  | "terms"
  | "payment";

export type WizardState = {
  /** 섹션별 펼침 여부. */
  openSections: Record<WizardSection, boolean>;
  /** 종목 선택완료 여부(달력 조회 게이트). */
  sportConfirmed: boolean;
  /** 달력 조회하기가 한 번이라도 성공했는지(성공 후 버튼 숨김). */
  calendarRevealed: boolean;
  /** 이용 인원 확정 여부(접힘 요약 노출 조건). */
  peopleConfirmed: boolean;
  /** 예약자 정보 확정 여부(접힘 요약 노출 조건). */
  profileConfirmed: boolean;
  /** 종목 미선택 상태로 다음 단계를 시도했을 때 선택완료 버튼을 빨갛게 강조. */
  sportError: boolean;
};

export type WizardAction =
  /** 종목을 바꿈: 선택완료를 다시 눌러야 달력 조회가 가능하도록 확정 해제. */
  | { type: "SELECT_SPORT" }
  /** 종목 미선택 상태로 다음 단계를 시도: 선택완료 버튼 빨간 강조. */
  | { type: "SPORT_ERROR" }
  /** 종목 확정: 강조 해제 + 종목 섹션 접기. */
  | { type: "CONFIRM_SPORT" }
  /** 달력 조회: 달력을 노출하고 종목을 접으며 예약 일자 섹션을 편다. */
  | { type: "REVEAL_CALENDAR" }
  /** 예약 일자 단계 완료: 일자 접고 인원 열기. */
  | { type: "CONFIRM_DATE" }
  /** 인원 확정: 인원 접고 예약자 정보 열기. */
  | { type: "CONFIRM_PEOPLE" }
  /** 예약자 정보 확정: 정보 접고 약관 열기. */
  | { type: "CONFIRM_PROFILE" }
  /** 필수 약관 전체 동의: 약관 접고 결제 수단 열기. */
  | { type: "OPEN_PAYMENT" }
  /** 사용자가 섹션 헤더를 직접 눌러 펼침/접힘을 토글. */
  | { type: "TOGGLE_SECTION"; section: WizardSection; open: boolean };

/**
 * 초기 상태.
 * 딥링크(?sport=)로 들어오면 종목이 이미 확정된 것으로 보고 달력까지 열어 둔다.
 */
export function createWizardInitialState(hasInitialSport: boolean): WizardState {
  return {
    openSections: {
      sport: true,
      date: hasInitialSport,
      people: false,
      profile: false,
      terms: false,
      payment: false,
    },
    sportConfirmed: hasInitialSport,
    calendarRevealed: hasInitialSport,
    peopleConfirmed: false,
    profileConfirmed: false,
    sportError: false,
  };
}

export function wizardReducer(
  state: WizardState,
  action: WizardAction,
): WizardState {
  switch (action.type) {
    case "SELECT_SPORT":
      // 종목을 바꾸면 이후 단계(달력 조회·일자·인원·정보·약관·결제)를 모두 초기화한다.
      // 종목별 정원·가격·시간대가 달라지므로, 다시 종목 확정 → 달력 조회부터 진행하게 한다.
      return {
        ...state,
        sportConfirmed: false,
        calendarRevealed: false,
        peopleConfirmed: false,
        profileConfirmed: false,
        openSections: {
          ...state.openSections,
          date: false,
          people: false,
          profile: false,
          terms: false,
          payment: false,
        },
      };
    case "SPORT_ERROR":
      return { ...state, sportError: true };
    case "CONFIRM_SPORT":
      return {
        ...state,
        sportConfirmed: true,
        sportError: false,
        openSections: { ...state.openSections, sport: false },
      };
    case "REVEAL_CALENDAR":
      return {
        ...state,
        calendarRevealed: true,
        openSections: { ...state.openSections, sport: false, date: true },
      };
    case "CONFIRM_DATE":
      return {
        ...state,
        openSections: { ...state.openSections, date: false, people: true },
      };
    case "CONFIRM_PEOPLE":
      return {
        ...state,
        peopleConfirmed: true,
        openSections: { ...state.openSections, people: false, profile: true },
      };
    case "CONFIRM_PROFILE":
      return {
        ...state,
        profileConfirmed: true,
        openSections: { ...state.openSections, profile: false, terms: true },
      };
    case "OPEN_PAYMENT":
      return {
        ...state,
        openSections: { ...state.openSections, terms: false, payment: true },
      };
    case "TOGGLE_SECTION":
      return {
        ...state,
        openSections: {
          ...state.openSections,
          [action.section]: action.open,
        },
      };
    default:
      return state;
  }
}
