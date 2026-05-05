# Firestore Rules 초안

Anonymous Auth 연결 이후에는 예약 문서를 `auth.uid` 기준으로 제한합니다.
아래 규칙은 현재 클라이언트 구조에 맞춘 개발용 초안입니다.

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function lockBelongsToUser(lockId) {
      return lockId.matches('^' + request.auth.uid + '__.*');
    }

    match /reservations/{reservationId} {
      allow read: if signedIn() && resource.data.userId == request.auth.uid;

      allow create: if signedIn()
        && request.resource.data.id == reservationId
        && request.resource.data.userId == request.auth.uid
        && request.resource.data.status == "reserved";

      allow update: if signedIn()
        && resource.data.userId == request.auth.uid
        && request.resource.data.userId == resource.data.userId
        && request.resource.data.id == resource.data.id
        && request.resource.data.gymId == resource.data.gymId
        && request.resource.data.sport == resource.data.sport
        && request.resource.data.date == resource.data.date
        && request.resource.data.time == resource.data.time
        && request.resource.data.price == resource.data.price
        && request.resource.data.createdAt == resource.data.createdAt
        && request.resource.data.activeKey == resource.data.activeKey
        && resource.data.status == "reserved"
        && request.resource.data.status == "cancelled";
    }

    match /reservationLocks/{lockId} {
      allow get: if signedIn() && lockBelongsToUser(lockId);

      allow create: if signedIn()
        && lockBelongsToUser(lockId)
        && request.resource.data.activeKey == lockId
        && request.resource.data.status == "reserved";

      allow delete: if signedIn()
        && lockBelongsToUser(lockId)
        && resource.data.activeKey == lockId;
    }
  }
}
```
