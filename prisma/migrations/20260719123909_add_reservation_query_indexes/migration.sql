-- CreateIndex
CREATE INDEX "idx_res_slots_date" ON "reservation_slots"("date");

-- CreateIndex
CREATE INDEX "idx_res_date_status" ON "reservations"("date", "status");

-- CreateIndex
CREATE INDEX "idx_res_gym_date" ON "reservations"("gym_id", "date");
