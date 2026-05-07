# Firestore 체육관 초기 데이터

`NEXT_PUBLIC_GYM_DATA_SOURCE=firestore`로 전환하기 전에 `gyms` 컬렉션에
초기 체육관 데이터를 넣습니다.

seed 데이터의 기준 파일은 `src/data/gyms.json`입니다. 앱의 mock 체육관
데이터와 Firestore seed 스크립트가 같은 파일을 사용합니다.

주의할 점:

- 서비스 계정 키 JSON은 절대 커밋하거나 공유하지 않습니다.
- 서비스 계정 키를 프로젝트 폴더에 잠시 두더라도 `.gitignore`에 걸리게
  `*-firebase-adminsdk-*.json` 또는 `service-account*.json` 이름을 사용합니다.
- seed 스크립트는 `gyms/{id}` 문서를 같은 id의 JSON 데이터로 저장합니다.
- 문서 id와 문서 안의 `id` 값은 반드시 같아야 합니다.
- `basePrice`, `distanceKm`, `sportPrices` 값은 number 타입으로 입력합니다.
- `sports`, `facilities`, `availableTimes`, `closedDays`는 array 타입입니다.
- `sportPrices`는 map 타입입니다.

## 서비스 계정 키 준비

1. Firebase 콘솔에서 프로젝트로 이동합니다.
2. 왼쪽 상단 톱니바퀴 아이콘을 누르고 **프로젝트 설정**으로 이동합니다.
3. **서비스 계정** 탭을 엽니다.
4. **새 비공개 키 생성**을 눌러 Admin SDK용 JSON 키를 내려받습니다.
5. 내려받은 키는 안전한 로컬 폴더에 보관합니다.

## seed 실행

먼저 입력 데이터 검증만 실행합니다.

```bash
npm run seed:gyms -- --service-account "C:\path\to\service-account.json" --dry-run
```

검증이 통과하면 Firestore에 저장합니다.

```bash
npm run seed:gyms -- --service-account "C:\path\to\service-account.json"
```

`GOOGLE_APPLICATION_CREDENTIALS` 환경변수를 이미 설정했다면
`--service-account` 옵션 없이 실행할 수도 있습니다.

```bash
npm run seed:gyms
```

## 전환 확인

1. Firebase 콘솔에서 `gyms` 컬렉션에 문서 3개가 생겼는지 확인합니다.
2. Firestore Rules에 `gyms` 공개 read 규칙을 적용합니다.
3. `.env.local`에서 `NEXT_PUBLIC_GYM_DATA_SOURCE=firestore`로 설정합니다.
4. `npm run dev`를 다시 시작합니다.
5. `http://localhost:3000`, `/gyms`, `/gyms/cheongun-gym`,
   `/reserve/cheongun-gym`, `/reservations`에서 체육관 정보가 이전과 같게
   보이는지 확인합니다.
