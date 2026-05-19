-- CreateTable
CREATE TABLE "gyms" (
    "id" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "region" VARCHAR(100) NOT NULL,
    "address" VARCHAR(300) NOT NULL,
    "official_url" VARCHAR(500) NOT NULL,
    "open_hours" VARCHAR(100) NOT NULL,
    "base_price" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "distance_km" DECIMAL(5,2) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "sport_prices" JSONB NOT NULL,
    "facilities" JSONB NOT NULL,
    "available_times" JSONB NOT NULL,
    "closed_days" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "gyms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_sports" (
    "gym_id" VARCHAR(64) NOT NULL,
    "sport" VARCHAR(20) NOT NULL,

    CONSTRAINT "gym_sports_pkey" PRIMARY KEY ("gym_id","sport")
);

-- CreateTable
CREATE TABLE "favorites" (
    "user_id" VARCHAR(64) NOT NULL,
    "gym_id" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("user_id","gym_id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" VARCHAR(64) NOT NULL,
    "nickname" VARCHAR(30),
    "provider" VARCHAR(16),
    "photo_base64" TEXT,
    "preferred_region" VARCHAR(100),
    "preferred_sports" JSONB NOT NULL,
    "reservation_notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "gym_id" VARCHAR(64) NOT NULL,
    "sport" VARCHAR(20) NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "time" VARCHAR(5) NOT NULL,
    "price" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active_key" VARCHAR(255) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_locks" (
    "active_key" VARCHAR(255) NOT NULL,
    "reservation_id" VARCHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_locks_pkey" PRIMARY KEY ("active_key")
);

-- CreateTable
CREATE TABLE "reservation_slots" (
    "gym_id" VARCHAR(64) NOT NULL,
    "sport" VARCHAR(20) NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "time" VARCHAR(5) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "reserved_count" INTEGER NOT NULL DEFAULT 0,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_slots_pkey" PRIMARY KEY ("gym_id","sport","date","time")
);

-- CreateTable
CREATE TABLE "withdrawal_reasons" (
    "id" SERIAL NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "detail" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawal_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_attempts" (
    "attempt_id" VARCHAR(64) NOT NULL,
    "provider" VARCHAR(16) NOT NULL,
    "state" VARCHAR(128) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_attempts_pkey" PRIMARY KEY ("attempt_id")
);

-- CreateTable
CREATE TABLE "auth_handover_tickets" (
    "ticket_id" VARCHAR(64) NOT NULL,
    "target_uid" VARCHAR(64) NOT NULL,
    "provider" VARCHAR(16) NOT NULL,
    "handover_nonce" VARCHAR(128) NOT NULL,
    "profile_payload" JSONB,
    "status" VARCHAR(16) NOT NULL,
    "finalize_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_finalize_error" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_handover_tickets_pkey" PRIMARY KEY ("ticket_id")
);

-- CreateIndex
CREATE INDEX "idx_favorites_user" ON "favorites"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_nickname_key" ON "user_profiles"("nickname");

-- CreateIndex
CREATE INDEX "idx_res_user_created" ON "reservations"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "reservation_locks_reservation_id_key" ON "reservation_locks"("reservation_id");

-- CreateIndex
CREATE INDEX "idx_res_slots_gym_date" ON "reservation_slots"("gym_id", "date");

-- CreateIndex
CREATE INDEX "idx_withdrawal_created" ON "withdrawal_reasons"("created_at");

-- CreateIndex
CREATE INDEX "idx_oauth_attempt_expires" ON "oauth_attempts"("expires_at");

-- CreateIndex
CREATE INDEX "idx_auth_ticket_expires" ON "auth_handover_tickets"("expires_at");

-- AddForeignKey
ALTER TABLE "gym_sports" ADD CONSTRAINT "gym_sports_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_locks" ADD CONSTRAINT "reservation_locks_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_slots" ADD CONSTRAINT "reservation_slots_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
