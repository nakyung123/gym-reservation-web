-- CreateTable
CREATE TABLE "payments" (
    "id" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "gym_id" VARCHAR(64) NOT NULL,
    "sport" VARCHAR(20) NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "time" VARCHAR(5) NOT NULL,
    "people" INTEGER NOT NULL,
    "phone" VARCHAR(20),
    "payment_method" VARCHAR(20),
    "amount" INTEGER NOT NULL,
    "order_name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "provider_payment_key" VARCHAR(200),
    "hold_key" VARCHAR(255),
    "reservation_id" VARCHAR(64),
    "failure_reason" VARCHAR(200),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_payment_key_key" ON "payments"("provider_payment_key");

-- CreateIndex
CREATE UNIQUE INDEX "payments_hold_key_key" ON "payments"("hold_key");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reservation_id_key" ON "payments"("reservation_id");

-- CreateIndex
CREATE INDEX "idx_payment_status_expires" ON "payments"("status", "expires_at");

-- CreateIndex
CREATE INDEX "idx_payment_user_created" ON "payments"("user_id", "created_at" DESC);


-- RLS deny-default (기존 테이블과 같은 패턴). FORCE는 붙이지 않는다(owner인 Prisma 트래픽이 막힘).
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
